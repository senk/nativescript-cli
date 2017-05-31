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
import * as path from "path";
import * as choki from "chokidar";
import * as iOSLs from "./ios-livesync-service";
import * as androidLs from "./android-livesync-service.1";
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

	public async liveSync(
		deviceDescriptors: { identifier: string, buildAction: () => Promise<string>, outputPath?: string }[],
		liveSyncData: { projectDir: string, shouldStartWatcher: boolean, syncAllFiles: boolean }): Promise<void> {
		// TODO: Initialize devicesService before that.
		const projectData = this.$projectDataService.getProjectData(liveSyncData.projectDir);
		await this.initialSync(projectData, deviceDescriptors, liveSyncData);

		this.$injector.resolve("usbLiveSyncService")._isInitialized = true;

		if (liveSyncData.shouldStartWatcher) {
			await this.startWatcher(projectData, deviceDescriptors, liveSyncData);
		}
	}

	// TODO: Register both livesync services in injector
	private getLiveSyncService(platform: string): any {
		if (this.$mobileHelper.isiOSPlatform(platform)) {
			return this.$injector.resolve(iOSLs.RunService);
		} else if (this.$mobileHelper.isAndroidPlatform(platform)) {
			return this.$injector.resolve(androidLs.RunService);
		}

		throw new Error(`Invalid platform ${platform}. Supported platforms are: ${this.$mobileHelper.platformNames.join(", ")}`);
	}

	private async ensureLatestAppPackageIsInstalledOnDevice(device: Mobile.IDevice,
		preparedPlatforms: string[],
		rebuiltInformation: any[],
		projectData: IProjectData,
		deviceBuildInfoDescriptor: { identifier: string, buildAction: () => Promise<string>, outputPath?: string },
		modifiedFiles?: string[]): Promise<void> {

		const platform = device.deviceInfo.platform;
		if (preparedPlatforms.indexOf(platform) === -1) {
			preparedPlatforms.push(platform);
			await this.$platformService.preparePlatform(platform, <any>{}, null, projectData, <any>{}, modifiedFiles);
		}

		const shouldBuild = await this.$platformService.shouldBuild(platform, projectData, <any>{ buildForDevice: !device.isEmulator }, deviceBuildInfoDescriptor.outputPath);
		if (shouldBuild) {
			const pathToBuildItem = await deviceBuildInfoDescriptor.buildAction();
			// Is it possible to return shouldBuild for two devices? What about android device and android emulator?
			rebuiltInformation.push({ isEmulator: device.isEmulator, platform, pathToBuildItem });
		}

		const rebuildInfo = _.find(rebuiltInformation, info => info.isEmulator === device.isEmulator && info.platform === platform);

		if (rebuildInfo) {
			// Case where we have three devices attached, a change that requires build is found,
			// we'll rebuild the app only for the first device, but we should install new package on all three devices.
			await this.$platformService.installApplication(device, { release: false }, projectData, rebuildInfo.pathToBuildItem, deviceBuildInfoDescriptor.outputPath);
		}
	}

	private async initialSync(projectData: IProjectData, deviceDescriptors: { identifier: string, buildAction: () => Promise<string>, outputPath?: string }[],
		liveSyncData: { projectDir: string, shouldStartWatcher: boolean, syncAllFiles: boolean }): Promise<void> {

		const preparedPlatforms: string[] = [];
		const rebuiltInformation: { platform: string, isEmulator: boolean, pathToBuildItem: string }[] = [];

		// Now fullSync
		const deviceAction = async (device: Mobile.IDevice): Promise<void> => {
			// TODO: Call androidDeviceLiveSyncService.beforeLiveSyncAction
			const platform = device.deviceInfo.platform;
			const deviceDescriptor = _.find(deviceDescriptors, deviceDescriptor => deviceDescriptor.identifier === device.deviceInfo.identifier)
			await this.ensureLatestAppPackageIsInstalledOnDevice(device, preparedPlatforms, rebuiltInformation, projectData, deviceDescriptor);

			await this.getLiveSyncService(platform).fullSync(projectData, device);

			await device.applicationManager.restartApplication(projectData.projectId, projectData.projectName);
		};

		await this.$devicesService.execute(deviceAction, (device: Mobile.IDevice) => _.some(deviceDescriptors, deviceDescriptor => deviceDescriptor.identifier === device.deviceInfo.identifier));
	}

	private async startWatcher(projectData: IProjectData,
		deviceDescriptors: { identifier: string, buildAction: () => Promise<string>, outputPath?: string }[],
		liveSyncData: { projectDir: string, shouldStartWatcher: boolean, syncAllFiles: boolean }): Promise<void> {

		let pattern = ["app"];

		if (liveSyncData.syncAllFiles) {
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
					try {
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
							const deviceDescriptor = _.find(deviceDescriptors, deviceDescriptor => deviceDescriptor.identifier === device.deviceInfo.identifier)

							await this.ensureLatestAppPackageIsInstalledOnDevice(device, preparedPlatforms, rebuiltInformation,
								projectData, deviceDescriptor, allModifiedFiles);


							const service = this.getLiveSyncService(device.deviceInfo.platform);
							const settings: any = {
								projectData,
								filesToRemove: currentFilesToRemove,
								filesToSync: currentFilesToSync,
								isRebuilt: !!_.find(rebuiltInformation, info => info.isEmulator === device.isEmulator && info.platform === device.deviceInfo.platform)
							};

							await service.liveSyncWatchAction(device, settings);
						},
							(device: Mobile.IDevice) => _.some(deviceDescriptors, deviceDescriptor => deviceDescriptor.identifier === device.deviceInfo.identifier)
						);
					} catch (err) {
						// TODO: Decide if we should break here.
						//this.$logger.info(`Unable to sync file ${filePath}. Error is:${err.message}`.red.bold);
						this.$logger.info("Try saving it again or restart the livesync operation.");
						// we can remove the descriptor from action:
						const allErrors = err.allErrors;
						console.log(allErrors);
						_.each(allErrors, (deviceError: any) => {
							console.log("for error: ", deviceError, " device ID: ", deviceError.deviceIdentifier);
							removeDeviceDescriptor(deviceError.deviceIdentifier);
						});
					}
				}
			}, 250);
		};

		await this.$hooksService.executeBeforeHooks('watch');

		let watcher = choki.watch(pattern, { ignoreInitial: true, cwd: liveSyncData.projectDir, awaitWriteFinish: { pollInterval: 100, stabilityThreshold: 500 } })
			.on("all", async (event: string, filePath: string) => {

				clearTimeout(timeoutTimer);

				console.log("choki event: ", event, " file: ", filePath);
				filePath = path.join(liveSyncData.projectDir, filePath);
				if (event === "add" || event === "addDir" || event === "change") {
					filesToSync.push(filePath);
				} else if (event === "unlink" || event === "unlinkDir") {
					filesToRemove.push(filePath);
				}

				startTimeout();

			});

		this.$processService.attachToProcessExitSignals(this, () => {
			clearTimeout(timeoutTimer);
			watcher.close();
		});

		const removeDeviceDescriptor = (deviceId: string) => {
			_.remove(deviceDescriptors, descriptor => descriptor.identifier === deviceId);

			if (!deviceDescriptors.length) {
				// WE should kill all of our processes here.
				clearTimeout(timeoutTimer);
				watcher.close();
			}
		}

		this.$devicesService.on("deviceLost", (device: Mobile.IDevice) => {
			removeDeviceDescriptor(device.deviceInfo.identifier);
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
