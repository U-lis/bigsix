// ADR-33 저장소 안전 장치. 커밋된 파일에 VAPID 비밀키/PEM 리터럴이 유출되지 않았는지 검사.
// server/data/* 는 .gitignore 로 커밋 대상이 아니므로 검사 범위 밖.
// git ls-files 로 tracked + otherwise-untracked non-ignored 를 함께 훑는다.

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, section, ok, ng, assertTrue, summary } from './helpers.mjs';

section('저장소 안전 장치 (ADR-33 · NFR-32)');

// git ls-files: 커밋된 파일 + `-o` 로 아직 커밋되지 않았지만 .gitignore 대상이 아닌 파일도 포함.
// `--exclude-standard` 로 gitignore 규칙 적용.
let raw = '';
try {
	raw = execFileSync(
		'git',
		['-C', REPO_ROOT, 'ls-files', '-co', '--exclude-standard'],
		{ encoding: 'utf8' }
	);
} catch (e) {
	ng('git ls-files 실행', String(e));
	summary();
	process.exit(1);
}

const files = raw
	.split('\n')
	.map((s) => s.trim())
	.filter((s) => s.length > 0);

assertTrue('저장소 파일 목록을 가져왔다', files.length > 0);

// 키 「이름」 이 아니라 키 「값」 을 잡는다.
//
// 처음엔 `VAPID_PRIVATE_KEY` · `vapid.private` 같은 이름을 패턴으로 뒀는데,
// 서버가 비밀키 「파일 경로」 를 정상적으로 참조하기 시작하자마자 (BIGSIX_VAPID_PRIVATE_KEY_PATH)
// 전부 걸려 스위트가 항상 빨갛게 됐다. 늘 실패하는 검사는 곧 꺼지고, 그때 진짜 유출이 지나간다.
// 그래서 이름은 허용하고 값만 본다.
const PEM_PATTERNS = [/-----BEGIN /, /PRIVATE KEY/];

// VAPID 비밀키는 base64url 43자. 40자 이상 문자열 리터럴이 private·secret 을
// 말하는 줄에 있으면 의심한다. 공개키(87자)는 의도적으로 커밋하므로 뺀다.
const KEY_LITERAL = /['"`][A-Za-z0-9_-]{40,}['"`]/;
const SECRETISH = /(private|secret)/i;
const NOT_SECRET = /(public|path|url|endpoint|hash|integrity|sha\d)/i;

export function scanForSecrets(content) {
	const hits = [];
	for (const p of PEM_PATTERNS) {
		if (p.test(content)) hits.push(String(p));
	}
	for (const line of content.split('\n')) {
		if (KEY_LITERAL.test(line) && SECRETISH.test(line) && !NOT_SECRET.test(line)) {
			hits.push('key-literal');
			break;
		}
	}
	return hits;
}

// 검사 대상에서 제외할 경로 (문서화 목적으로 이름이 나와도 되는 자리).
function isExcluded(rel) {
	if (rel.startsWith('server/data/')) return true; // gitignore 대상이지만 방어적으로 이중 배제
	if (rel === 'tests/server/test-no-secrets.mjs') return true; // 이 스위트 자신
	if (rel.startsWith('.dc_workspace/')) return true; // 계획 · 스펙 문서 (문자열만 등장)
	if (rel === 'CHANGELOG.md' || rel === 'README.md') return true; // 문서
	if (rel.endsWith('.md')) return true;
	return false;
}

let violations = [];
for (const rel of files) {
	if (isExcluded(rel)) continue;
	const abs = join(REPO_ROOT, rel);
	let stat;
	try {
		stat = statSync(abs);
	} catch {
		continue;
	}
	if (!stat.isFile()) continue;
	if (stat.size > 2 * 1024 * 1024) continue; // 2MB 초과 자산은 스킵 (icons 등)
	let content;
	try {
		content = readFileSync(abs, 'utf8');
	} catch {
		continue; // 바이너리 등
	}
	for (const hit of scanForSecrets(content)) {
		violations.push({ rel, pattern: hit });
	}
}

// --- 스캐너 자체 검증: 느슨해져서 아무것도 못 잡는 상태가 아닌지 ---
{
	const fakeKey = 'x'.repeat(43);
	assertTrue(
		'PEM 블록을 잡는다',
		scanForSecrets('-----BEGIN EC PRIVATE KEY-----').length > 0
	);
	assertTrue(
		'비밀키 값처럼 보이는 리터럴을 잡는다',
		scanForSecrets(`const vapidPrivate = '${fakeKey}';`).length > 0
	);
	assertTrue(
		'키 파일 경로 이름만 있는 줄은 잡지 않는다 (오탐 방지)',
		scanForSecrets("env.BIGSIX_VAPID_PRIVATE_KEY_PATH ?? join(dataDir, 'vapid.private')").length === 0
	);
	assertTrue(
		'공개키는 커밋 대상이므로 잡지 않는다',
		scanForSecrets(`export const VAPID_PUBLIC_KEY = '${'y'.repeat(87)}';`).length === 0
	);
}

if (violations.length === 0) {
	ok('커밋 대상 파일에 PEM · PRIVATE KEY · VAPID 비밀키 리터럴이 없다');
} else {
	for (const v of violations) {
		ng(`비밀키 패턴 유출 의심: ${v.rel}`, `pattern ${v.pattern}`);
	}
}

// server/data/vapid.private 이 실제 파일이라도 gitignore 로 무시되는지 (미래 Phase 4 대비).
{
	// git check-ignore 로 확인.
	let ignored = false;
	try {
		execFileSync('git', ['-C', REPO_ROOT, 'check-ignore', '-q', 'server/data/vapid.private']);
		ignored = true;
	} catch (e) {
		// exit code 1 은 「매칭 없음」 · 다른 코드는 에러.
		if (/** @type {any} */ (e).status === 1) {
			ignored = false;
		} else {
			ng('git check-ignore 실행', String(e));
		}
	}
	assertTrue(
		'.gitignore 가 server/data/vapid.private 를 무시한다 (ADR-33)',
		ignored,
		'server/data/* 규칙과 .gitkeep 예외가 있어야 함'
	);
}

// subscriptions.json 도 마찬가지로 무시되는지.
{
	let ignored = false;
	try {
		execFileSync('git', ['-C', REPO_ROOT, 'check-ignore', '-q', 'server/data/subscriptions.json']);
		ignored = true;
	} catch (e) {
		if (/** @type {any} */ (e).status === 1) ignored = false;
	}
	assertTrue('.gitignore 가 server/data/subscriptions.json 을 무시한다', ignored);
}

// .gitkeep 는 반대로 커밋 대상이어야 한다.
{
	let ignored = false;
	try {
		execFileSync('git', ['-C', REPO_ROOT, 'check-ignore', '-q', 'server/data/.gitkeep']);
		ignored = true;
	} catch (e) {
		if (/** @type {any} */ (e).status === 1) ignored = false;
	}
	assertTrue('server/data/.gitkeep 는 커밋 대상이다 (! 예외)', !ignored);
}

summary();
