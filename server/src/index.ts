// HTTP 서버 진입점. ADR-29 — Node.js 24 + native `node:http`. 프레임워크 없음.
//
// nginx `proxy_pass http://127.0.0.1:8791/;` (끝 슬래시) 가 `/api/push/subscribe`
// → `/subscribe` 로 rewrite. 서버는 `/subscribe` 만 안다.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadConfig } from './config.ts';
import {
	handleSubscribeDelete,
	handleSubscribePost,
	type HandleContext,
	type HandlerResponse
} from './handlers.ts';
import { readProgramIds } from './progressions.ts';

export function buildContext(dataDir: string): HandleContext {
	return {
		dataDir,
		now: () => new Date().toISOString(),
		programIds: () => readProgramIds()
	};
}

async function readBody(req: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const c of req) chunks.push(c as Buffer);
	return Buffer.concat(chunks).toString('utf8');
}

export async function route(
	method: string | undefined,
	url: string | undefined,
	body: string,
	ctx: HandleContext
): Promise<HandlerResponse> {
	if (method === 'POST' && url === '/subscribe') {
		return handleSubscribePost(body, ctx);
	}
	if (method === 'DELETE' && url === '/subscribe') {
		return handleSubscribeDelete(body, ctx);
	}
	return { status: 404, body: 'not-found' };
}

export function createBigsixServer(ctx: HandleContext) {
	return createServer(async (req: IncomingMessage, res: ServerResponse) => {
		try {
			const body = await readBody(req);
			const out = await route(req.method, req.url, body, ctx);
			res.writeHead(out.status, { 'Content-Type': 'text/plain; charset=utf-8' });
			res.end(out.body ?? '');
			console.log(req.method, req.url, out.status);
		} catch (e) {
			// 저장소 I/O 나 예외적 오류. 200/201 이 나가버리기 전에만 500.
			console.error('handler error', e);
			if (!res.headersSent) {
				res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
				res.end('server-error');
			} else {
				res.end();
			}
		}
	});
}

function isEntry(): boolean {
	// `node --experimental-strip-types server/src/index.ts` 로 직접 실행됐을 때만 서버 부팅.
	// 테스트 · 외부 진입은 buildContext + createBigsixServer 를 각자 부른다.
	const argv1 = process.argv[1];
	if (typeof argv1 !== 'string') return false;
	try {
		const entryUrl = new URL(`file://${argv1}`).href;
		return entryUrl === import.meta.url;
	} catch {
		return false;
	}
}

if (isEntry()) {
	const cfg = loadConfig();
	const ctx = buildContext(cfg.dataDir);
	const server = createBigsixServer(ctx);
	server.listen(cfg.port, '127.0.0.1', () => {
		console.log(`bigsix push api on ${cfg.port}`);
	});
}
