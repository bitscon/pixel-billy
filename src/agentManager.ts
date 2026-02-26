import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import type { BillyConfig } from './billyConfig.js';
import type { AgentState, PersistedAgent } from './types.js';
import { cancelWaitingTimer, cancelPermissionTimer } from './timerManager.js';
import { startFileWatching, readNewLines } from './fileWatcher.js';
import { TERMINAL_NAME_PREFIX, WORKSPACE_KEY_AGENTS, WORKSPACE_KEY_AGENT_SEATS, SESSIONS_DIR_NAME } from './constants.js';
import { migrateAndLoadLayout } from './layoutPersistence.js';

function buildRunnerShellArgs(
	runnerScriptPath: string,
	jsonlFile: string,
	sessionId: string,
	billyConfig: BillyConfig,
): string[] {
	const args: string[] = [];
	if (process.versions.electron) {
		args.push('--ms-enable-electron-run-as-node');
	}
	args.push(
		runnerScriptPath,
		'--transcript-path',
		jsonlFile,
		'--base-url',
		billyConfig.baseUrl,
		'--ask-path',
		billyConfig.askPath,
		'--health-path',
		billyConfig.healthPath,
		'--timeout-ms',
		String(billyConfig.requestTimeoutMs),
		'--session-id',
		sessionId,
	);
	return args;
}

export function getSessionsDirPath(cwd?: string): string | null {
	const workspacePath = cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspacePath) return null;
	const homeDir = os.homedir();
	if (!homeDir || !path.isAbsolute(homeDir)) {
		return null;
	}
	const dirName = workspacePath.replace(/[:\\/]/g, '-');
	return path.join(homeDir, '.pixel-agents', SESSIONS_DIR_NAME, dirName);
}

export function launchNewTerminal(
	nextAgentIdRef: { current: number },
	nextTerminalIndexRef: { current: number },
	agents: Map<number, AgentState>,
	fileWatchers: Map<number, fs.FSWatcher>,
	pollingTimers: Map<number, ReturnType<typeof setInterval>>,
	waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
	permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
	webview: vscode.Webview | undefined,
	persistAgents: () => void,
	runnerScriptPath: string,
	billyConfig: BillyConfig,
): void {
	const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const projectDir = getSessionsDirPath(cwd);
	if (!projectDir) {
		vscode.window.showErrorMessage('Pixel Agents: No workspace folder found for Billy session tracking.');
		return;
	}

	if (!fs.existsSync(runnerScriptPath)) {
		vscode.window.showErrorMessage(`Pixel Agents: Billy runner script not found at ${runnerScriptPath}`);
		return;
	}

	const id = nextAgentIdRef.current++;
	const idx = nextTerminalIndexRef.current++;
	const sessionId = crypto.randomUUID();
	const jsonlFile = path.join(projectDir, `${id}.jsonl`);
	try {
		fs.mkdirSync(projectDir, { recursive: true });
		fs.closeSync(fs.openSync(jsonlFile, 'a'));
	} catch (error) {
		const details = error instanceof Error ? error.message : String(error);
		vscode.window.showErrorMessage(`Pixel Agents: Failed to initialize Billy session storage: ${details}`);
		return;
	}

	const runnerArgs = buildRunnerShellArgs(runnerScriptPath, jsonlFile, sessionId, billyConfig);

	const terminal = vscode.window.createTerminal({
		name: `${TERMINAL_NAME_PREFIX} #${idx}`,
		cwd,
		shellPath: process.execPath,
		shellArgs: runnerArgs,
	});
	terminal.show();

	const agent: AgentState = {
		id,
		sessionId,
		terminalRef: terminal,
		projectDir,
		jsonlFile,
		fileOffset: 0,
		lineBuffer: '',
		activeToolIds: new Set(),
		activeToolStatuses: new Map(),
		activeToolNames: new Map(),
		activeSubagentToolIds: new Map(),
		activeSubagentToolNames: new Map(),
		isWaiting: false,
		permissionSent: false,
		hadToolsInTurn: false,
		currentMode: null,
		agentIdentity: null,
	};

	agents.set(id, agent);
	persistAgents();
	console.log(`[Pixel Agents] Agent ${id}: created for terminal ${terminal.name}`);
	webview?.postMessage({ type: 'agentCreated', id });

	startFileWatching(id, jsonlFile, agents, fileWatchers, pollingTimers, waitingTimers, permissionTimers, webview);
	readNewLines(id, agents, waitingTimers, permissionTimers, webview);
}

export function removeAgent(
	agentId: number,
	agents: Map<number, AgentState>,
	fileWatchers: Map<number, fs.FSWatcher>,
	pollingTimers: Map<number, ReturnType<typeof setInterval>>,
	waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
	permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
	persistAgents: () => void,
): void {
	const agent = agents.get(agentId);
	if (!agent) return;

	fileWatchers.get(agentId)?.close();
	fileWatchers.delete(agentId);
	const pt = pollingTimers.get(agentId);
	if (pt) {
		clearInterval(pt);
	}
	pollingTimers.delete(agentId);

	cancelWaitingTimer(agentId, waitingTimers);
	cancelPermissionTimer(agentId, permissionTimers);

	agents.delete(agentId);
	persistAgents();
}

