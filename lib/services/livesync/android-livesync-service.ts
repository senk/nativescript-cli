import * as path from "path";
import * as constants from "../../constants";
import * as helpers from "../../common/helpers";
import * as adls from "./android-device-livesync-service";
import * as deviceAppDataIdentifiers from "../../providers/device-app-data-provider";
import * as choki from "chokidar";

import syncBatchLib = require("../../common/services/livesync/sync-batch");

const livesyncInfoFileName = ".nslivesyncinfo";

export class AndroidLiveSyncService {
	constructor(private $devicesService: Mobile.IDevicesService,
		private $platformsData: IPlatformsData,
		private $platformService: IPlatformService,
		private $errors: IErrors,
		// private $mobileHelper: Mobile.IMobileHelper,
		private $injector: IInjector,
		private $projectChangesService: IProjectChangesService,
		private $projectFilesManager: IProjectFilesManager,
		private $options: IOptions,
		private $logger: ILogger,
		private $hooksService: IHooksService,
		private $projectFilesProvider: IProjectFilesProvider,
		private $fs: IFileSystem,
		private $nodeModulesDependenciesBuilder: INodeModulesDependenciesBuilder,
		private $processService: IProcessService) {
	}

	public async liveSync(platform: string, projectData: IProjectData,
		options?: IOptions): Promise<void> {
		if (options.justlaunch) {
			options.watch = false;
		}

		let liveSyncData: ILiveSyncData[] = [];

		// TODO: Should we initialize devicesService here?
		if (platform) {
			await this.$devicesService.initialize({ platform: platform, deviceId: options.device });
			liveSyncData.push(this.prepareLiveSyncData(platform, projectData, options));
		} else if (options.device) {
			await this.$devicesService.initialize({ platform: platform, deviceId: options.device });
			platform = this.$devicesService.getDeviceByIdentifier(options.device).deviceInfo.platform;
			liveSyncData.push(this.prepareLiveSyncData(platform, projectData, options));
		} else {
			await this.$devicesService.initialize({ skipInferPlatform: true, skipDeviceDetectionInterval: true });

			for (let installedPlatform of this.$platformService.getInstalledPlatforms(projectData)) {
				if (this.$devicesService.getDevicesForPlatform(installedPlatform).length === 0) {
					await this.$devicesService.startEmulator(installedPlatform);
				}

				liveSyncData.push(this.prepareLiveSyncData(installedPlatform, projectData, options));
			}
		}

		if (liveSyncData.length === 0) {
			this.$errors.fail("There are no platforms installed in this project. Please specify platform or install one by using `tns platform add` command!");
		}

		await this.liveSyncCore(liveSyncData, projectData, options);
	}

	private prepareLiveSyncData(platform: string, projectData: IProjectData, options: any): ILiveSyncData {
		platform = platform || this.$devicesService.platform;
		let platformData = this.$platformsData.getPlatformData(platform.toLowerCase(), projectData);

		let liveSyncData: ILiveSyncData = {
			platform: platform,
			appIdentifier: projectData.projectId,
			projectFilesPath: path.join(platformData.appDestinationDirectoryPath, constants.APP_FOLDER_NAME),
			syncWorkingDirectory: projectData.projectDir,
			excludedProjectDirsAndFiles: options.release ? constants.LIVESYNC_EXCLUDED_FILE_PATTERNS : []
		};

		return liveSyncData;
	}

	private getCanExecuteAction(platform: string, appIdentifier: string): (dev: Mobile.IDevice) => boolean {
		let isTheSamePlatformAction = ((device: Mobile.IDevice) => device.deviceInfo.platform.toLowerCase() === platform.toLowerCase());

		// TODO: Verify devicesService will handle this for us
		// if (this.$options.device) {
		// 	return (device: Mobile.IDevice): boolean => isTheSamePlatformAction(device) &&
		// 		device.deviceInfo.identifier === this.$devicesService.getDeviceByDeviceOption().deviceInfo.identifier;
		// }

		return isTheSamePlatformAction;
	}

	private async shouldTransferAllFiles(platform: string, deviceAppData: Mobile.IDeviceAppData, projectData: IProjectData): Promise<boolean> {
		try {
			if (this.$options.clean) {
				return false;
			}

			let fileText = await this.$platformService.readFile(deviceAppData.device, await this.getLiveSyncInfoFilePath(deviceAppData), projectData);
			let remoteLivesyncInfo: IPrepareInfo = JSON.parse(fileText);
			let localPrepareInfo = this.$projectChangesService.getPrepareInfo(platform, projectData);
			return remoteLivesyncInfo.time !== localPrepareInfo.time;
		} catch (e) {
			return true;
		}
	}

