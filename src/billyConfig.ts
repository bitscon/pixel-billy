import * as vscode from 'vscode';

const DEFAULT_BASE_URL = 'http://127.0.0.1:5001';
const DEFAULT_ASK_PATH = '/ask';
const DEFAULT_HEALTH_PATH = '/health';
const DEFAULT_TIMEOUT_MS = 60000;
const MIN_TIMEOUT_MS = 1000;

export interface BillyConfig {
	baseUrl: string;
	askPath: string;
	healthPath: string;
	requestTimeoutMs: number;
}

function normalizeBaseUrl(raw: string): string {
	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		throw new Error('Billy base URL must be a valid HTTP(S) URL.');
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('Billy base URL must use http or https.');
	}

	parsed.hash = '';
	parsed.search = '';
	parsed.pathname = parsed.pathname.replace(/\/+$/, '');
	return parsed.toString().replace(/\/+$/, '');
}

function normalizePath(raw: string, name: string): string {
	const trimmed = raw.trim();
	if (!trimmed) {
		throw new Error(`${name} cannot be empty.`);
	}

	if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
		throw new Error(`${name} must be a path like /ask, not a full URL.`);
	}

	const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	return withSlash.replace(/\/+$/, '') || '/';
}

function normalizeTimeoutMs(raw: number): number {
	if (!Number.isFinite(raw)) {
		throw new Error('Billy request timeout must be a number.');
	}

	const normalized = Math.floor(raw);
	if (normalized < MIN_TIMEOUT_MS) {
		throw new Error(`Billy request timeout must be at least ${MIN_TIMEOUT_MS} ms.`);
	}
	return normalized;
}

export function readBillyConfig(): BillyConfig | null {
	const config = vscode.workspace.getConfiguration('pixel-agents');
	const rawBaseUrl = config.get<string>('billy.baseUrl', DEFAULT_BASE_URL) ?? DEFAULT_BASE_URL;
	const rawAskPath = config.get<string>('billy.askPath', DEFAULT_ASK_PATH) ?? DEFAULT_ASK_PATH;
	const rawHealthPath = config.get<string>('billy.healthPath', DEFAULT_HEALTH_PATH) ?? DEFAULT_HEALTH_PATH;
	const rawTimeout = config.get<number>('billy.requestTimeoutMs', DEFAULT_TIMEOUT_MS) ?? DEFAULT_TIMEOUT_MS;

	try {
		return {
			baseUrl: normalizeBaseUrl(rawBaseUrl.trim()),
			askPath: normalizePath(rawAskPath, 'Billy ask path'),
			healthPath: normalizePath(rawHealthPath, 'Billy health path'),
			requestTimeoutMs: normalizeTimeoutMs(rawTimeout),
		};
	} catch (error) {
		const details = error instanceof Error ? error.message : 'Unknown configuration error.';
		vscode.window.showErrorMessage(`Pixel Agents Billy configuration error: ${details}`);
		return null;
	}
}