export function persistAgents(
	agents: Map<number, AgentState>,
	context: vscode.ExtensionContext,
): void {
	const persisted: PersistedAgent[] = [];
	for (const agent of agents.values()) {
		persisted.push({
			id: agent.id,
			sessionId: agent.sessionId,
			terminalName: agent.terminalRef.name,
			jsonlFile: agent.jsonlFile,
			projectDir: agent.projectDir,
		});
	}
	context.workspaceState.update(WORKSPACE_KEY_AGENTS, persisted);
}

export function restoreAgents(
	context: vscode.ExtensionContext,
	nextAgentIdRef: { current: number },
	nextTerminalIndexRef: { current: number },
	agents: Map<number, AgentState>,
	fileWatchers: Map<number, fs.FSWatcher>,
	pollingTimers: Map<number, ReturnType<typeof setInterval>>,
	waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
	permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
	webview: vscode.Webview | undefined,
	doPersist: () => void,
): void {
	const persisted = context.workspaceState.get<PersistedAgent[]>(WORKSPACE_KEY_AGENTS, []);
	if (persisted.length === 0) return;

	const liveTerminals = vscode.window.terminals;
	let maxId = 0;
	let maxIdx = 0;

	for (const p of persisted) {
		const terminal = liveTerminals.find((candidate) => candidate.name === p.terminalName);
		if (!terminal) continue;

		try {
			fs.mkdirSync(path.dirname(p.jsonlFile), { recursive: true });
			if (!fs.existsSync(p.jsonlFile)) {
				fs.writeFileSync(p.jsonlFile, '', 'utf-8');
			}
		} catch (error) {
			console.log(`[Pixel Agents] Failed to restore session file for agent ${p.id}: ${error}`);
			continue;
		}

		const agent: AgentState = {
			id: p.id,
			sessionId: p.sessionId || crypto.randomUUID(),
			terminalRef: terminal,
			projectDir: p.projectDir,
			jsonlFile: p.jsonlFile,
			fileOffset: 0,
			lineBuffer: '',
			activeToolIds: new Set(),
			activeToolStatuses: new Map(),
			activeToolNames: new Map(),
			activeSubagentToolIds: new Map(),
			activeSubagentToolNames: new Map(),
			isWaiting: false,
			permissionSent: false,
			hadToolsInTurn: false,
			currentMode: null,
			agentIdentity: null,
		};

		agents.set(p.id, agent);
		console.log(`[Pixel Agents] Restored agent ${p.id} -> terminal "${p.terminalName}"`);

		if (p.id > maxId) maxId = p.id;
		const match = p.terminalName.match(/#(\d+)$/);
		if (match) {
			const idx = Number.parseInt(match[1], 10);
			if (idx > maxIdx) maxIdx = idx;
		}

		try {
			const stat = fs.statSync(p.jsonlFile);
			agent.fileOffset = stat.size;
		} catch {
			agent.fileOffset = 0;
		}
		startFileWatching(p.id, p.jsonlFile, agents, fileWatchers, pollingTimers, waitingTimers, permissionTimers, webview);
	}

	if (maxId >= nextAgentIdRef.current) {
		nextAgentIdRef.current = maxId + 1;
	}
	if (maxIdx >= nextTerminalIndexRef.current) {
		nextTerminalIndexRef.current = maxIdx + 1;
	}

	doPersist();
}

export function sendExistingAgents(
	agents: Map<number, AgentState>,
	context: vscode.ExtensionContext,
	webview: vscode.Webview | undefined,
): void {
	if (!webview) return;
	const agentIds: number[] = [];
	for (const id of agents.keys()) {
		agentIds.push(id);
	}
	agentIds.sort((a, b) => a - b);

	const agentMeta = context.workspaceState.get<Record<string, { palette?: number; hueShift?: number; seatId?: string }>>(WORKSPACE_KEY_AGENT_SEATS, {});
	console.log(`[Pixel Agents] sendExistingAgents: agents=${JSON.stringify(agentIds)}, meta=${JSON.stringify(agentMeta)}`);

	webview.postMessage({
		type: 'existingAgents',
		agents: agentIds,
		agentMeta,
	});

	sendCurrentAgentStatuses(agents, webview);
}

export function sendCurrentAgentStatuses(
	agents: Map<number, AgentState>,
	webview: vscode.Webview | undefined,
): void {
	if (!webview) return;
	for (const [agentId, agent] of agents) {
		for (const [toolId, status] of agent.activeToolStatuses) {
			webview.postMessage({
				type: 'agentToolStart',
				id: agentId,
				toolId,
				status,
			});
		}
		if (agent.currentMode) {
			webview.postMessage({
				type: 'agentMode',
				id: agentId,
				mode: agent.currentMode,
			});
		}
		if (agent.permissionSent) {
			webview.postMessage({ type: 'agentToolPermission', id: agentId });
		}
		if (agent.isWaiting) {
			webview.postMessage({
				type: 'agentStatus',
				id: agentId,
				status: 'waiting',
			});
		}
	}
}

export function sendLayout(
	context: vscode.ExtensionContext,
	webview: vscode.Webview | undefined,
	defaultLayout?: Record<string, unknown> | null,
): void {
	if (!webview) return;
	const layout = migrateAndLoadLayout(context, defaultLayout);
	webview.postMessage({
		type: 'layoutLoaded',
		layout,
	});
}
