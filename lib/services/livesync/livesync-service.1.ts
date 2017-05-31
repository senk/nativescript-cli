interface IBuildActionInfo extends IDeviceProjectInfo {
	buildAction: (...args: any[]) => Promise<string>;
}

interface IDeviceProjectInfo {
	deviceIdentifiers: string[];
	projectDir: string;
}

// throttle
// interface IWatcher {
// 	startFsWatch(pattern: string[]): void;
// 	stopFsWatch(pattern: string[]): void;
// }

interface IRunService {
	// prepare + build
	//
	// install + upload hash file
	//
	// livesync without filesToSync (a.k.a fullsync)
	// startFsWatch
	// pray
	run(lsInfo: IBuildActionInfo[], watcherOpts?: { syncAllFiles: boolean, watch: boolean }): Promise<void>[];

	stopRun(lsInfo: IDeviceProjectInfo | string /* projectDir */): Promise<void>[];
	// let shouldWatch = !watcherOpts || watcherOpts.watch;
	// let shouldSyncEveryhting = shouldWatch && watcherOpts && watcherOpts.syncAllFiles
}
import * as deviceAppDataIdentifiers from "../../providers/device-app-data-provider";
import * as path from "path";
import * as choki from "chokidar";
import * as iosdls from "./ios-device-livesync-service";
import * as temp from "temp";
import * as iOSLs from "./ios-livesync-service";
import * as androidLs from "./android-livesync-service";
// import * as uuid from "uuid";

export class RunService implements IRunService {
	constructor(private $platformService: IPlatformService,
		private $projectDataService: IProjectDataService,
		private $devicesService: Mobile.IDevicesService,
		private $mobileHelper: Mobile.IMobileHelper,
		private $nodeModulesDependenciesBuilder: INodeModulesDependenciesBuilder,
		private $logger: ILogger,
		private $processService: IProcessService,
		private $hooksService: IHooksService,
		private $projectChangesService: IProjectChangesService,
		private $injector: IInjector) {

	}

	// TODO: Register both livesync services in injector
	private getLiveSyncService(platform: string): any {
		if (this.$mobileHelper.isiOSPlatform(platform)) {
			return this.$injector.resolve(iOSLs.RunService);
		} else if (this.$mobileHelper.isAndroidPlatform(platform)) {
			return this.$injector.resolve(androidLs.AndroidLiveSyncService);
		}
	}

	private async ensureLatestAppPackageIsInstalledOnDevice(device: Mobile.IDevice,
		preparedPlatforms: string[],
		rebuiltInformation: any[],
		buildAction: (device: Mobile.IDevice) => Promise<string>,
		projectData: IProjectData,
		appFilesUpdaterOptions: IAppFilesUpdaterOptions,
		addPlatformOptions: IAddPlatformCoreOptions,
		outputPath: string,
		isReleaseBuildConfig: boolean,
		modifiedFiles?: string[]): Promise<void> {

		const platform = device.deviceInfo.platform;
		if (preparedPlatforms.indexOf(platform) === -1) {
			preparedPlatforms.push(platform);
			await this.$platformService.preparePlatform(platform, appFilesUpdaterOptions, null, projectData, addPlatformOptions, modifiedFiles);
		}

		const shouldBuild = await this.$platformService.shouldBuild(platform, projectData, <any>{ buildForDevice: !device.isEmulator }, outputPath);
		if (shouldBuild) {
			const pathToBuildItem = await buildAction(device);
			// Is it possible to return shouldBuild for two devices? What about android device and android emulator?
			rebuiltInformation.push({ isEmulator: device.isEmulator, platform, pathToBuildItem });
		}

		const rebuildInfo = _.find(rebuiltInformation, info => info.isEmulator === device.isEmulator && info.platform === platform);

		if (rebuildInfo) {
			// Case where we have three devices attached, a change that requires build is found,
			// we'll rebuild the app only for the first device, but we should install new package on all three devices.
			await this.$platformService.installApplication(device, /* TODO: use it from passed args */ { release: isReleaseBuildConfig }, projectData, rebuildInfo.pathToBuildItem, outputPath);
		}
	}

	private async initialSync(projectData: IProjectData, addPlatformOptions: IAddPlatformCoreOptions,
		syncAllFiles: boolean,
		isReleaseBuildConfig: boolean,
		outputPath: string,
		buildAction: (device: Mobile.IDevice) => Promise<string>,
		projectDir: string,
		appFilesUpdaterOptions: IAppFilesUpdaterOptions): Promise<void> {

		const preparedPlatforms: string[] = [];
		const rebuiltInformation: { platform: string, isEmulator: boolean, pathToBuildItem: string }[] = [];

		// Now fullSync
		const deviceAction = async (device: Mobile.IDevice): Promise<void> => {
			// TODO: Call androidDeviceLiveSyncService.beforeLiveSyncAction
			const platform = device.deviceInfo.platform;
			await this.ensureLatestAppPackageIsInstalledOnDevice(device, preparedPlatforms, rebuiltInformation, buildAction, projectData, appFilesUpdaterOptions, addPlatformOptions, outputPath, isReleaseBuildConfig);

			this.getLiveSyncService(platform).fullSync(/* determine args to be passed here */);

			await device.applicationManager.restartApplication(projectData.projectId, projectData.projectName);
		};

		await this.$devicesService.execute(deviceAction, (device: Mobile.IDevice) => this.$mobileHelper.isiOSPlatform(device.deviceInfo.platform));

	}

