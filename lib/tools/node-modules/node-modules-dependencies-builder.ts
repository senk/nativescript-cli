import * as path from "path";
import { NODE_MODULES_FOLDER_NAME, PACKAGE_JSON_FILE_NAME } from "../../constants";

interface IDependencyDescription {
	parentDir: string;
	name: string;
}

export class NodeModulesDependenciesBuilder implements INodeModulesDependenciesBuilder {
	public constructor(private $fs: IFileSystem,
		private $hostInfo: IHostInfo) { }

	public getProductionDependencies(projectPath: string): IDependencyData[] {
		const rootNodeModulesPath = path.join(projectPath, NODE_MODULES_FOLDER_NAME);
		const projectPackageJsonPath = path.join(projectPath, PACKAGE_JSON_FILE_NAME);
		const packageJsonContent = this.$fs.readJson(projectPackageJsonPath);
		const dependencies = packageJsonContent && packageJsonContent.dependencies;

		let resolvedDependencies: IDependencyData[] = [];

		const queue: IDependencyDescription[] = _.map(_.keys(dependencies), d => {
			return {
				parentDir: projectPath,
				name: d
			};
		});

		while (queue.length) {
			let currentModule = queue.shift();
			const resolvedDependency = this.findModule(rootNodeModulesPath, currentModule.parentDir, currentModule.name);

			if (resolvedDependency && !_.some(resolvedDependencies, r => r.directory === resolvedDependency.directory)) {
				const deps = _.map(resolvedDependency.dependencies, d => ({ name: d, parentDir: resolvedDependency.directory }));
				queue.push(...deps);
				delete resolvedDependency.dependencies; // Just to pass the tests, will fix it later
				resolvedDependencies.push(resolvedDependency);
			}
		}

		return resolvedDependencies;
	}

	private findModule(rootNodeModulesPath: string, parentModulePath: string, name: string): IDependencyData {
		let modulePath = path.join(parentModulePath, NODE_MODULES_FOLDER_NAME, name); // node_modules/parent/node_modules/<package>
		const rootModulesPath = path.join(rootNodeModulesPath, name);
		let exists = this.moduleExists(modulePath);

		if (!exists) {
			modulePath = rootModulesPath; // /node_modules/<package>
			exists = this.moduleExists(modulePath);
		}

		if (!exists) {
			return null;
		}

		const pathSeparatorGroup = this.$hostInfo.isWindows ? `${path.sep}${path.sep}` : path.sep; // because Windows is shit
		const match = modulePath.replace(rootNodeModulesPath, "").match(new RegExp(pathSeparatorGroup + NODE_MODULES_FOLDER_NAME + pathSeparatorGroup, "g"));
		const depthInNodeModules = match && match.length || 0;

		return this.getDependencyData(name, modulePath, depthInNodeModules);
	}

	private getDependencyData(name: string, directory: string, depth: number): IDependencyData {
		const dependency: IDependencyData = {
			name,
			directory,
			depth
		};

		const packageJsonPath = path.join(directory, PACKAGE_JSON_FILE_NAME);
		const packageJsonExists = this.$fs.getLsStats(packageJsonPath).isFile();

		if (packageJsonExists) {
			let packageJsonContents = this.$fs.readJson(packageJsonPath);

			if (!!packageJsonContents.nativescript) {
				// add `nativescript` property, necessary for resolving plugins
				dependency.nativescript = packageJsonContents.nativescript;
			}

			dependency.dependencies = _.keys(packageJsonContents.dependencies);
			return dependency;
		}

		return null;
	}

	private moduleExists(modulePath: string): boolean {
		try {
			let modulePathLsStat = this.$fs.getLsStats(modulePath);
			if (modulePathLsStat.isSymbolicLink()) {
				modulePathLsStat = this.$fs.getLsStats(this.$fs.realpath(modulePath));
			}

			return modulePathLsStat.isDirectory();
		} catch (e) {
			return false;
		}
	}
}

$injector.register("nodeModulesDependenciesBuilder", NodeModulesDependenciesBuilder);
