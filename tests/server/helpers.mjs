// tests/server 공통 헬퍼. tests/deploy/helpers.sh 방식 답습 —
// 최소 판정 함수 + 임시 서버 부트 유틸. 홈서버·systemd 불필요.
//
// 각 테스트 파일은 이 헬퍼를 import 하고 마지막에 `summary()` 를 부른다.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// index.ts · progressions.ts 는 bootServer 안에서 지연 로드한다 —
// 저장소 헬퍼 유닛 테스트가 이 두 파일 없이도 helpers.mjs 를 임포트할 수 있게.

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, '..', '..');

let PASS = 0;
let FAIL = 0;
const FAILURES = [];

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export function ok(desc) {
	PASS += 1;
	process.stdout.write(`  ${GREEN}✓${RESET} ${desc}\n`);
}

export function ng(desc, detail) {
	FAIL += 1;
	FAILURES.push(desc);
	process.stdout.write(`  ${RED}✗${RESET} ${desc}\n`);
	if (detail !== undefined) process.stdout.write(`      ${DIM}${detail}${RESET}\n`);
}

export function eq(desc, expected, actual) {
	if (expected === actual) ok(desc);
	else ng(desc, `기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`);
}

export function neq(desc, notExpected, actual) {
	if (notExpected !== actual) ok(desc);
	else ng(desc, `기대: '${JSON.stringify(notExpected)}' 아닌 값`);
}

export function assertTrue(desc, cond, detail) {
	if (cond) ok(desc);
	else ng(desc, detail);
}

export function section(title) {
	process.stdout.write(`\n${title}\n`);
}

export function summary(exitOnFail = true) {
	const totalMsg = `${PASS} 통과 · ${FAIL} 실패`;
	process.stdout.write(`\n${totalMsg}\n`);
	if (FAIL > 0) {
		process.stdout.write(`실패: ${FAILURES.join(', ')}\n`);
		if (exitOnFail) process.exit(1);
	}
}

/** 임시 데이터 디렉터리 확보. 각 테스트가 각자 부른다. */
export async function makeTmpDataDir(prefix = 'bigsix-test-') {
	return await mkdtemp(join(tmpdir(), prefix));
}

export async function rmDir(dir) {
	await rm(dir, { recursive: true, force: true });
}

/**
 * 임시 포트에 실제 http.Server 를 띄우고 base URL 을 돌려준다.
 * 종료 시 반드시 `close()` 를 부른다.
 */
export async function bootServer({ dataDir, now, programIds } = {}) {
	const { createBigsixServer, buildContext } = await import('../../server/src/index.ts');
	const { readProgramIds } = await import('../../server/src/progressions.ts');
	const ctx = buildContext(dataDir);
	if (typeof now === 'function') ctx.now = now;
	if (typeof programIds === 'function') ctx.programIds = programIds;
	else ctx.programIds = () => readProgramIds();
	const server = createBigsixServer(ctx);
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (address === null || typeof address === 'string') {
		throw new Error('server address unavailable');
	}
	const base = `http://127.0.0.1:${address.port}`;
	const close = () => new Promise((resolve) => server.close(() => resolve(undefined)));
	return { server, base, close };
}
