interface INodePackageManager {
	/**
	 * Installs dependency
	 * @param  {string}                            packageName The name of the dependency - can be a path, a url or a string.
	 * @param  {string}                            pathToSave  The destination of the installation.
	 * @param  {INodePackageManagerInstallOptions} config      Additional options that can be passed to manipulate installation.
	 * @return {Promise<INpmInstallResultInfo>}                Information about installed package.
	 */
	install(packageName: string, pathToSave: string, config: INodePackageManagerInstallOptions): Promise<INpmInstallResultInfo>;

	/**
	 * Uninstalls a dependency
	 * @param  {string}                            packageName The name of the dependency.
	 * @param  {IDictionary<string | boolean>} config      Additional options that can be passed to manipulate uninstallation.
	 * @param  {string}                            path  The destination of the uninstallation.
	 * @return {Promise<string>}                The output of the uninstallation.
	 */
	uninstall(packageName: string, config?: IDictionary<string | boolean>, path?: string): Promise<string>;

	/**
	 * Provides information about a given package.
	 * @param  {string}                            packageName The name of the package.
	 * @param  {IDictionary<string | boolean>} config      Additional options that can be passed to manipulate view.
	 * @return {Promise<any>}                Object, containing information about the package.
	 */
	view(packageName: string, config: Object): Promise<any>;

	/**
	 * Searches for a package.
	 * @param  {string[]}                            filter Keywords with which to perform the search.
	 * @param  {IDictionary<string | boolean>} config      Additional options that can be passed to manipulate search.
	 * @return {Promise<string>}                The output of the uninstallation.
	 */
	search(filter: string[], config: IDictionary<string | boolean>): Promise<string>;
}

interface INpmInstallationManager {
	install(packageName: string, packageDir: string, options?: INpmInstallOptions): Promise<any>;
	getLatestVersion(packageName: string): Promise<string>;
	getNextVersion(packageName: string): Promise<string>;
	getLatestCompatibleVersion(packageName: string): Promise<string>;
	getInspectorFromCache(inspectorNpmPackageName: string, projectDir: string): Promise<string>;
}

/**
 * Describes options that can be passed to manipulate package installation.
 */
interface INodePackageManagerInstallOptions extends INpmInstallConfigurationOptions, IDictionary<string | boolean> {
	/**
	 * Destination of the installation.
	 * @type {string}
	 * @optional
	 */
	path?: string;
}

/**
 * Describes information about dependency packages.
 */
interface INpmDependencyInfo {
	/**
	 * Dependency name.
	 */
	[key: string]: {
		/**
		 * Dependency version.
		 * @type {string}
		 */
		version: string;
		/**
		 * How was the dependency resolved. For example: lodash@latest or underscore@>=1.8.3 <2.0.0
		 * @type {string}
		 */
		from: string;
		/**
		 * Where was the dependency resolved from. For example: https://registry.npmjs.org/lodash/-/lodash-4.17.4.tgz
		 * @type {string}
		 */
		resolved: string;
		/**
		 * Dependencies of the dependency.
		 * @type {INpmDependencyInfo}
		 */
		dependencies?: INpmDependencyInfo;
		/**
		 * Set to true when the dependency is invalid.
		 * @type {boolean}
		 */
		invalid?: boolean;
		/**
		 * If invalid is set to true this will contain errors which make the dependency invalid.
		 */
		problems?: string[];
	}
}

/**
 * Describes information about peer dependency packages.
 */
interface INpmPeerDependencyInfo {
	required: {
		/**
		 * Id used in package.json - for example: zone.js@^0.8.4
		 * @type {string}
		 */
		_id: string;
		/**
		 * Dependency name.
		 * @type {string}
		 */
		name: string;
		/**
		 * Dependency version.
		 * @type {string}
		 */
		version: string;
		/**
		 * If peerMissing below is set to true this will contain information about missing peers.
		 */
		peerMissing?: [
			{
				/**
				 * The id of the package which requires the unmet peer dependency.
				 * @type {string}
				 */
				requiredBy: string;
				/**
				 * The id of the unmet peer dependency.
				 * @type {string}
				 */
				requires: string;
			}
		];
		/**
		 * Dependencies of the dependency.
		 * @type {INpmDependencyInfo}
		 */
		dependencies: INpmDependencyInfo;
		/**
		 * Whether the dependency was found or not.
		 * @type {boolean}
		 */
		_found: boolean;
	};
	/**
	 * Set to true if peer dependency unmet.
	 * @type {boolean}
	 */
	peerMissing: boolean;
}

