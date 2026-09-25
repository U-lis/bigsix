// server/src/scheduler.ts — tick 매칭 · dedup · 만료 정리 (FR-37 · ADR-32).
//
// `now` 와 `send` 를 주입해 결정적으로 테스트한다. 실제 web-push · 실제 시각에
// 의존하지 않는다. 시각 판정은 UTC now 를 명시적으로 넣고 각 구독의 tz 로
// 지역화한 결과를 확인 — 자정 경계도 tz 지역화가 처리하므로 특별 케이스 없음.

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	runTick,
	localizeToTz,
	pruneSentLog
} from '../../server/src/scheduler.ts';
import { emptyStore, upsertSubscription } from '../../server/src/subscriptions.ts';
import { makeTmpDataDir, rmDir, section, eq, assertTrue, ok, ng, summary } from './helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
void HERE;

const VAPID = {
	subject: 'mailto:test@example.com',
	publicKey: 'PUB',
	privateKey: 'PRIV'
};
const KEYS = { p256dh: 'p', auth: 'a' };
const ENDPOINT_SEOUL = 'https://fcm.googleapis.com/fcm/send/seoul-user';
const ENDPOINT_NY = 'https://fcm.googleapis.com/fcm/send/ny-user';

async function loadStoreFile(dir) {
	const raw = await readFile(join(dir, 'subscriptions.json'), 'utf8');
	return JSON.parse(raw);
}

async function seedStore(dir, mutate) {
	let s = emptyStore();
	s = mutate(s);
	await writeFile(join(dir, 'subscriptions.json'), JSON.stringify(s, null, 2), 'utf8');
	return s;
}

/** 발송 결과를 지시하는 스텁 생성기. */
function fakeSend(scheduleByEndpoint = {}, defaultResult = { kind: 'ok' }) {
	const calls = [];
	async function send(endpoint, sub, payload, vapid) {
		calls.push({ endpoint, sub, payload, vapid });
		return scheduleByEndpoint[endpoint] ?? defaultResult;
	}
	return { send, calls };
}

// === localizeToTz ===
section('localizeToTz — Intl.DateTimeFormat 로 tz 지역화');

{
	// 2026-11-30 10:00Z = 서울 19:00 (KST +9). 2026-11-30 은 월요일.
	const utc = new Date('2026-11-30T10:00:00Z');
	const seoul = localizeToTz(utc, 'Asia/Seoul');
	if (seoul === null) ng('서울 지역화 실패');
	else {
		eq('서울 date', '2026-11-30', seoul.date);
		eq('서울 hhmm', '19:00', seoul.hhmm);
		eq('서울 weekday', '월', seoul.weekday);
	}
	const ny = localizeToTz(utc, 'America/New_York');
	if (ny === null) ng('뉴욕 지역화 실패');
	else {
		eq('뉴욕 date', '2026-11-30', ny.date);
		eq('뉴욕 hhmm', '05:00', ny.hhmm);
		eq('뉴욕 weekday', '월', ny.weekday);
	}
}
eq('잘못된 tz → null', null, localizeToTz(new Date('2026-11-30T10:00:00Z'), 'Foo/Bar'));

// 자정 경계 — 서울 2026-12-01 00:30 = UTC 2026-11-30 15:30.
{
	const utc = new Date('2026-11-30T15:30:00Z');
	const seoul = localizeToTz(utc, 'Asia/Seoul');
	if (seoul === null) ng('자정 경계 지역화 실패');
	else {
		eq('자정 경계 date (다음 날)', '2026-12-01', seoul.date);
		eq('자정 경계 hhmm', '00:30', seoul.hhmm);
		eq('자정 경계 weekday (화)', '화', seoul.weekday);
	}
}

// === pruneSentLog ===
section('pruneSentLog — 8일 보존 경계 (ADR-32)');

const NOW = new Date('2026-11-30T00:00:00Z');

