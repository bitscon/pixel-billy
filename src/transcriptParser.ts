import type * as vscode from 'vscode';
import type { AgentIdentityRecord, AgentState } from './types.js';
import {
	cancelWaitingTimer,
	clearAgentActivity,
	cancelPermissionTimer,
} from './timerManager.js';

function parseAgentIdentity(record: Record<string, unknown>): AgentIdentityRecord | null {
	const agentId = typeof record.agent_id === 'string' ? record.agent_id : null;
	const role = typeof record.role === 'string' ? record.role : null;
	const parentRaw = record.parent_agent_id;
	const parentAgentId = typeof parentRaw === 'string' ? parentRaw : null;
	if (!agentId || !role) {
		return null;
	}
	return {
		agentId,
		role,
		parentAgentId,
	};
}

export function processTranscriptLine(
	agentId: number,
	line: string,
	agents: Map<number, AgentState>,
	waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
	permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
	webview: vscode.Webview | undefined,
): void {
	const agent = agents.get(agentId);
	if (!agent) return;

	try {
		const record = JSON.parse(line) as Record<string, unknown>;

		if (record.type === 'user') {
			cancelWaitingTimer(agentId, waitingTimers);
			clearAgentActivity(agent, agentId, permissionTimers, webview);
			agent.hadToolsInTurn = false;
			return;
		}

		if (record.type === 'assistant') {
			agent.isWaiting = false;
			webview?.postMessage({ type: 'agentStatus', id: agentId, status: 'active' });
			return;
		}

		if (record.type !== 'system') {
			return;
		}

		const subtype = typeof record.subtype === 'string' ? record.subtype : '';
		if (!subtype) {
			return;
		}

		if (subtype === 'agent_identity') {
			agent.agentIdentity = parseAgentIdentity(record);
			return;
		}

		if (subtype === 'billy_mode') {
			const mode = record.mode;
			if (mode === 'plan' || mode === 'build') {
				agent.currentMode = mode;
				webview?.postMessage({
					type: 'agentMode',
					id: agentId,
					mode,
				});
			}
			return;
		}

		if (subtype === 'approval_required') {
			agent.permissionSent = true;
			webview?.postMessage({
				type: 'agentToolPermission',
				id: agentId,
			});
			return;
		}

		if (subtype === 'turn_duration') {
			cancelWaitingTimer(agentId, waitingTimers);
			cancelPermissionTimer(agentId, permissionTimers);

			if (agent.activeToolIds.size > 0) {
				agent.activeToolIds.clear();
				agent.activeToolStatuses.clear();
				agent.activeToolNames.clear();
				agent.activeSubagentToolIds.clear();
				agent.activeSubagentToolNames.clear();
				webview?.postMessage({ type: 'agentToolsClear', id: agentId });
			}

			agent.isWaiting = true;
			agent.hadToolsInTurn = false;
			webview?.postMessage({
				type: 'agentStatus',
				id: agentId,
				status: 'waiting',
			});
		}
	} catch {
		// Ignore malformed lines
	}
}
