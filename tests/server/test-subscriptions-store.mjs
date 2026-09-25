// server/src/subscriptions.ts 유닛 테스트. 파일 I/O 는 임시 디렉터리에서만.
// ADR-31 (JSON 파일 · rename-atomic · sentLog 정리) 검증.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
	emptyStore,
	loadStore,
	removeSubscription,
	saveStore,
	upsertSubscription
} from '../../server/src/subscriptions.ts';
import { makeTmpDataDir, rmDir, section, eq, assertTrue, neq, summary } from './helpers.mjs';

section('subscriptions.ts — 저장소 헬퍼 (ADR-31)');

// --- loadStore: ENOENT ---
{
	const dir = await makeTmpDataDir();
	try {
		const store = await loadStore(dir);
		eq('ENOENT → emptyStore()', JSON.stringify(emptyStore()), JSON.stringify(store));
	} finally {
		await rmDir(dir);
	}
}

// --- loadStore: 손상된 JSON ---
{
	const dir = await makeTmpDataDir();
	try {
		await writeFile(join(dir, 'subscriptions.json'), '{not json', 'utf8');
		const store = await loadStore(dir);
		eq('손상된 JSON → emptyStore()', JSON.stringify(emptyStore()), JSON.stringify(store));
	} finally {
		await rmDir(dir);
	}
}

// --- loadStore: version !== 1 ---
{
	const dir = await makeTmpDataDir();
	try {
		await writeFile(
			join(dir, 'subscriptions.json'),
			JSON.stringify({ version: 2, subscriptions: {}, sentLog: {} }),
			'utf8'
		);
		const store = await loadStore(dir);
		eq('version !== 1 → emptyStore()', JSON.stringify(emptyStore()), JSON.stringify(store));
	} finally {
		await rmDir(dir);
	}
}

// --- loadStore: shape 이상 (subscriptions 없음) ---
{
	const dir = await makeTmpDataDir();
	try {
		await writeFile(
			join(dir, 'subscriptions.json'),
			JSON.stringify({ version: 1, sentLog: {} }),
			'utf8'
		);
		const store = await loadStore(dir);
		eq('subscriptions 없음 → emptyStore()', JSON.stringify(emptyStore()), JSON.stringify(store));
	} finally {
		await rmDir(dir);
	}
}

// --- saveStore: dataDir 없어도 mkdir recursive ---
{
	const parent = await makeTmpDataDir();
	const dir = join(parent, 'nested', 'sub'); // 존재하지 않는 하위 경로
	try {
		const store = emptyStore();
		await saveStore(dir, store);
		const roundTrip = await loadStore(dir);
		eq('mkdir recursive 후 파일 저장', 1, roundTrip.version);
	} finally {
		await rmDir(parent);
	}
}

// --- saveStore: rename-atomic — tmp 파일이 남지 않는다 ---
{
	const dir = await makeTmpDataDir();
	try {
		const store = { ...emptyStore(), subscriptions: {} };
		await saveStore(dir, store);
		await saveStore(dir, store); // 두 번 저장해도 tmp 잔재 없음
		const entries = await readdir(dir);
		const tmps = entries.filter((n) => n.includes('subscriptions.json.tmp'));
		eq('tmp 잔재 없음', 0, tmps.length);
		assertTrue('subscriptions.json 만 남는다', entries.includes('subscriptions.json'));
	} finally {
		await rmDir(dir);
	}
}

// --- saveStore: 실제 write 후 재로드 ---
{
	const dir = await makeTmpDataDir();
	try {
		const store = emptyStore();
		const { store: withSub } = upsertSubscription(
			store,
			'https://push.example/e1',
			{
				keys: { p256dh: 'p', auth: 'a' },
				programId: 'good_behavior',
				notifyAt: '19:00',
				tz: 'Asia/Seoul'
			},
			'2026-09-25T00:00:00.000Z'
		);
		await saveStore(dir, withSub);
		const reloaded = await loadStore(dir);
		eq(
			'write → read round-trip',
			'19:00',
			reloaded.subscriptions['https://push.example/e1']?.notifyAt
		);
	} finally {
		await rmDir(dir);
	}
}

// --- upsertSubscription: 신규 ---
{
	const store = emptyStore();
	const now = '2026-09-25T10:00:00.000Z';
	const { store: next, created } = upsertSubscription(
		store,
		'e1',
		{
			keys: { p256dh: 'p', auth: 'a' },
			programId: 'good_behavior',
			notifyAt: '19:00',
			tz: 'Asia/Seoul'
		},
		now
	);
	eq('신규 upsert: created=true', true, created);
	eq('신규 upsert: createdAt=now', now, next.subscriptions.e1?.createdAt);
	eq('신규 upsert: updatedAt=now', now, next.subscriptions.e1?.updatedAt);
}

// --- upsertSubscription: 갱신 — createdAt 유지 · updatedAt 갱신 ---
{
	const now1 = '2026-09-25T10:00:00.000Z';
	const now2 = '2026-09-26T11:00:00.000Z';
	const { store: after1 } = upsertSubscription(
		emptyStore(),
		'e1',
		{
			keys: { p256dh: 'p', auth: 'a' },
			programId: 'good_behavior',
			notifyAt: '19:00',
			tz: 'Asia/Seoul'
		},
		now1
	);
	const { store: after2, created } = upsertSubscription(
		after1,
		'e1',
		{
			keys: { p256dh: 'p2', auth: 'a2' },
			programId: 'new_blood',
			notifyAt: '07:30',
			tz: 'Asia/Seoul'
		},
		now2
	);
	eq('갱신 upsert: created=false', false, created);
	eq('갱신 upsert: createdAt 유지', now1, after2.subscriptions.e1?.createdAt);
	eq('갱신 upsert: updatedAt 갱신', now2, after2.subscriptions.e1?.updatedAt);
	eq('갱신 upsert: 다른 필드도 갱신', '07:30', after2.subscriptions.e1?.notifyAt);
	eq('갱신 upsert: programId 갱신', 'new_blood', after2.subscriptions.e1?.programId);
}

// --- removeSubscription: 없는 endpoint 는 store 참조 그대로 ---
{
	const store = emptyStore();
	const next = removeSubscription(store, 'missing');
	assertTrue('없는 endpoint → 동일 참조 반환', next === store);
}

// --- removeSubscription: 있는 endpoint + sentLog 정리 ---
{
	const now = '2026-09-25T10:00:00.000Z';
	const { store: withSub } = upsertSubscription(
		emptyStore(),
		'e1',
		{
			keys: { p256dh: 'p', auth: 'a' },
			programId: 'good_behavior',
			notifyAt: '19:00',
			tz: 'Asia/Seoul'
		},
		now
	);
	const seeded = {
		...withSub,
		sentLog: {
			'e1|2026-09-25': now,
			'e1|2026-09-24': now,
			'e2|2026-09-25': now
		}
	};
	const next = removeSubscription(seeded, 'e1');
	neq('다른 store 참조', seeded, next);
	eq('subscriptions[e1] 제거됨', undefined, next.subscriptions.e1);
	eq('sentLog e1| 프리픽스 제거', undefined, next.sentLog['e1|2026-09-25']);
	eq('sentLog 다른 프리픽스는 유지', now, next.sentLog['e2|2026-09-25']);
}

summary();
