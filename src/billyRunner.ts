import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

interface RunnerConfig {
	transcriptPath: string;
	baseUrl: string;
	askPath: string;
	healthPath: string;
	timeoutMs: number;
	sessionId: string;
}

interface AskResponse {
	message?: string;
	foreman_mode?: 'plan' | 'build';
	approval_required?: boolean;
}

function parseArgs(argv: string[]): RunnerConfig {
	const values = new Map<string, string>();

	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];
		if (!token.startsWith('--')) {
			continue;
		}

		const maybeEq = token.indexOf('=');
		if (maybeEq >= 0) {
			const key = token.slice(2, maybeEq);
			const value = token.slice(maybeEq + 1);
			values.set(key, value);
			continue;
		}

		const key = token.slice(2);
		const next = argv[i + 1];
		if (next && !next.startsWith('--')) {
			values.set(key, next);
			i += 1;
		} else {
			values.set(key, '');
		}
	}

	const transcriptPath = values.get('transcript-path') ?? '';
	const baseUrl = values.get('base-url') ?? '';
	const askPath = values.get('ask-path') ?? '';
	const healthPath = values.get('health-path') ?? '';
	const timeoutRaw = values.get('timeout-ms') ?? '';
	const sessionId = values.get('session-id') ?? '';

	if (!transcriptPath) {
		throw new Error('missing --transcript-path');
	}
	if (!baseUrl) {
		throw new Error('missing --base-url');
	}
	if (!askPath) {
		throw new Error('missing --ask-path');
	}
	if (!healthPath) {
		throw new Error('missing --health-path');
	}
	if (!sessionId) {
		throw new Error('missing --session-id');
	}

	const timeoutMs = Number.parseInt(timeoutRaw, 10);
	if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
		throw new Error('invalid --timeout-ms (must be >= 1000)');
	}

	return {
		transcriptPath,
		baseUrl: normalizeBaseUrl(baseUrl),
		askPath: normalizePath(askPath),
		healthPath: normalizePath(healthPath),
		timeoutMs,
		sessionId,
	};
}

function normalizeBaseUrl(value: string): string {
	const url = new URL(value);
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error('base URL must be http or https');
	}
	url.hash = '';
	url.search = '';
	url.pathname = url.pathname.replace(/\/+$/, '');
	return url.toString().replace(/\/+$/, '');
}

function normalizePath(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error('path cannot be empty');
	}
	if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
		throw new Error('path must not be a full URL');
	}
	const prefixed = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	return prefixed.replace(/\/+$/, '') || '/';
}

function appendRecord(transcriptPath: string, record: Record<string, unknown>): void {
	fs.appendFileSync(transcriptPath, `${JSON.stringify(record)}\n`, 'utf-8');
}

function printAssistant(message: string): void {
	const lines = message.split('\n');
	if (lines.length === 0) {
		console.log('billy>');
		return;
	}
	for (let index = 0; index < lines.length; index += 1) {
		const prefix = index === 0 ? 'billy>' : '     ';
		console.log(`${prefix} ${lines[index]}`);
	}
}

async function fetchWithTimeout(
	url: string,
	options: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, {
			...options,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timer);
	}
}

async function checkHealth(config: RunnerConfig): Promise<void> {
	const url = `${config.baseUrl}${config.healthPath}`;
	try {
		const response = await fetchWithTimeout(url, { method: 'GET' }, config.timeoutMs);
		if (!response.ok) {
			console.log(`billy> Warning: health check failed (${response.status}).`);
		}
	} catch {
		console.log('billy> Warning: Billy Runtime health check failed. Continuing in offline-retry mode.');
	}
}

async function askBilly(config: RunnerConfig, prompt: string): Promise<AskResponse> {
	const url = `${config.baseUrl}${config.askPath}`;
	const response = await fetchWithTimeout(
		url,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				prompt,
				session_id: config.sessionId,
			}),
		},
		config.timeoutMs,
	);

	if (!response.ok) {
		throw new Error(`Billy Runtime returned HTTP ${response.status}.`);
	}

	const payload = await response.json() as AskResponse;
	return payload;
}

async function run(): Promise<void> {
	let config: RunnerConfig;
	try {
		config = parseArgs(process.argv.slice(2));
	} catch (error) {
		const details = error instanceof Error ? error.message : 'unknown argument error';
		console.error(`billy> Startup error: ${details}`);
		process.exit(1);
		return;
	}

	fs.mkdirSync(path.dirname(config.transcriptPath), { recursive: true });
	if (!fs.existsSync(config.transcriptPath)) {
		fs.writeFileSync(config.transcriptPath, '', 'utf-8');
	}

	appendRecord(config.transcriptPath, {
		type: 'system',
		subtype: 'agent_identity',
		agent_id: 'billy',
		role: 'primary',
		parent_agent_id: null,
	});

	await checkHealth(config);

	console.log('billy> Connected to Billy Runtime. Type your prompt, or `exit` to close.');

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: true,
	});

	let isProcessing = false;

	const promptUser = (): void => {
		rl.setPrompt('you> ');
		rl.prompt();
	};

	const handleLine = async (line: string): Promise<void> => {
		const prompt = line.trim();
		if (!prompt) {
			return;
		}

		if (prompt.toLowerCase() === 'exit' || prompt.toLowerCase() === 'quit') {
			rl.close();
			return;
		}

		appendRecord(config.transcriptPath, {
			type: 'user',
			message: {
				content: prompt,
			},
		});

		const started = Date.now();
		try {
			const response = await askBilly(config, prompt);
			const assistantMessage = (response.message ?? '').trim() || 'No message returned from Billy Runtime.';
			printAssistant(assistantMessage);
			appendRecord(config.transcriptPath, {
				type: 'assistant',
				message: {
					content: assistantMessage,
				},
			});

			if (response.foreman_mode === 'plan' || response.foreman_mode === 'build') {
				appendRecord(config.transcriptPath, {
					type: 'system',
					subtype: 'billy_mode',
					mode: response.foreman_mode,
				});
			}

			if (response.approval_required === true) {
				appendRecord(config.transcriptPath, {
					type: 'system',
					subtype: 'approval_required',
				});
			}
		} catch (error) {
			const details = error instanceof Error ? error.message : 'unknown error';
			const fallback = `Billy Runtime request failed: ${details} Check pixel-billy.billy settings and ensure Billy Runtime is running.`;
			printAssistant(fallback);
			appendRecord(config.transcriptPath, {
				type: 'assistant',
				message: {
					content: fallback,
				},
			});
		} finally {
			appendRecord(config.transcriptPath, {
				type: 'system',
				subtype: 'turn_duration',
				ms: Math.max(0, Date.now() - started),
			});
		}
	};

	rl.on('line', (line) => {
		if (isProcessing) {
			console.log('billy> Still processing the previous prompt...');
			promptUser();
			return;
		}

		isProcessing = true;
		void handleLine(line)
			.catch((error) => {
				const details = error instanceof Error ? error.message : 'unknown processing error';
				console.log(`billy> Unexpected processing error: ${details}`);
			})
			.finally(() => {
				isProcessing = false;
				promptUser();
			});
	});

	rl.on('close', () => {
		console.log('billy> Session closed.');
		process.exit(0);
	});

	promptUser();
}

void run();