	private async getLiveSyncInfoFilePath(deviceAppData: Mobile.IDeviceAppData): Promise<string> {
		let deviceRootPath = path.dirname(await deviceAppData.getDeviceProjectRootPath());
		let deviceFilePath = helpers.fromWindowsRelativePathToUnix(path.join(deviceRootPath, livesyncInfoFileName));
		return deviceFilePath;
	}

	protected async transferFiles(deviceAppData: Mobile.IDeviceAppData, localToDevicePaths: Mobile.ILocalToDevicePathData[], projectFilesPath: string, isFullSync: boolean): Promise<void> {
		this.$logger.info("Transferring project files...");
		let canTransferDirectory = isFullSync && (this.$devicesService.isAndroidDevice(deviceAppData.device) || this.$devicesService.isiOSSimulator(deviceAppData.device));
		if (canTransferDirectory) {
			await deviceAppData.device.fileSystem.transferDirectory(deviceAppData, localToDevicePaths, projectFilesPath);
		} else {
			// NOTE: CODE FOR iOS is different.
			await deviceAppData.device.fileSystem.transferFiles(deviceAppData, localToDevicePaths);
			// await this.$liveSyncProvider.transferFiles(deviceAppData, localToDevicePaths, projectFilesPath, isFullSync);
		}

		console.log("TRANSFEREEDDDDDDD!!!!!!");

		//	this.logFilesSyncInformation(localToDevicePaths, "Successfully transferred %s.", this.$logger.info);
	}

	public async fullSync(projectData: IProjectData, liveSyncData: ILiveSyncData): Promise<void> {
		const appIdentifier = liveSyncData.appIdentifier;
		const platform = liveSyncData.platform;
		const projectFilesPath = liveSyncData.projectFilesPath;
		const canExecute = this.getCanExecuteAction(platform, appIdentifier);
		const action = async (device: Mobile.IDevice): Promise<void> => {
			const deviceAppData = this.$injector.resolve(deviceAppDataIdentifiers.AndroidAppIdentifier, { _appIdentifier: appIdentifier, device, platform });  // this.$deviceAppDataFactory.create(appIdentifier, this.$mobileHelper.normalizePlatformName(platform), device);
			let localToDevicePaths: Mobile.ILocalToDevicePathData[] = null;
			if (await this.shouldTransferAllFiles(platform, deviceAppData, projectData)) {
				localToDevicePaths = await this.$projectFilesManager.createLocalToDevicePaths(deviceAppData, projectFilesPath, null, liveSyncData.excludedProjectDirsAndFiles);
				await this.transferFiles(deviceAppData, localToDevicePaths, liveSyncData.projectFilesPath, true);
				await device.fileSystem.putFile(
					this.$projectChangesService.getPrepareInfoFilePath(platform, projectData),
					await this.getLiveSyncInfoFilePath(deviceAppData),
					appIdentifier);
			}

			await this.refreshApplication(deviceAppData, localToDevicePaths, true, projectData);
			// await this.finishLivesync(deviceAppData);
		};

		await this.$devicesService.execute(action, canExecute);
	}

	@helpers.hook('livesync')
	private async liveSyncCore(liveSyncData: ILiveSyncData[], projectData: IProjectData, options: any): Promise<void> {
		let watchForChangeActions: ((event: string, filePath: string) => Promise<void>)[] = [];

		for (let dataItem of liveSyncData) {
			watchForChangeActions.push(async (event: string, filePath: string): Promise<void> => {
				// if (this.isFileExcluded(filePath, liveSyncData.excludedProjectDirsAndFiles)) {
				// 	this.$logger.trace(`Skipping livesync for changed file ${filePath} as it is excluded in the patterns: ${liveSyncData.excludedProjectDirsAndFiles.join(", ")}`);
				// 	return;
				// }

				if (event === "add" || event === "addDir" || event === "change") {
					await this.syncAddedFiles(filePath, null, projectData);
				} else if (event === "unlink" || event === "unlinkDir") {
					// 	await this.syncRemovedFile(filePath, afterFileSyncAction, projectData);
				}

				//service.partialSync(event, filePath, dispatcher, applicationReloadAction, projectData));
			});

			await this.fullSync(projectData, dataItem);
		}

		if (options.watch && !options.justlaunch) {
			await this.$hooksService.executeBeforeHooks('watch');
			await this.partialSync(liveSyncData[0].syncWorkingDirectory, watchForChangeActions, projectData, options);
		}
	}

