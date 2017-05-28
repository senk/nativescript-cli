// import { AndroidLiveSyncService } from "../services/livesync/android-livesync-service";
import { RunService } from "../services/livesync/android-livesync-service.1";
// import { RunService } from "../services/livesync/ios-livesync-service";
import * as path from "path";

export class LiveSyncCommand implements ICommand {

	constructor(//private $mobileHelper: Mobile.IMobileHelper,
		private $projectData: IProjectData,
		//	private $usbLiveSyncService: ILiveSyncService,
		private $options: IOptions,
		private $projectChangesService: IProjectChangesService,
		private $fs: IFileSystem,
		private $platformService: IPlatformService,
		private $injector: IInjector) {
		this.$projectData.initializeProjectData();
	}

	public async execute(args: string[]): Promise<void> {
		// const rebuildAction = async (): Promise<string> => {

		// 	const cloudBuildService: any = this.$injector.resolve("cloudBuildService");
		const data1: any = {
			projectDir: 'D:\\Work\\nativescript-cli\\scratch\\appNew7',
			projectId: 'org.nativescript.SMBarcode',
			projectName: 'appNew7',
			nativescriptData:
			{
				id: 'org.nativescript.SMBarcode',
				'tns-android': { version: '3.0.0' }
			}
		};
		// 	const res = await cloudBuildService.build(data1, "Android", "Debug");
		// 	console.log("_____________________________________ ", res.outputFilePath);
		// 	return res.outputFilePath;
		// 	// await device.applicationManager.reinstallApplication(data1.nativescriptData.id, res.outputFilePath);
		// 	// console.log("AFTER REINSTALLING!!!!");
		// };

		// // const platform = this.$mobileHelper.normalizePlatformName(args[0]);
		// // const a = this.$injector.resolve<AndroidLiveSyncService>(AndroidLiveSyncService);
		// // await a.liveSync(platform, this.$projectData, this.$options);

		const runServuce = this.$injector.resolve<RunService>(RunService);
		console.log("############ project.id = ", this.$projectData.projectId);
		// await runServuce.liveSynciOS(this.$projectData.projectDir);
		await runServuce.liveSyncAndroid(null /*path.join(this.$projectData.projectDir, ".cloud") */  , async () => {
			// const res: any = await this.$injector.resolve("cloudBuildService").build(data1, "Android", "Debug");
			// let buildInfoFilePath = path.dirname(res.outputFilePath);
			// let buildInfoFile = path.join(buildInfoFilePath, ".nsbuildinfo");
			// let prepareInfo = this.$projectChangesService.getPrepareInfo("android", this.$projectData);
			// let buildInfo: IBuildInfo = {
			// 	prepareTime: prepareInfo.changesRequireBuildTime,
			// 	buildTime: new Date().toString()
			// };

			let buildConfig: IBuildConfig = {
						buildForDevice: true,
						projectDir: this.$options.path,
						release: this.$options.release,
						device: this.$options.device,
						provision: this.$options.provision,
						teamId: this.$options.teamId,
						keyStoreAlias: this.$options.keyStoreAlias,
						keyStoreAliasPassword: this.$options.keyStoreAliasPassword,
						keyStorePassword: this.$options.keyStorePassword,
						keyStorePath: this.$options.keyStorePath,
						clean: this.$options.clean
					};

			// this.$fs.writeJson(buildInfoFile, buildInfo);
			await this.$platformService.buildPlatform("android", buildConfig, this.$projectData);
			return this.$platformService.lastOutputPath("android", buildConfig, this.$projectData);
			// return res.outputFilePath;
		}, this.$projectData.projectDir);
		// await this.$usbLiveSyncService.liveSync(platform, this.$projectData, null, this.$options);
	}

	public allowedParameters: ICommandParameter[];

	// Implement this method in cases when you want to have your own logic for validation. In case you do not implement it,
	// the command will be evaluated from CommandsService's canExecuteCommand method.
	// One possible case where you can use this method is when you have two commandParameters, neither of them is mandatory,
	// but at least one of them is required. Used in prop|add, prop|set, etc. commands as their logic is complicated and
	// default validation in CommandsService is not applicable.
	public async canExecute?(args: string[]): Promise<boolean> {
		return true;
	}

}
$injector.registerCommand("livesync2", LiveSyncCommand);