	public async liveSync(addPlatformOptions: IAddPlatformCoreOptions,
		syncAllFiles: boolean,
		isReleaseBuildConfig: boolean,
		outputPath: string,
		buildAction: (device: Mobile.IDevice) => Promise<string>,
		projectDir: string,
		appFilesUpdaterOptions: IAppFilesUpdaterOptions,
		shouldStartWatcher?: boolean): Promise<void> {
		// TODO: Initialize devicesService before that.
		const projectData = this.$projectDataService.getProjectData(projectDir);
		await this.initialSync(projectData, addPlatformOptions, syncAllFiles, isReleaseBuildConfig, outputPath, buildAction, projectDir, appFilesUpdaterOptions);
		this.$injector.resolve("usbLiveSyncService")._isInitialized = true;

		if (shouldStartWatcher) {
			await this.startWatcher(projectData, addPlatformOptions, syncAllFiles, isReleaseBuildConfig, outputPath, buildAction, projectDir, appFilesUpdaterOptions);;
		}
	}


	private async startWatcher(projectData: IProjectData, addPlatformOptions: IAddPlatformCoreOptions,
		syncAllFiles: boolean,
		isReleaseBuildConfig: boolean,
		outputPath: string,
		buildAction: (device: Mobile.IDevice) => Promise<string>,
		projectDir: string,
		appFilesUpdaterOptions: IAppFilesUpdaterOptions): Promise<void> {
		let pattern = ["app"];

		if (syncAllFiles) {
			const productionDependencies = this.$nodeModulesDependenciesBuilder.getProductionDependencies(projectData.projectDir);
			pattern.push("package.json");

			// watch only production node_module/packages same one prepare uses
			for (let index in productionDependencies) {
				pattern.push(productionDependencies[index].directory);
			}
		}

		console.log("now starting watcher!", pattern);

		let filesToSync: string[] = [],
			filesToRemove: string[] = [];
		let timeoutTimer: NodeJS.Timer;

		const startTimeout = () => {
			timeoutTimer = setTimeout(async () => {
				if (filesToSync.length || filesToRemove.length) {
					let currentFilesToSync = _.cloneDeep(filesToSync);
					filesToSync = [];
					let currentFilesToRemove = _.cloneDeep(filesToRemove);
					filesToRemove = [];

					const allModifiedFiles = [].concat(currentFilesToSync).concat(currentFilesToRemove);
					// await this.$platformService.preparePlatform("ios", appFilesUpdaterOptions, this.$options.platformTemplate, projectData, this.$options, allModifiedFiles);
					console.log("CURRENT CHANGES AFTER PREPARE!".cyan);
					console.log(this.$projectChangesService.currentChanges);
					console.log("#END CURRENT CHANGES AFTER PREPARE!".cyan);

					const preparedPlatforms: string[] = [];
					const rebuiltInformation: { platform: string, isEmulator: boolean, pathToBuildItem: string }[] = [];
					await this.$devicesService.execute(async (device: Mobile.IDevice) => {
						// const platform = device.deviceInfo.platform;
						await this.ensureLatestAppPackageIsInstalledOnDevice(device, preparedPlatforms, rebuiltInformation,
							buildAction, projectData, appFilesUpdaterOptions, addPlatformOptions, outputPath, isReleaseBuildConfig, allModifiedFiles);


						const service = this.getLiveSyncService(device.deviceInfo.platform);
						const settings: any = {
							filesToRemove: currentFilesToRemove,
							filesToSync: currentFilesToSync,
							isRebuilt: !!_.find(rebuiltInformation, info => info.isEmulator === device.isEmulator && info.platform === device.deviceInfo.platform)
						};

						await service.liveSyncWatchAction(settings);
					},
						(device: Mobile.IDevice) => this.$mobileHelper.isiOSPlatform(device.deviceInfo.platform)
					);
				}
			}, 250);
		};

		await this.$hooksService.executeBeforeHooks('watch');

		let watcher = choki.watch(pattern, { ignoreInitial: true, cwd: projectDir, awaitWriteFinish: { pollInterval: 100, stabilityThreshold: 500 } })
			.on("all", async (event: string, filePath: string) => {
				try {
					clearTimeout(timeoutTimer);

					console.log("choki event: ", event, " file: ", filePath);
					filePath = path.join(projectDir, filePath);
					if (event === "add" || event === "addDir" || event === "change") {
						filesToSync.push(filePath);
					} else if (event === "unlink" || event === "unlinkDir") {
						filesToRemove.push(filePath);
					}

					startTimeout();
				} catch (err) {
					// TODO: Decide if we should break here.
					this.$logger.info(`Unable to sync file ${filePath}. Error is:${err.message}`.red.bold);
					this.$logger.info("Try saving it again or restart the livesync operation.");
				}
			});

		this.$processService.attachToProcessExitSignals(this, () => {
			clearTimeout(timeoutTimer);
			watcher.close();
		});
	}

	public run(lsInfos: IBuildActionInfo[], watcherOpts?: { syncAllFiles: boolean, watch: boolean }): Promise<void>[] {
		_.each(lsInfos, lsInfo => {
			let projectData = this.$projectDataService.getProjectData(lsInfo.projectDir);
			console.log("in each", projectData);
		});
		// const a: IBuildActionInfo = {
		// 	buildAction: (): Promise<string> => {
		// 		this.cloudBuildService.build(,...).then(r => r.outputPath);
		// 	}
		// }
		// prepare
		// build
		// install
		// fullSync
		//
		return [Promise.resolve()];
	}

	public stopRun(lsInfo: IDeviceProjectInfo | string /* projectDir */): Promise<void>[] {
		return [Promise.resolve()];
	}
}
