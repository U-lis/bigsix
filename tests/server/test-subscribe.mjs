// POST/DELETE /subscribe 통합 테스트. 실제 http.Server 를 임시 포트에 띄우고 fetch.
// FR-36.1 (201/200/400) · FR-36.2 (204/idempotent/400) · FR-36.3 (CORS 없음) · FR-36.4 (이유 문자열).
// NFR-31 안전 장치: 알려지지 않은 필드는 400. 종목명 · 요일 · 단계 · 수행 여부 필드는 스키마에 없다.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	bootServer,
	makeTmpDataDir,
	rmDir,
	section,
	eq,
	assertTrue,
	summary
} from './helpers.mjs';

section('POST/DELETE /subscribe (FR-36)');

const validBody = () => ({
	endpoint: 'https://fcm.googleapis.com/fcm/send/endpoint-a',
	keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
	programId: 'good_behavior',
	notifyAt: '19:00',
	tz: 'Asia/Seoul'
});

async function post(base, body) {
	return await fetch(`${base}/subscribe`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
}

async function del(base, body) {
	return await fetch(`${base}/subscribe`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
}

async function loadStoreFile(dir) {
	const raw = await readFile(join(dir, 'subscriptions.json'), 'utf8');
	return JSON.parse(raw);
}

// --- 유효한 body → 201, 재요청 → 200, createdAt 유지 · updatedAt 갱신 ---
{
	const dir = await makeTmpDataDir();
	let nowCalls = 0;
	const nows = ['2026-09-25T10:00:00.000Z', '2026-09-26T11:00:00.000Z'];
	const { base, close } = await bootServer({
		dataDir: dir,
		now: () => nows[Math.min(nowCalls++, nows.length - 1)]
	});
	try {
		const r1 = await post(base, validBody());
		eq('신규 POST → 201', 201, r1.status);
		eq('신규 POST 응답 body 비어 있음', '', await r1.text());

		const b2 = { ...validBody(), notifyAt: '07:30' };
		const r2 = await post(base, b2);
		eq('같은 endpoint 갱신 POST → 200', 200, r2.status);

		const store = await loadStoreFile(dir);
		const sub = store.subscriptions['https://fcm.googleapis.com/fcm/send/endpoint-a'];
		eq('저장된 notifyAt 이 새 값', '07:30', sub?.notifyAt);
		eq('createdAt 은 첫 등록 시각 유지', nows[0], sub?.createdAt);
		eq('updatedAt 은 두 번째 시각으로 갱신', nows[1], sub?.updatedAt);

		// FR-36.3 — CORS 헤더 미설정.
		assertTrue(
			'Access-Control-Allow-Origin 헤더 없음 (CORS 없음)',
			r1.headers.get('access-control-allow-origin') === null
		);
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- JSON 파싱 실패 → 400 not-json ---
{
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		const r = await post(base, '{not-json');
		eq('parse 실패 → 400', 400, r.status);
		eq('본문 이유: not-json', 'not-json', await r.text());
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- shape 오류: keys.p256dh 누락 ---
{
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		const bad = { ...validBody(), keys: { auth: 'a' } };
		const r = await post(base, bad);
		eq('p256dh 누락 → 400', 400, r.status);
		eq('이유 문자열: p256dh-missing', 'p256dh-missing', await r.text());
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- notifyAt 잘못된 값 ---
for (const bad of ['25:00', '19:60', '9:00', 'abc', '']) {
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		const r = await post(base, { ...validBody(), notifyAt: bad });
		eq(`notifyAt='${bad}' → 400`, 400, r.status);
		eq(`notifyAt='${bad}' 이유`, 'notifyAt-invalid', await r.text());
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- tz 잘못된 값 ---
{
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		const r = await post(base, { ...validBody(), tz: 'Foo/Bar' });
		eq(`tz='Foo/Bar' → 400`, 400, r.status);
		eq(`tz 잘못된 값 이유`, 'tz-invalid', await r.text());
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- programId 가 progressions.json 에 없음 ---
{
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		const r = await post(base, { ...validBody(), programId: 'not_a_program' });
		eq('programId 존재 안 함 → 400', 400, r.status);
		eq('이유: programId-unknown', 'programId-unknown', await r.text());
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- endpoint 도메인 화이트리스트: 알려진 푸시 서비스 통과 (등록 시점 · SPEC4 Phase 2 검증 인계) ---
for (const good of [
	'https://fcm.googleapis.com/fcm/send/token-a',
	'https://updates.push.services.mozilla.com/wpush/v2/tokX',
	'https://web.push.apple.com/some-token'
]) {
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		const r = await post(base, { ...validBody(), endpoint: good });
		eq(`허용 endpoint 통과: ${good}`, 201, r.status);
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- endpoint 도메인 화이트리스트: 임의 도메인 거절 (SSRF 방어) ---
for (const bad of [
	'https://example.com/endpoint-x',
	'https://push.example/endpoint-a',
	'https://api.example.com/wpush/token'
]) {
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		const r = await post(base, { ...validBody(), endpoint: bad });
		eq(`임의 도메인 거절: ${bad}`, 400, r.status);
		eq(`임의 도메인 이유: ${bad}`, 'endpoint-host', await r.text());
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- endpoint 스킴 · localhost · 사설 IP 거절 ---
{
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		const r = await post(base, { ...validBody(), endpoint: 'http://fcm.googleapis.com/x' });
		eq('http 스킴 거절 → 400', 400, r.status);
		eq('http 스킴 이유', 'endpoint-scheme', await r.text());
	} finally {
		await close();
		await rmDir(dir);
	}
}
for (const bad of [
	'https://localhost/x',
	'https://127.0.0.1/x',
	'https://192.168.1.10/x',
	'https://10.0.0.5/x'
]) {
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		const r = await post(base, { ...validBody(), endpoint: bad });
		eq(`localhost/사설 IP 거절: ${bad}`, 400, r.status);
		eq(`localhost/사설 IP 이유: ${bad}`, 'endpoint-host', await r.text());
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- NFR-31: 스키마 밖 필드 (요일·종목표·단계·수행 여부) 는 400 ---
for (const extra of ['weekdays', 'progressions', 'step', 'done', 'programName']) {
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		const body = { ...validBody(), [extra]: 'x' };
		const r = await post(base, body);
		eq(`NFR-31: '${extra}' 필드 → 400`, 400, r.status);
		const reason = await r.text();
		assertTrue(
			`NFR-31: '${extra}' 이유가 unknown-field 계열`,
			reason.startsWith('unknown-field:'),
			`실제: ${reason}`
		);
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- DELETE — 존재하지 않는 endpoint 도 204 ---
{
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		const r = await del(base, { endpoint: 'https://fcm.googleapis.com/fcm/send/nonexistent' });
		eq('없는 endpoint DELETE → 204', 204, r.status);
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- DELETE — 있는 endpoint 는 파일에서 제거 ---
{
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		await post(base, validBody());
		const r = await del(base, { endpoint: 'https://fcm.googleapis.com/fcm/send/endpoint-a' });
		eq('존재 endpoint DELETE → 204', 204, r.status);
		const store = await loadStoreFile(dir);
		eq('파일에서 endpoint 사라짐', undefined, store.subscriptions['https://fcm.googleapis.com/fcm/send/endpoint-a']);
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- DELETE — sentLog 프리픽스도 정리된다 ---
{
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		await post(base, validBody());
		// sentLog 를 파일에 직접 심고 다시 로드하도록 서버를 통한다 (DELETE 흐름).
		const raw = await loadStoreFile(dir);
		raw.sentLog = { 'https://fcm.googleapis.com/fcm/send/endpoint-a|2026-09-25': '2026-09-25T19:00:00.000Z' };
		const { writeFile } = await import('node:fs/promises');
		await writeFile(join(dir, 'subscriptions.json'), JSON.stringify(raw), 'utf8');

		const r = await del(base, { endpoint: 'https://fcm.googleapis.com/fcm/send/endpoint-a' });
		eq('DELETE → 204', 204, r.status);
		const after = await loadStoreFile(dir);
		eq(
			'sentLog 프리픽스 항목 사라짐',
			undefined,
			after.sentLog['https://fcm.googleapis.com/fcm/send/endpoint-a|2026-09-25']
		);
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- DELETE — JSON 파싱 실패 → 400 not-json ---
{
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		const r = await del(base, 'nope');
		eq('DELETE not-json → 400', 400, r.status);
		eq('이유: not-json', 'not-json', await r.text());
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- DELETE — endpoint 필드 없음 → 400 endpoint-missing ---
{
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		const r = await del(base, { foo: 'bar' });
		eq('DELETE endpoint 없음 → 400', 400, r.status);
		eq('이유: endpoint-missing', 'endpoint-missing', await r.text());
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- 알 수 없는 경로 → 404 ---
{
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		const r = await fetch(`${base}/foo`, { method: 'POST' });
		eq('알 수 없는 경로 → 404', 404, r.status);
		eq('본문: not-found', 'not-found', await r.text());
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- 알 수 없는 메서드 → 404 ---
{
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		const r = await fetch(`${base}/subscribe`, { method: 'GET' });
		eq('GET /subscribe → 404', 404, r.status);
	} finally {
		await close();
		await rmDir(dir);
	}
}

// --- NFR-31 저장 확인: subscriptions.json 에 도메인 필드가 섞이지 않는다 ---
{
	const dir = await makeTmpDataDir();
	const { base, close } = await bootServer({ dataDir: dir });
	try {
		await post(base, validBody());
		const store = await loadStoreFile(dir);
		const sub = store.subscriptions['https://fcm.googleapis.com/fcm/send/endpoint-a'];
		const keys = new Set(Object.keys(sub));
		const expected = ['keys', 'programId', 'notifyAt', 'tz', 'createdAt', 'updatedAt'];
		eq('NFR-31: 저장 필드 수', expected.length, keys.size);
		for (const k of expected) {
			assertTrue(`NFR-31: 저장 필드 포함 '${k}'`, keys.has(k));
		}
		for (const forbidden of ['weekdays', 'progressions', 'step', 'done', 'sessions']) {
			assertTrue(`NFR-31: 저장 필드에 '${forbidden}' 없음`, !keys.has(forbidden));
		}
	} finally {
		await close();
		await rmDir(dir);
	}
}

summary();