/**
 * Describes information about dependency update packages.
 */
interface INpm5DependencyInfo {
	/**
	 * Npm action type.
	 * @type {string}
	 */
	action: string;
	/**
	 * Dependency name.
	 * @type {string}
	 */
	name: string;
	/**
	 * Dependency version.
	 * @type {string}
	 */
	version: string;
	/**
	 * Destination of the installation.
	 * @type {string}
	 */
	path: string;
	/**
	 * Dependency previous version.
	 * @type {string}
	 */
	previousVersion: string;
}

/**
 * Describes information returned by the npm CLI upon calling install with --json flag.
 */
interface INpmInstallCLIResult {
	/**
	 * The name of the destination package. Note that this is not the installed package.
	 * @type {string}
	 */
	name: string;
	/**
	 * The version of the destination package. Note that this is not the installed package.
	 * @type {string}
	 */
	version: string;
	/**
	 * Installed dependencies. Note that whenever installing a particular dependency it is listed as the first key and after it any number of peer dependencies may follow.
	 * Whenever installing npm prints the information by reversing the tree of operations and because the initial dependency was installed last it is listed first.
	 * @type {INpmDependencyInfo | INpmPeerDependencyInfo}
	 */
	dependencies: INpmDependencyInfo | INpmPeerDependencyInfo;
	/**
	 * Describes problems that might have occurred during installation. For example missing peer dependencies.
	 */
	problems?: string[];
}

/**
 * Describes information returned by the npm 5 CLI upon calling install with --json flag.
 */
interface INpm5InstallCliResult {
	/**
	 * Added dependencies. Note that whenever add a particular dependency with npm 5 it is listed inside of array with key "Added".
	 * @type {INpmDependencyUpdateInfo[]}
	 */
	added: INpm5DependencyInfo[];
	/**
	 * Removed dependencies. Note that whenever remove a particular dependency with npm 5 it is listed inside of array with key "removed".
	 * @type {INpmDependencyUpdateInfo[]}
	 */
	removed: INpm5DependencyInfo[];
	/**
	 * Updated dependencies. Note that whenever update a particular dependency with npm 5 it is listed inside of array with key "updated".
	 * @type {INpmDependencyUpdateInfo[]}
	 */
	updated: INpm5DependencyInfo[];
	/**
	 * Moved dependencies. Note that whenever move a particular dependency with npm 5 it is listed inside of array with key "moved".
	 * @type {INpmDependencyUpdateInfo[]}
	 */
	moved: INpm5DependencyInfo[];
	/**
	 * Failed dependencies. Note that whenever use npm 5 and the operation over particular dependency fail it is listed inside of array with key "failed".
	 * @type {INpmDependencyUpdateInfo[]}
	 */
	failed: INpm5DependencyInfo[];
	/**
	 * Warnings. Note that whenever use npm 5 and the operation over particular dependency have warnings they are listed inside of array with key "warnings".
	 * @type {INpmDependencyUpdateInfo[]}
	 */
	warnings: INpm5DependencyInfo[];
	/**
	 *Time elapsed.
	 * @type {Number}
	 */
	elapsed: Number
}

/**
 * Describes information about installed package.
 */
interface INpmInstallResultInfo {
	/**
	 * Installed package's name.
	 * @type {string}
	 */
	name: string;
	/**
	 * Installed package's version.
	 * @type {string}
	 */
	version: string;
	/**
	 * The original output that npm CLI produced upon installation.
	 * @type {INpmInstallCLIResult}
	 */
	originalOutput?: INpmInstallCLIResult | INpm5InstallCliResult;
}