// 오늘 유지.
{
	const log = { 'e|2026-11-30': 't' };
	const out = pruneSentLog(log, NOW, 8);
	eq("오늘(2026-11-30) 엔트리 유지", 't', out['e|2026-11-30']);
}
// 8일 전 유지 (경계).
{
	const log = { 'e|2026-11-22': 't' };
	const out = pruneSentLog(log, NOW, 8);
	eq('8일 전 엔트리 유지 (경계 포함)', 't', out['e|2026-11-22']);
}
// 9일 전 유지 (아직 컷오프 미만: cutoff = 2026-11-22, entry >= cutoffStr → 유지 하는 정책).
// PLAN 초안대로: cutoff = now - 8 = 2026-11-22. entry >= cutoff → 유지.
// 2026-11-21 은 < 2026-11-22 → 제거.
{
	const log = { 'e|2026-11-21': 't' };
	const out = pruneSentLog(log, NOW, 8);
	eq('9일 전 엔트리 제거', undefined, out['e|2026-11-21']);
}
// 10일 전 제거.
{
	const log = { 'e|2026-11-20': 't' };
	const out = pruneSentLog(log, NOW, 8);
	eq('10일 전 엔트리 제거', undefined, out['e|2026-11-20']);
}
// endpoint 안에 파이프 있어도 마지막 파이프 이후가 날짜.
{
	const log = { 'https://x/y|z|2026-11-30': 't', 'https://x/y|z|2026-11-01': 't' };
	const out = pruneSentLog(log, NOW, 8);
	eq('마지막 파이프 이후를 날짜로 판정 (신규 유지)', 't', out['https://x/y|z|2026-11-30']);
	eq('마지막 파이프 이후를 날짜로 판정 (오래된 것 제거)', undefined, out['https://x/y|z|2026-11-01']);
}
// 변화 없으면 동일 참조.
{
	const log = { 'e|2026-11-30': 't' };
	const out = pruneSentLog(log, NOW, 8);
	assertTrue('변화 없으면 동일 참조', out === log);
}

// === runTick — 매칭 · dedup ===
section('runTick — 매칭 · dedup · gone 처리');

async function seedOne(dir, endpoint, overrides = {}) {
	const now = '2026-11-30T00:00:00.000Z';
	let store = emptyStore();
	({ store } = upsertSubscription(
		store,
		endpoint,
		{
			keys: KEYS,
			programId: overrides.programId ?? 'good_behavior',
			notifyAt: overrides.notifyAt ?? '19:00',
			tz: overrides.tz ?? 'Asia/Seoul'
		},
		now
	));
	if (overrides.sentLog !== undefined) store = { ...store, sentLog: overrides.sentLog };
	await writeFile(join(dir, 'subscriptions.json'), JSON.stringify(store, null, 2), 'utf8');
}

// (1) 매칭: good_behavior 월요일 19:00 서울 → 발송 1건.
{
	const dir = await makeTmpDataDir();
	try {
		await seedOne(dir, ENDPOINT_SEOUL);
		const { send, calls } = fakeSend();
		const r = await runTick({
			dataDir: dir,
			now: new Date('2026-11-30T10:00:00Z'), // 서울 월요일 19:00
			vapid: VAPID,
			retentionDays: 8,
			send
		});
		eq('sent=1', 1, r.sent);
		eq('skipped=0', 0, r.skipped);
		eq('removed=0', 0, r.removed);
		eq('send 호출 1회', 1, calls.length);
		eq('발송 endpoint', ENDPOINT_SEOUL, calls[0].endpoint);
		eq('payload title', '빅6', calls[0].payload.title);
		eq('payload body', '모범수 · 푸시업, 레그 레이즈', calls[0].payload.body);
		const after = await loadStoreFile(dir);
		assertTrue(
			'sentLog 에 endpoint|2026-11-30 기록',
			after.sentLog[`${ENDPOINT_SEOUL}|2026-11-30`] !== undefined
		);
	} finally {
		await rmDir(dir);
	}
}

// (2) 휴식일 스킵: good_behavior 화요일 → 발송 없음 (EC-83).
{
	const dir = await makeTmpDataDir();
	try {
		await seedOne(dir, ENDPOINT_SEOUL);
		const { send, calls } = fakeSend();
		const r = await runTick({
			dataDir: dir,
			now: new Date('2026-12-01T10:00:00Z'), // 서울 화요일 19:00 (휴식일)
			vapid: VAPID,
			retentionDays: 8,
			send
		});
		eq('휴식일 sent=0', 0, r.sent);
		eq('휴식일 skipped=1', 1, r.skipped);
		eq('send 미호출', 0, calls.length);
	} finally {
		await rmDir(dir);
	}
}

// (3) 시각 불일치.
{
	const dir = await makeTmpDataDir();
	try {
		await seedOne(dir, ENDPOINT_SEOUL); // notifyAt=19:00
		const { send, calls } = fakeSend();
		const r = await runTick({
			dataDir: dir,
			now: new Date('2026-11-30T10:01:00Z'), // 서울 월요일 19:01
			vapid: VAPID,
			retentionDays: 8,
			send
		});
		eq('시각 불일치 sent=0', 0, r.sent);
		eq('시각 불일치 skipped=1', 1, r.skipped);
		eq('send 미호출', 0, calls.length);
	} finally {
		await rmDir(dir);
	}
}