	private partialSync(syncWorkingDirectory: string, onChangedActions: ((event: string, filePath: string) => Promise<void>)[], projectData: IProjectData, options: any): void {
		let that = this;
		let pattern = ["app"];

		if (options.syncAllFiles) {
			const productionDependencies = this.$nodeModulesDependenciesBuilder.getProductionDependencies(projectData.projectDir);
			pattern.push("package.json");

			// watch only production node_module/packages same one prepare uses
			for (let index in productionDependencies) {
				pattern.push(path.join("node_modules", productionDependencies[index].name));
			}
		}

		let watcher = choki.watch(pattern, { ignoreInitial: true, cwd: syncWorkingDirectory, awaitWriteFinish: {pollInterval: 100, stabilityThreshold: 500 }})
			.on("all", async (event: string, filePath: string) => {
			//	that.$dispatcher.dispatch(async () => {
					try {
						filePath = path.join(syncWorkingDirectory, filePath);
						for (let i = 0; i < onChangedActions.length; i++) {
							that.$logger.trace(`Event '${event}' triggered for path: '${filePath}'`);
							await onChangedActions[i](event, filePath);
						}
					} catch (err) {
						that.$logger.info(`Unable to sync file ${filePath}. Error is:${err.message}`.red.bold);
						that.$logger.info("Try saving it again or restart the livesync operation.");
					}
			//	});
			});

		this.$processService.attachToProcessExitSignals(this, () => {
			watcher.close();
		});

		// this.$dispatcher.run();
	}

	private batch: IDictionary<ISyncBatch> = Object.create(null);

	private async syncAddedFiles(filePath: string,
		afterFileSyncAction: (deviceAppData: Mobile.IDeviceAppData, localToDevicePaths: Mobile.ILocalToDevicePathData[]) => Promise<void>,
		projectData: IProjectData): Promise<void> {

		const platforms = ["android"];
		_.each(platforms, platform => {
			if (!this.batch[platform]) {
				let done = async () => {
					// Dispatcher's dispatch is in fact our full queue of actions.
					// dispatcher.dispatch(async () => {
					try {
						//for (let platform in this.batch) {
						let liveSyncData = await this.prepareLiveSyncData(platform, projectData, this.$options);
						let batch = this.batch[platform];
						await batch.syncFiles(async (filesToSync: string[]) => {
							const appFilesUpdaterOptions: IAppFilesUpdaterOptions = { bundle: this.$options.bundle, release: this.$options.release };
							await this.$platformService.preparePlatform(platform, appFilesUpdaterOptions, this.$options.platformTemplate, projectData, this.$options, filesToSync);
							let canExecute = this.getCanExecuteAction(platform, projectData.projectId);

							let action = async (device: Mobile.IDevice) => {
								const deviceAppData = this.$injector.resolve(deviceAppDataIdentifiers.AndroidAppIdentifier, {
									_appIdentifier: liveSyncData.appIdentifier,
									device, platform
								});  // this.$deviceAppDataFactory.create(appIdentifier, this.$mobileHelper.normalizePlatformName(platform), device);
								const mappedFiles = filesToSync.map((file: string) => this.$projectFilesProvider.mapFilePath(file, device.deviceInfo.platform, projectData));

								// Some plugins modify platforms dir on afterPrepare (check nativescript-dev-sass) - we want to sync only existing file.
								const existingFiles = mappedFiles.filter(m => this.$fs.exists(m));

								this.$logger.trace("Will execute livesync for files: ", existingFiles);

								const skippedFiles = _.difference(mappedFiles, existingFiles);

								if (skippedFiles.length) {
									this.$logger.trace("The following files will not be synced as they do not exist:", skippedFiles);
								}

								let localToDevicePaths = await this.$projectFilesManager.createLocalToDevicePaths(deviceAppData,
									liveSyncData.projectFilesPath, mappedFiles, liveSyncData.excludedProjectDirsAndFiles);

								await this.transferFiles(deviceAppData, localToDevicePaths, liveSyncData.projectFilesPath, !filePath);

								await this.refreshApplication(deviceAppData, localToDevicePaths, true, projectData);
							};

							await this.$devicesService.execute(action, canExecute);
						});
						// }
					} catch (err) {
						this.$logger.warn(`Unable to sync files. Error is:`, err.message);
					}
					// });
				};

				this.batch[platform] = this.$injector.resolve(syncBatchLib.SyncBatch, { done: done });
			}

			this.batch[platform].addFile(filePath);
		});

	}

	public async refreshApplication(deviceAppData: Mobile.IDeviceAppData, localToDevicePaths: Mobile.ILocalToDevicePathData[], isFullSync: boolean, projectData: IProjectData): Promise<void> {
		let deviceLiveSyncService = this.$injector.resolve(adls.AndroidLiveSyncService, { _device: deviceAppData.device });
		// this.resolveDeviceSpecificLiveSyncService(deviceAppData.device.deviceInfo.platform, deviceAppData.device);
		this.$logger.info("Refreshing application...");

		await deviceLiveSyncService.refreshApplication(deviceAppData, localToDevicePaths, isFullSync, projectData);
	}

}