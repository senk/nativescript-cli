// interface ILiveSyncService1 {
// 	/**
// 	 * Just LiveSync - do not rebuild
// 	 */
// 	/* private */ syncOnDevices(lsInfo: LiveSyncDeviceInfo): Promise<void>[];

// 	/* private */ deleteFiles(lsInfo: LiveSyncDeviceInfo): Promise<void>[];

// 	// fullSync(lsInfo: LiveSyncDeviceInfo): Promise<void>[];
// 	/**
// 	 * Will rebuild in case changes require it.
// 	 */
// 	liveSync(lsInfo: LiveSyncDeviceInfo): Promise<void>[];
// }

// interface LiveSyncDeviceInfo extends IBuildActionInfo {
// 	filesToSync?: string[];  /* absolute or relative? */
// 	action: "delete" | "add" | "full";
// }

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
// import * as uuid from "uuid";

export class RunService implements IRunService {
	constructor(private $platformService: IPlatformService,
		private $projectDataService: IProjectDataService,
		private $devicesService: Mobile.IDevicesService,
		private $options: IOptions,
		private $projectFilesManager: IProjectFilesManager,
		private $platformsData: IPlatformsData,
		private $mobileHelper: Mobile.IMobileHelper,
		private $nodeModulesDependenciesBuilder: INodeModulesDependenciesBuilder,
		private $logger: ILogger,
		private $processService: IProcessService,
		private $projectFilesProvider: IProjectFilesProvider,
		private $fs: IFileSystem,
		private $hooksService: IHooksService,
		private $projectChangesService: IProjectChangesService,
		private $injector: IInjector) {

	}

	private async fullSync(device: Mobile.IDevice, projectFilesPath: string, deviceAppData: Mobile.IDeviceAppData): Promise<void> {
		if (deviceAppData.deviceSyncZipPath) {
			temp.track();
			let tempZip = temp.path({ prefix: "sync", suffix: ".zip" });
			let tempApp = temp.mkdirSync("app");
			this.$logger.trace("Creating zip file: " + tempZip);
			this.$fs.copyFile(path.join(path.dirname(projectFilesPath), "app/*"), tempApp);

			if (!this.$options.syncAllFiles) {
				this.$logger.info("Skipping node_modules folder! Use the syncAllFiles option to sync files from this folder.");
				this.$fs.deleteDirectory(path.join(tempApp, "tns_modules"));
			}

			await this.$fs.zipFiles(tempZip, this.$fs.enumerateFilesInDirectorySync(tempApp), (res) => {
				return path.join("app", path.relative(tempApp, res));
			});

			await device.fileSystem.transferFiles(deviceAppData, [{
				getLocalPath: () => tempZip,
				getDevicePath: () => deviceAppData.deviceSyncZipPath,
				getRelativeToProjectBasePath: () => "../sync.zip",
				deviceProjectRootPath: await deviceAppData.getDeviceProjectRootPath()
			}]);
		} else {
			const localToDevicePaths = await this.$projectFilesManager.createLocalToDevicePaths(deviceAppData, projectFilesPath, null, []);
			await this.transferFiles(deviceAppData, localToDevicePaths, projectFilesPath, true);
		}
	}