interface INpmInstallOptions {
	pathToSave?: string;
	version?: string;
	dependencyType?: string;
}

/**
 * Describes npm package installed in node_modules.
 */
interface IDependencyData {
	/**
	 * The name of the package.
	 */
	name: string;

	/**
	 * The full path where the package is installed.
	 */
	directory: string;

	/**
	 * The depth inside node_modules dir, where the package is located.
	 * The <project_dir>/node_modules/ is level 0.
	 * Level 1 is <project dir>/node_modules/<package name>/node_modules, etc.
	 */
	depth: number;

	/**
	 * Describes the `nativescript` key in package.json of a dependency.
	 */
	nativescript?: any;

	/**
	 * Dependencies of the current module.
	 */
	dependencies?: string[];
}

interface IStaticConfig extends Config.IStaticConfig { }

interface IConfiguration extends Config.IConfig {
	ANDROID_DEBUG_UI: string;
	USE_POD_SANDBOX: boolean;
	debugLivesync: boolean;
}

interface IApplicationPackage {
	packageName: string;
	time: Date;
}

interface ILockFile {
	lock(): void;
	unlock(): void;
	check(): boolean;
}

interface IOpener {
	open(target: string, appname: string): void;
}

interface IBundle {
	bundle: boolean;
}

interface IPlatformTemplate {
	platformTemplate: string;
}

interface IEmulator {
	emulator: boolean;
}

interface IClean {
	clean: boolean;
}

interface IProvision {
	provision: string;
}

interface ITeamIdentifier {
	teamId: string;
}

interface IAndroidReleaseOptions {
	keyStoreAlias?: string;
	keyStoreAliasPassword?: string;
	keyStorePassword?: string;
	keyStorePath?: string;
}

interface INpmInstallConfigurationOptionsBase {
	frameworkPath: string;
	ignoreScripts: boolean; //npm flag
}

interface INpmInstallConfigurationOptions extends INpmInstallConfigurationOptionsBase {
	disableNpmInstall: boolean;
}

interface ICreateProjectOptions extends INpmInstallConfigurationOptionsBase {
	pathToTemplate?: string;
}

interface IOptions extends ICommonOptions, IBundle, IPlatformTemplate, IEmulator, IClean, IProvision, ITeamIdentifier, IAndroidReleaseOptions, INpmInstallConfigurationOptions {
	all: boolean;
	client: boolean;
	compileSdk: number;
	copyTo: string;
	debugTransport: boolean;
	forDevice: boolean;
	framework: string;
	frameworkName: string;
	frameworkVersion: string;
	ipa: string;
	tsc: boolean;
	ng: boolean;
	androidTypings: boolean;
	port: Number;
	production: boolean; //npm flag
	sdk: string;
	syncAllFiles: boolean;
	liveEdit: boolean;
	chrome: boolean;
}

interface IAndroidBuildOptionsSettings extends IAndroidReleaseOptions, IRelease { }

interface IAppFilesUpdaterOptions extends IBundle, IRelease { }

interface IPlatformBuildData extends IAppFilesUpdaterOptions, IBuildConfig { }

interface IDeviceEmulator extends IEmulator, IDeviceIdentifier { }

interface IRunPlatformOptions extends IJustLaunch, IDeviceEmulator { }

interface IDeployPlatformOptions extends IAndroidReleaseOptions, IPlatformTemplate, IRelease, IClean, IDeviceEmulator, IProvision, ITeamIdentifier {
	projectDir: string;
	forceInstall?: boolean;
}

interface IUpdatePlatformOptions extends IPlatformTemplate {
	currentVersion: string;
	newVersion: string;
	canUpdate: boolean;
}

interface IInitService {
	initialize(): Promise<void>;
}

interface IInfoService {
	printComponentsInfo(): Promise<void>;
}

/**
 * Describes standard username/password type credentials.
 */
interface ICredentials {
	username: string;
	password: string;
}

/**
 * Describes properties needed for uploading a package to iTunes Connect
 */
