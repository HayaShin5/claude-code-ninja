import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const STATUS_FILE = path.join(CLAUDE_DIR, 'vscode-status');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');

const HOOKS_CONFIG = {
	Notification: [
		{ matcher: '', hooks: [{ type: 'command', command: `echo 'waiting' > ~/.claude/vscode-status` }] }
	],
	PostToolUse: [
		{ matcher: '', hooks: [{ type: 'command', command: `echo 'working' > ~/.claude/vscode-status` }] }
	],
	Stop: [
		{ matcher: '', hooks: [{ type: 'command', command: `echo 'idle' > ~/.claude/vscode-status` }] }
	],
};

let statusBarItem: vscode.StatusBarItem;
let watcher: fs.FSWatcher | undefined;

function isEnabled(): boolean {
	return vscode.workspace.getConfiguration('claude-code-focus').get('enabled', true);
}

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
			vscode.commands.executeCommand('workbench.action.terminal.focus');
			break;
	}
}

function readAndUpdate(): void {
	if (!isEnabled()) {
		return;
	}
	try {
		const content = fs.readFileSync(STATUS_FILE, 'utf-8');
		updateStatus(content);
	} catch {
		// File doesn't exist or can't be read — do nothing
	}
}

function startWatching(): void {
	try {
		fs.accessSync(CLAUDE_DIR);
	} catch {
		// ~/.claude/ doesn't exist — do nothing
		return;
	}

	// Watch the directory instead of the file directly.
	// fs.watch on a file can miss events on macOS when the file is overwritten.
	watcher = fs.watch(CLAUDE_DIR, (_, filename) => {
		if (filename === path.basename(STATUS_FILE)) {
			readAndUpdate();
		}
	});
	watcher.on('error', () => {});
}

async function setupHooks(): Promise<void> {
	let settings: Record<string, unknown> = {};
	try {
		const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
		settings = JSON.parse(content);
	} catch {
		// File doesn't exist or is invalid — start fresh
	}

	const existing = settings.hooks as Record<string, unknown[]> | undefined;
	if (existing?.Notification && existing?.PostToolUse && existing?.Stop) {
		const hasVscodeStatus = (arr: unknown[]) =>
			JSON.stringify(arr).includes('vscode-status');
		if (hasVscodeStatus(existing.Notification) &&
			hasVscodeStatus(existing.PostToolUse) &&
			hasVscodeStatus(existing.Stop)) {
			vscode.window.showInformationMessage('Claude Code Focus hooks are already configured.');
			return;
		}
	}

	const mergedHooks: Record<string, unknown[]> = { ...(existing || {}) };
	for (const [event, config] of Object.entries(HOOKS_CONFIG)) {
		const current = mergedHooks[event] as unknown[] | undefined;
		if (current) {
			if (!JSON.stringify(current).includes('vscode-status')) {
				mergedHooks[event] = [...current, ...config];
			}
		} else {
			mergedHooks[event] = config;
		}
	}

	settings.hooks = mergedHooks;

	fs.mkdirSync(CLAUDE_DIR, { recursive: true });
	fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n');
	vscode.window.showInformationMessage('Claude Code Focus hooks have been configured in ~/.claude/settings.json');
}

export function activate(context: vscode.ExtensionContext): void {
	statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100
	);
	statusBarItem.text = '💤 Claude: 待機中';
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	context.subscriptions.push(
		vscode.commands.registerCommand('claude-code-focus.setupHooks', setupHooks)
	);

	startWatching();
}

export function deactivate(): void {
	if (watcher) {
		watcher.close();
		watcher = undefined;
	}
}