	public async liveSynciOS(outputPath: string, buildAction: (device: Mobile.IDevice) => Promise<string>, projectDir?: string): Promise<void> {
		await this.$devicesService.initialize({ platform: "ios", skipDeviceDetectionInterval: true });
		// TODO: Initialize devicesService before that.
		const projectData = this.$projectDataService.getProjectData(projectDir);

		const appFilesUpdaterOptions: IAppFilesUpdaterOptions = { bundle: this.$options.bundle, release: this.$options.release };
		// const deployOptions: IDeployPlatformOptions = {
		// 	clean: this.$options.clean,
		// 	device: this.$options.device,
		// 	emulator: this.$options.emulator,
		// 	projectDir: this.$options.path,
		// 	platformTemplate: this.$options.platformTemplate,
		// 	release: this.$options.release,
		// 	provision: this.$options.provision,
		// 	teamId: this.$options.teamId,
		// 	keyStoreAlias: this.$options.keyStoreAlias,
		// 	keyStoreAliasPassword: this.$options.keyStoreAliasPassword,
		// 	keyStorePassword: this.$options.keyStorePassword,
		// 	keyStorePath: this.$options.keyStorePath
		// };

		// await this.$platformService.deployPlatform("iOS", appFilesUpdaterOptions, deployOptions, projectData, this.$options);

		await this.$platformService.preparePlatform("ios", appFilesUpdaterOptions, this.$options.platformTemplate, projectData, this.$options);

		this.$injector.resolve("usbLiveSyncService")._isInitialized = true;

		// Now fullSync
		const deviceAction = async (device: Mobile.IDevice): Promise<void> => {
			const shouldBuild = await this.$platformService.shouldBuild("ios", projectData, <any>{ buildForDevice: !device.isEmulator }, outputPath);
			if (shouldBuild) {
				const pathToBuildItem = await buildAction(device);
				await this.$platformService.installApplication(device, { release: false }, projectData, pathToBuildItem, outputPath);
			} else {
				let platformData = this.$platformsData.getPlatformData(device.deviceInfo.platform, projectData);
				const deviceAppData = this.$injector.resolve(deviceAppDataIdentifiers.IOSAppIdentifier,
					{ _appIdentifier: projectData.projectId, device, platform: device.deviceInfo.platform });
				// const excludedProjectDirsAndFiles = this.$options.release ? constants.LIVESYNC_EXCLUDED_FILE_PATTERNS : []
				const projectFilesPath = path.join(platformData.appDestinationDirectoryPath, "app");
				// const localToDevicePaths = await this.$projectFilesManager.createLocalToDevicePaths(deviceAppData, projectFilesPath, null, []);
				// await this.transferFiles(deviceAppData, localToDevicePaths, projectFilesPath, true);

				await this.fullSync(device, projectFilesPath, deviceAppData);
				await device.applicationManager.stopApplication(projectData.projectId, projectData.projectName);
			}

			await device.applicationManager.startApplication(projectData.projectId);
		};

		await this.$devicesService.execute(deviceAction, (device: Mobile.IDevice) => this.$mobileHelper.isiOSPlatform(device.deviceInfo.platform));

		let pattern = ["app"];

		if (this.$options.syncAllFiles) {
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
					const allModifiedFiles = [].concat(filesToSync).concat(filesToRemove);
					await this.$platformService.preparePlatform("ios", appFilesUpdaterOptions, this.$options.platformTemplate, projectData, this.$options, allModifiedFiles);
					console.log("CURRENT CHANGES AFTER PREPARE!".cyan);
					console.log(this.$projectChangesService.currentChanges);
					console.log("#END CURRENT CHANGES AFTER PREPARE!".cyan);
					// let buildConfig: IBuildConfig = {
					// 	buildForDevice: false,
					// 	projectDir: deployOptions.projectDir,
					// 	release: deployOptions.release,
					// 	device: deployOptions.device,
					// 	provision: deployOptions.provision,
					// 	teamId: deployOptions.teamId,
					// 	keyStoreAlias: deployOptions.keyStoreAlias,
					// 	keyStoreAliasPassword: deployOptions.keyStoreAliasPassword,
					// 	keyStorePassword: deployOptions.keyStorePassword,
					// 	keyStorePath: deployOptions.keyStorePath,
					// 	clean: deployOptions.clean
					// };

					await this.$devicesService.execute(async (device: Mobile.IDevice) => {
						const shouldBuild = await this.$platformService.shouldBuild("ios", projectData, <any>{ buildForDevice: !device.isEmulator }, outputPath);

						if (shouldBuild) {
							const pathToBuildItem = await buildAction(device);
							await this.$platformService.installApplication(device, { release: false }, projectData, pathToBuildItem, outputPath);
						}
					},
						(device: Mobile.IDevice) => this.$mobileHelper.isiOSPlatform(device.deviceInfo.platform)
					);


					if (filesToSync.length) {
						let currentFilesToSync = _.cloneDeep(filesToSync);
						filesToSync = [];

						await this.syncAddedFiles(currentFilesToSync, projectData);
					}

					if (filesToRemove.length) {
						let currentFilesToRemove = _.cloneDeep(filesToRemove);
						filesToRemove = [];

						await this.removeFiles(currentFilesToRemove, projectData);
					}

				}
			}, 250);
		};

		this.$processService.attachToProcessExitSignals(this, () => clearTimeout(timeoutTimer));

		if (this.$options.watch && !this.$options.justlaunch) {
			await this.$hooksService.executeBeforeHooks('watch');
			let watcher = choki.watch(pattern, { ignoreInitial: true, cwd: projectDir, awaitWriteFinish: { pollInterval: 100, stabilityThreshold: 500 } })
				.on("all", async (event: string, filePath: string) => {
					//	that.$dispatcher.dispatch(async () => {
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
						this.$logger.info(`Unable to sync file ${filePath}. Error is:${err.message}`.red.bold);
						this.$logger.info("Try saving it again or restart the livesync operation.");
					}
					//	});
				});

			this.$processService.attachToProcessExitSignals(this, () => {
				watcher.close();
			});
		}
	}

	private async removeFiles(filePaths: string[], projectData: IProjectData): Promise<void> {
		const deviceAction = async (device: Mobile.IDevice): Promise<void> => {
			const deviceAppData = this.$injector.resolve(deviceAppDataIdentifiers.IOSAppIdentifier,
				{ _appIdentifier: projectData.projectId, device, platform: device.deviceInfo.platform });

			let platformData = this.$platformsData.getPlatformData(device.deviceInfo.platform, projectData);

			const mappedFiles = _.map(filePaths, filePath => this.$projectFilesProvider.mapFilePath(filePath, device.deviceInfo.platform, projectData));
			const projectFilesPath = path.join(platformData.appDestinationDirectoryPath, "app");
			let localToDevicePaths = await this.$projectFilesManager.createLocalToDevicePaths(deviceAppData, projectFilesPath, mappedFiles, []);
			const deviceLiveSyncService = this.$injector.resolve(iosdls.IOSLiveSyncService, { _device: device });
			deviceLiveSyncService.removeFiles(projectData.projectId, localToDevicePaths, projectData.projectId);
			await this.refreshApplication(deviceAppData, localToDevicePaths, false, projectData);
		};

		// await this.$devicesService.execute(deviceAction, (device: Mobile.IDevice) => this.$mobileHelper.isAndroidPlatform(device.deviceInfo.platform));
		await this.addActionToQueue(() => this.$devicesService.execute(deviceAction, (device: Mobile.IDevice) => this.$mobileHelper.isiOSPlatform(device.deviceInfo.platform)));
	}

	private async addActionToQueue<T>(action: () => Promise<T>): Promise<T> {
		this.currentPromiseChain = this.currentPromiseChain.then(async () => {
			const res = await action();
			//	console.log("after ", unique);
			return res;
		});

		const result = await this.currentPromiseChain;
		return result;
	}

	private currentPromiseChain: Promise<any> = Promise.resolve();

	private async syncAddedFiles(filePaths: string[], projectData: IProjectData): Promise<void> {
		const deviceAction = async (device: Mobile.IDevice): Promise<void> => {
			const deviceAppData = this.$injector.resolve(deviceAppDataIdentifiers.IOSAppIdentifier,
				{ _appIdentifier: projectData.projectId, device, platform: device.deviceInfo.platform });

			const mappedFiles = _.map(filePaths, filePath => this.$projectFilesProvider.mapFilePath(filePath, device.deviceInfo.platform, projectData));

			// Some plugins modify platforms dir on afterPrepare (check nativescript-dev-sass) - we want to sync only existing file.
			const existingFiles = mappedFiles.filter(m => this.$fs.exists(m));
			this.$logger.trace("Will execute livesync for files: ", existingFiles);
			const skippedFiles = _.difference(mappedFiles, existingFiles);
			if (skippedFiles.length) {
				this.$logger.trace("The following files will not be synced as they do not exist:", skippedFiles);
			}

			if (existingFiles.length) {
				let platformData = this.$platformsData.getPlatformData(device.deviceInfo.platform, projectData);
				const projectFilesPath = path.join(platformData.appDestinationDirectoryPath, "app");
				let localToDevicePaths = await this.$projectFilesManager.createLocalToDevicePaths(deviceAppData,
					projectFilesPath, mappedFiles, []);
				await this.transferFiles(deviceAppData, localToDevicePaths, projectFilesPath, false);
				await this.refreshApplication(deviceAppData, localToDevicePaths, false, projectData);
			}
		};

		await this.addActionToQueue(() => this.$devicesService.execute(deviceAction, (device: Mobile.IDevice) => this.$mobileHelper.isiOSPlatform(device.deviceInfo.platform)));

		// this.currentPromiseChain = this.currentPromiseChain.then(async () => {
		// 	const res = await this.$devicesService.execute(deviceAction, (device: Mobile.IDevice) => this.$mobileHelper.isAndroidPlatform(device.deviceInfo.platform));;
		// 	return res;
		// });

		// await this.currentPromiseChain;
	}

	public async refreshApplication(deviceAppData: Mobile.IDeviceAppData, localToDevicePaths: Mobile.ILocalToDevicePathData[], isFullSync: boolean, projectData: IProjectData): Promise<void> {
		let deviceLiveSyncService = this.$injector.resolve(iosdls.IOSLiveSyncService, { _device: deviceAppData.device });
		this.$logger.info("Refreshing application...");
		await deviceLiveSyncService.refreshApplication(deviceAppData, localToDevicePaths, isFullSync, projectData);
	}

	protected async transferFiles(deviceAppData: Mobile.IDeviceAppData, localToDevicePaths: Mobile.ILocalToDevicePathData[], projectFilesPath: string, isFullSync: boolean): Promise<void> {
		let canTransferDirectory = isFullSync && this.$devicesService.isiOSDevice(deviceAppData.device);
		if (canTransferDirectory) {
			await deviceAppData.device.fileSystem.transferDirectory(deviceAppData, localToDevicePaths, projectFilesPath);
		} else {
			// NOTE: Code for iOS is different.
			await deviceAppData.device.fileSystem.transferFiles(deviceAppData, localToDevicePaths);
		}

		console.log("TRANSFEREEDDDDDDD!!!!!!");
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