interface IITMSData extends ICredentials {
	/**
	 * Path to a .ipa file which will be uploaded.
	 * @type {string}
	 */
	ipaFilePath: string;
	/**
	 * Specifies whether the logging level of the itmstransporter command-line tool should be set to verbose.
	 * @type {string}
	 */
	verboseLogging?: boolean;
}

/**
 * Used for communicating with Xcode's iTMS Transporter tool.
 */
interface IITMSTransporterService {
	/**
	 * Uploads an .ipa package to iTunes Connect.
	 * @param  {IITMSData}     data Data needed to upload the package
	 * @return {Promise<void>}
	 */
	upload(data: IITMSData): Promise<void>;
	/**
	 * Queries Apple's content delivery API to get the user's registered iOS applications.
	 * @param  {ICredentials}                               credentials Credentials for authentication with iTunes Connect.
	 * @return {Promise<IItunesConnectApplication[]>}          The user's iOS applications.
	 */
	getiOSApplications(credentials: ICredentials): Promise<IiTunesConnectApplication[]>;
}

/**
 * Provides access to information about installed Android tools and SDKs versions.
 */
interface IAndroidToolsInfo {
	/**
	 * Provides information about installed Android SDKs, Build Tools, Support Library
	 * and ANDROID_HOME environement variable.
	 * @return {IAndroidToolsInfoData} Information about installed Android Tools and SDKs.
	 */
	getToolsInfo(): IAndroidToolsInfoData;

	/**
	 * Validates the information about required Android tools and SDK versions.
	 * @param {any} options Defines if the warning messages should treated as error and if the targetSdk value should be validated as well.
	 * @return {boolean} True if there are detected issues, false otherwise.
	 */
	validateInfo(options?: { showWarningsAsErrors: boolean, validateTargetSdk: boolean }): boolean;

	/**
	 * Validates the information about required JAVA version.
	 * @param {string} installedJavaVersion The JAVA version that will be checked.
	 * @param {any} options Defines if the warning messages should treated as error.
	 * @return {boolean} True if there are detected issues, false otherwise.
	 */
	validateJavacVersion(installedJavaVersion: string, options?: { showWarningsAsErrors: boolean }): Promise<boolean>;

	/**
	 * Validates if ANDROID_HOME environment variable is set correctly.
	 * @param {any} options Defines if the warning messages should treated as error.
	 * @returns {boolean} true in case ANDROID_HOME is correctly set, false otherwise.
	 */
	validateAndroidHomeEnvVariable(options?: { showWarningsAsErrors: boolean }): boolean;

	/**
	 * Gets the path to `adb` executable from ANDROID_HOME. It should be `$ANDROID_HOME/platform-tools/adb` in case it exists.
	 * @return {string} Path to the `adb` executable. In case it does not exists, null is returned.
	 */
	getPathToAdbFromAndroidHome(): Promise<string>;
}

/**
 * Describes information about installed Android tools and SDKs.
 */
interface IAndroidToolsInfoData {
	/**
	 * The value of ANDROID_HOME environment variable.
	 */
	androidHomeEnvVar: string;

	/**
	 * The latest installed version of Android Build Tools that satisfies CLI's requirements.
	 */
	buildToolsVersion: string;

	/**
	 * The latest installed version of Android SDK that satisfies CLI's requirements.
	 */
	compileSdkVersion: number;

	/**
	 * The latest installed version of Android Support Repository that satisfies CLI's requirements.
	 */
	supportRepositoryVersion: string;

	/**
	 * The Android targetSdkVersion specified by the user.
	 * In case it is not specified, compileSdkVersion will be used for targetSdkVersion.
	 */
	targetSdkVersion: number;

	/**
	 * Whether or not `.d.ts` typings should be generated for compileSdk. Experimental feature
	 */
	generateTypings: boolean;
}

interface ISocketProxyFactory extends NodeJS.EventEmitter {
	createTCPSocketProxy(factory: () => Promise<any>): Promise<any>;
	createWebSocketProxy(factory: () => Promise<any>): Promise<any>;
}

