import * as chokidar from "chokidar";

export class FileSystemWatcher {
	constructor(private $logger: ILogger) {
		this.$logger.info("CREATED WATCHER")
	}

	public async startWatcher(opts?: any): Promise<chokidar.FSWatcher> {
		const watcher = chokidar.watch(opts.paths, opts.options);
		return watcher;
	}

	public async stopWatcher(watcher: chokidar.FSWatcher): Promise<void> {
		if (watcher) {
			watcher.close();
		}
	}
}

$injector.register("fileSysemWatcher", FileSystemWatcher);