// (4) dedup: 같은 tick 을 두 번 실행 → 두 번째는 skipped.
{
	const dir = await makeTmpDataDir();
	try {
		await seedOne(dir, ENDPOINT_SEOUL);
		const stub1 = fakeSend();
		const now = new Date('2026-11-30T10:00:00Z');
		const r1 = await runTick({
			dataDir: dir,
			now,
			vapid: VAPID,
			retentionDays: 8,
			send: stub1.send
		});
		eq('1회차 sent=1', 1, r1.sent);
		const stub2 = fakeSend();
		const r2 = await runTick({
			dataDir: dir,
			now, // 같은 시각.
			vapid: VAPID,
			retentionDays: 8,
			send: stub2.send
		});
		eq('2회차 sent=0 (dedup)', 0, r2.sent);
		eq('2회차 skipped=1', 1, r2.skipped);
		eq('2회차 send 미호출', 0, stub2.calls.length);
	} finally {
		await rmDir(dir);
	}
}

// (5) 두 tz — 같은 UTC now 에 서울만 매칭.
{
	const dir = await makeTmpDataDir();
	try {
		const now0 = '2026-11-30T00:00:00.000Z';
		let s = emptyStore();
		({ store: s } = upsertSubscription(
			s,
			ENDPOINT_SEOUL,
			{ keys: KEYS, programId: 'good_behavior', notifyAt: '19:00', tz: 'Asia/Seoul' },
			now0
		));
		({ store: s } = upsertSubscription(
			s,
			ENDPOINT_NY,
			{ keys: KEYS, programId: 'good_behavior', notifyAt: '19:00', tz: 'America/New_York' },
			now0
		));
		await writeFile(join(dir, 'subscriptions.json'), JSON.stringify(s, null, 2), 'utf8');

		const { send, calls } = fakeSend();
		const r = await runTick({
			dataDir: dir,
			now: new Date('2026-11-30T10:00:00Z'), // 서울 월 19:00 · NY 월 05:00.
			vapid: VAPID,
			retentionDays: 8,
			send
		});
		eq('두 tz: sent=1', 1, r.sent);
		eq('두 tz: 서울만 발송', ENDPOINT_SEOUL, calls[0].endpoint);
	} finally {
		await rmDir(dir);
	}
}

// (6) gone → 즉시 삭제 (EC-78 / EC-85).
{
	const dir = await makeTmpDataDir();
	try {
		await seedOne(dir, ENDPOINT_SEOUL, {
			sentLog: {
				[`${ENDPOINT_SEOUL}|2026-11-29`]: '2026-11-29T10:00:00Z'
			}
		});
		const { send } = fakeSend(
			{ [ENDPOINT_SEOUL]: { kind: 'gone', status: 410 } },
			{ kind: 'ok' }
		);
		const r = await runTick({
			dataDir: dir,
			now: new Date('2026-11-30T10:00:00Z'),
			vapid: VAPID,
			retentionDays: 8,
			send
		});
		eq('gone: sent=0', 0, r.sent);
		eq('gone: removed=1', 1, r.removed);
		const after = await loadStoreFile(dir);
		eq('subscriptions[endpoint] 제거', undefined, after.subscriptions[ENDPOINT_SEOUL]);
		eq(
			'sentLog 프리픽스도 제거',
			undefined,
			after.sentLog[`${ENDPOINT_SEOUL}|2026-11-29`]
		);
	} finally {
		await rmDir(dir);
	}
}

// (7) 404 도 gone 처리 (send 가 kind:'gone' 을 돌려주면 동일 흐름).
{
	const dir = await makeTmpDataDir();
	try {
		await seedOne(dir, ENDPOINT_SEOUL);
		const { send } = fakeSend({
			[ENDPOINT_SEOUL]: { kind: 'gone', status: 404 }
		});
		const r = await runTick({
			dataDir: dir,
			now: new Date('2026-11-30T10:00:00Z'),
			vapid: VAPID,
			retentionDays: 8,
			send
		});
		eq('404 gone: removed=1', 1, r.removed);
	} finally {
		await rmDir(dir);
	}
}

