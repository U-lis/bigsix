// 서버 환경 변수 로더. Phase 2 — ADR-29.
//
// - BIGSIX_PORT  기본값 8791 (nginx `proxy_pass http://127.0.0.1:8791/;` 와 짝).
// - BIGSIX_DATA_DIR  기본값 'server/data'. subscriptions.json 이 놓일 자리.

export interface Config {
	port: number;
	dataDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const rawPort = env.BIGSIX_PORT ?? '8791';
	const port = Number.parseInt(rawPort, 10);
	if (!Number.isInteger(port) || port < 1 || port > 65535 || String(port) !== rawPort.trim()) {
		throw new Error(`BIGSIX_PORT 가 유효한 정수(1~65535)가 아님: ${env.BIGSIX_PORT}`);
	}
	const dataDir = env.BIGSIX_DATA_DIR ?? 'server/data';
	return { port, dataDir };
}