interface IiOSNotification {
	getWaitForDebug(projectId: string): string;
	getAttachRequest(projectId: string): string;
	getAppLaunching(projectId: string): string;
	getReadyForAttach(projectId: string): string;
	getAttachAvailabilityQuery(projectId: string): string;
	getAlreadyConnected(projectId: string): string;
	getAttachAvailable(projectId: string): string;
}

interface IiOSSocketRequestExecutor {
	executeLaunchRequest(deviceIdentifier: string, timeout: number, readyForAttachTimeout: number, projectId: string, shouldBreak?: boolean): Promise<void>;
	executeAttachRequest(device: Mobile.IiOSDevice, timeout: number, projectId: string): Promise<void>;
}

/**
 * Describes validation methods for XMLs.
 */
interface IXmlValidator {
	/**
	 * Checks the passed xml files for errors and if such exists, print them on the stdout.
	 * @param {string[]} sourceFiles Files to be checked. Only the ones that ends with .xml are filtered.
	 * @return {boolean} true in case there are no errors in specified files and false in case there's at least one error.
	 */
	validateXmlFiles(sourceFiles: string[]): boolean;

	/**
	 * Checks the passed xml file for errors and returns them as a result.
	 * @param {string} sourceFile File to be checked.
	 * @return {string} The errors detected (as a single string) or null in case there are no errors.
	 */
	getXmlFileErrors(sourceFile: string): string;
}

/**
 * Describes methods for working with versions.
 */
interface IVersionsService {
	/**
	 * Gets version information about nativescript-cli.
	 * @return {Promise<IVersionInformation>} The version information.
	 */
	getNativescriptCliVersion(): Promise<IVersionInformation>;

	/**
	 * Gets version information about tns-core-modules.
	 * @return {Promise<IVersionInformation>} The version information.
	 */
	getTnsCoreModulesVersion(): Promise<IVersionInformation>;

	/**
	 * Gets versions information about nativescript runtimes.
	 * @return {Promise<IVersionInformation[]>} The version information.
	 */
	getRuntimesVersions(): Promise<IVersionInformation[]>;

	/**
	 * Checks version information about the nativescript components and prints available updates if any.
	 */
	checkComponentsForUpdate(): Promise<void>;

	/**
	 * Gets versions information about all nativescript components.
	 * @return {Promise<IVersionInformation[]>} The version information.
	 */
	getAllComponentsVersions(): Promise<IVersionInformation[]>;

	/**
	 * Creates table with versions information.
	 * @param {IVersionInformation[]} The versions information to push in the table.
	 * @return {any} The created table.
	 */
	createTableWithVersionsInformation(versionsInformation: IVersionInformation[]): any;
}

/**
 * Describes methods for project name.
 */
interface IProjectNameService {
	/**
	 * Ensures the passed project name is valid. If the project name is not valid prompts for actions.
	 * @param {string} project name to be checked.
	 * @param {IOptions} current command options.
	 * @return {Promise<strng>} returns the selected name of the project.
	 */
	ensureValidName(projectName: string, validateOptions?: { force: boolean }): Promise<string>;
}

/**
 * Designed for getting information about xcproj.
 */
interface IXcprojService {
	/**
	 * Checks whether the system needs xcproj to execute ios builds successfully.
	 * In case the system does need xcproj but does not have it, prints an error message.
	 * @param {boolean} whether to fail with error message or not
	 * @return {Promise<boolean>} whether an error occurred or not.
	 */
	verifyXcproj(shouldFail: boolean): Promise<boolean>;
	/**
	 * Collects information about xcproj.
	 * @return {Promise<XcprojInfo>} collected info about xcproj.
	 */
	getXcprojInfo(): Promise<IXcprojInfo>;
}

/**
 * Describes information about xcproj brew formula.
 */
interface IXcprojInfo {
	/**
	 * determines whether the system needs xcproj to execute ios builds sucessfully
	 */
	shouldUseXcproj: boolean;
	/**
	 * pod version string, as returned by `pod --version`
	 */
	cocoapodVer: string;
	/**
	 * Xcode's version
	 */
	xcodeVersion: IVersionData;
	/**
	 * determines whether xcproj can be called from the command line
	 */
	xcprojAvailable: boolean;
}