// (8) auth 실패는 저장소 변경 없음.
{
	const dir = await makeTmpDataDir();
	try {
		await seedOne(dir, ENDPOINT_SEOUL);
		const { send } = fakeSend({
			[ENDPOINT_SEOUL]: { kind: 'auth', status: 401 }
		});
		const r = await runTick({
			dataDir: dir,
			now: new Date('2026-11-30T10:00:00Z'),
			vapid: VAPID,
			retentionDays: 8,
			send
		});
		eq('auth: sent=0', 0, r.sent);
		eq('auth: removed=0', 0, r.removed);
		eq('auth: skipped=1', 1, r.skipped);
		const after = await loadStoreFile(dir);
		assertTrue('auth: 구독 유지', after.subscriptions[ENDPOINT_SEOUL] !== undefined);
	} finally {
		await rmDir(dir);
	}
}

// (9) network 실패는 저장소 변경 없음.
{
	const dir = await makeTmpDataDir();
	try {
		await seedOne(dir, ENDPOINT_SEOUL);
		const { send } = fakeSend({
			[ENDPOINT_SEOUL]: { kind: 'network' }
		});
		const r = await runTick({
			dataDir: dir,
			now: new Date('2026-11-30T10:00:00Z'),
			vapid: VAPID,
			retentionDays: 8,
			send
		});
		eq('network: sent=0', 0, r.sent);
		eq('network: removed=0', 0, r.removed);
		const after = await loadStoreFile(dir);
		assertTrue('network: 구독 유지', after.subscriptions[ENDPOINT_SEOUL] !== undefined);
	} finally {
		await rmDir(dir);
	}
}

// (10) pruning: tick 후 오래된 sentLog 엔트리 삭제, 최근 것 유지.
{
	const dir = await makeTmpDataDir();
	try {
		await seedOne(dir, ENDPOINT_SEOUL, {
			// tick 시점 2026-11-30. 8일 컷오프 = 2026-11-22.
			sentLog: {
				[`${ENDPOINT_SEOUL}|2026-11-20`]: 'old-10',
				[`${ENDPOINT_SEOUL}|2026-11-22`]: 'boundary',
				[`${ENDPOINT_SEOUL}|2026-11-25`]: 'recent'
			}
		});
		// notifyAt 은 19:00 이므로 UTC 10:00 이 정확히 매칭.
		const { send } = fakeSend({}, { kind: 'ok' });
		const r = await runTick({
			dataDir: dir,
			now: new Date('2026-11-30T10:00:00Z'),
			vapid: VAPID,
			retentionDays: 8,
			send
		});
		assertTrue('pruning 후 sent=1', r.sent === 1);
		const after = await loadStoreFile(dir);
		eq(
			'10일 전 sentLog 제거',
			undefined,
			after.sentLog[`${ENDPOINT_SEOUL}|2026-11-20`]
		);
		eq(
			'8일 전 sentLog 유지 (경계)',
			'boundary',
			after.sentLog[`${ENDPOINT_SEOUL}|2026-11-22`]
		);
		eq(
			'5일 전 sentLog 유지',
			'recent',
			after.sentLog[`${ENDPOINT_SEOUL}|2026-11-25`]
		);
	} finally {
		await rmDir(dir);
	}
}

// (11) 빈 저장소 → 정상 종료.
{
	const dir = await makeTmpDataDir();
	try {
		const { send, calls } = fakeSend();
		const r = await runTick({
			dataDir: dir,
			now: new Date('2026-11-30T10:00:00Z'),
			vapid: VAPID,
			retentionDays: 8,
			send
		});
		eq('빈 저장소 sent=0', 0, r.sent);
		eq('빈 저장소 skipped=0', 0, r.skipped);
		eq('빈 저장소 removed=0', 0, r.removed);
		eq('send 미호출', 0, calls.length);
	} finally {
		await rmDir(dir);
	}
}

// (12) send 가 endpoint-rejected 를 돌려주면 즉시 제거 (파일 조작으로 임의 endpoint 가 낀 경우 방어).
{
	const dir = await makeTmpDataDir();
	try {
		await seedOne(dir, ENDPOINT_SEOUL);
		const { send } = fakeSend({
			[ENDPOINT_SEOUL]: { kind: 'endpoint-rejected', reason: 'endpoint-host' }
		});
		const r = await runTick({
			dataDir: dir,
			now: new Date('2026-11-30T10:00:00Z'),
			vapid: VAPID,
			retentionDays: 8,
			send
		});
		eq('endpoint-rejected: removed=1', 1, r.removed);
		const after = await loadStoreFile(dir);
		eq('endpoint-rejected: 구독 삭제', undefined, after.subscriptions[ENDPOINT_SEOUL]);
	} finally {
		await rmDir(dir);
	}
}

ok('스케줄러 tick 은 tz · dedup · pruning · gone 정리를 결정적으로 수행');

summary();
