import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const STATUS_FILE = path.join(os.homedir(), '.claude', 'vscode-status');

let statusBarItem: vscode.StatusBarItem;
let watcher: fs.FSWatcher | undefined;

function updateStatus(status: string): void {
	const trimmed = status.trim();

	switch (trimmed) {
		case 'working':
			statusBarItem.text = '🤖 Claude: 作業中';
			vscode.commands.executeCommand('workbench.action.closePanel');
			break;
		case 'waiting':
			statusBarItem.text = '⚠️ Claude: 要確認';
			vscode.commands.executeCommand('workbench.action.terminal.focus');
			break;
		case 'idle':
			statusBarItem.text = '✅ Claude: 完了';
			vscode.commands.executeCommand('workbench.action.closePanel');
			break;
	}
}

function readAndUpdate(): void {
	try {
		const content = fs.readFileSync(STATUS_FILE, 'utf-8');
		updateStatus(content);
	} catch {
		// File doesn't exist or can't be read — do nothing
	}
}

function startWatching(): void {
	const dir = path.dirname(STATUS_FILE);

	try {
		fs.accessSync(dir);
	} catch {
		// ~/.claude/ doesn't exist — do nothing
		return;
	}

	try {
		watcher = fs.watch(STATUS_FILE, () => {
			readAndUpdate();
		});
		watcher.on('error', () => {
			// File may not exist yet — ignore
		});
	} catch {
		// File doesn't exist yet — watch the directory instead
		watcher = fs.watch(dir, (_, filename) => {
			if (filename === path.basename(STATUS_FILE)) {
				readAndUpdate();
			}
		});
		watcher.on('error', () => {});
	}
}

export function activate(context: vscode.ExtensionContext): void {
	statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100
	);
	statusBarItem.text = '💤 Claude: 待機中';
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	startWatching();
}

export function deactivate(): void {
	if (watcher) {
		watcher.close();
		watcher = undefined;
	}
}
