export class EmulateCommandBase {
	constructor(private $options: IOptions,
		protected $projectData: IProjectData,
		protected $logger: ILogger,
		protected $platformService: IPlatformService) {
		this.$projectData.initializeProjectData();
	}

	public async executeCore(args: string[]): Promise<void> {
		this.$logger.warn(`Emulate command is deprecated and will soon be removed. Please use "tns run <platform>" instead. All options available for "tns emulate" are present in "tns run" command. To run on all available emulators, use "tns run <platform> --emulator".`);
		this.$options.emulator = true;
		const appFilesUpdaterOptions: IAppFilesUpdaterOptions = { bundle: this.$options.bundle, release: this.$options.release };
		const emulateOptions: IEmulatePlatformOptions = {
			avd: this.$options.avd,
			clean: this.$options.clean,
			device: this.$options.device,
			release: this.$options.release,
			emulator: this.$options.emulator,
			projectDir: this.$options.path,
			justlaunch: this.$options.justlaunch,
			availableDevices: this.$options.availableDevices,
			platformTemplate: this.$options.platformTemplate,
			provision: this.$options.provision,
			teamId: this.$options.teamId,
			keyStoreAlias: this.$options.keyStoreAlias,
			keyStoreAliasPassword: this.$options.keyStoreAliasPassword,
			keyStorePassword: this.$options.keyStorePassword,
			keyStorePath: this.$options.keyStorePath
		};
		return this.$platformService.emulatePlatform(args[0], appFilesUpdaterOptions, emulateOptions, this.$projectData, this.$options);
	}
}

export class EmulateIosCommand extends EmulateCommandBase implements ICommand {
	public allowedParameters: ICommandParameter[] = [];

	constructor(
		private $platformsData: IPlatformsData,
		private $devicePlatformsConstants: Mobile.IDevicePlatformsConstants,
		private $errors: IErrors,
		$platformService: IPlatformService,
		$logger: ILogger,
		$projectData: IProjectData,
		$options: IOptions) {
		super($options, $projectData, $logger, $platformService);
	}

	public async execute(args: string[]): Promise<void> {
		if (!this.$platformService.isPlatformSupportedForOS(this.$devicePlatformsConstants.iOS, this.$projectData)) {
			this.$errors.fail("Applications for platform %s can not be built on this OS - %s", this.$devicePlatformsConstants.iOS, process.platform);
		}

		return this.executeCore([this.$platformsData.availablePlatforms.iOS]);
	}
}

$injector.registerCommand("emulate|ios", EmulateIosCommand);

export class EmulateAndroidCommand extends EmulateCommandBase implements ICommand {
	constructor(
		private $platformsData: IPlatformsData,
		private $devicePlatformsConstants: Mobile.IDevicePlatformsConstants,
		private $errors: IErrors,
		$platformService: IPlatformService,
		$logger: ILogger,
		$projectData: IProjectData,
		$options: IOptions) {
		super($options, $projectData, $logger, $platformService);
	}

	public allowedParameters: ICommandParameter[] = [];

	public async execute(args: string[]): Promise<void> {
		if (!this.$platformService.isPlatformSupportedForOS(this.$devicePlatformsConstants.Android, this.$projectData)) {
			this.$errors.fail("Applications for platform %s can not be built on this OS - %s", this.$devicePlatformsConstants.Android, process.platform);
		}

		return this.executeCore([this.$platformsData.availablePlatforms.Android]);
	}
}

$injector.registerCommand("emulate|android", EmulateAndroidCommand);
