// 구독 JSON 파일 저장소. ADR-31.
//
// 파일 하나(`<dataDir>/subscriptions.json`)에 구독 · 발송 기록을 담는다.
// 쓰기는 tmp 로 쓰고 rename 하는 POSIX atomic 방식. flock 는 없다 —
// 단일 사용자 · 저부하 (RISK-5).
//
// 스키마 (ADR-31):
//   { version: 1, subscriptions: { <endpoint>: Subscription }, sentLog: { "<endpoint>|YYYY-MM-DD": ISO } }
//
// 아래 헬퍼는 순수 함수 (loadStore/saveStore 만 I/O). 테스트가 쉽게 검증할 수 있다.

import { readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface Subscription {
	keys: { p256dh: string; auth: string };
	programId: string;
	notifyAt: string; // "HH:MM"
	tz: string; // IANA
	createdAt: string; // ISO (UTC, upsertSubscription 인자로 주입)
	updatedAt: string;
}

export interface Store {
	version: 1;
	subscriptions: Record<string, Subscription>;
	sentLog: Record<string, string>;
}

export function emptyStore(): Store {
	return { version: 1, subscriptions: {}, sentLog: {} };
}

function storePath(dir: string): string {
	return join(dir, 'subscriptions.json');
}

export async function loadStore(dir: string): Promise<Store> {
	let raw: string;
	try {
		raw = await readFile(storePath(dir), 'utf8');
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore();
		throw e;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		// 손상된 JSON — 사고를 감춰서 다음 write 가 덮어쓰게 두는 편이
		// 서버 부팅을 실패시키는 것보다 낫다. RISK-5 참고.
		return emptyStore();
	}
	if (!isStoreShape(parsed)) return emptyStore();
	return parsed;
}

export async function saveStore(dir: string, store: Store): Promise<void> {
	await mkdir(dir, { recursive: true });
	const path = storePath(dir);
	const tmp = `${path}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
	await writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
	await rename(tmp, path);
}

export function upsertSubscription(
	store: Store,
	endpoint: string,
	sub: Omit<Subscription, 'createdAt' | 'updatedAt'>,
	now: string
): { store: Store; created: boolean } {
	const existing = store.subscriptions[endpoint];
	const created = existing === undefined;
	const createdAt = existing?.createdAt ?? now;
	const next: Store = {
		...store,
		subscriptions: {
			...store.subscriptions,
			[endpoint]: { ...sub, createdAt, updatedAt: now }
		}
	};
	return { store: next, created };
}

export function removeSubscription(store: Store, endpoint: string): Store {
	if (store.subscriptions[endpoint] === undefined) return store;
	const { [endpoint]: _removed, ...rest } = store.subscriptions;
	void _removed;
	// sentLog 에서도 이 endpoint 프리픽스 항목 정리.
	// endpoint 안에 파이프가 있을 수 있어 첫 파이프 앞까지가 endpoint 라는 규약 (ADR-31).
	const sentLog: Record<string, string> = {};
	const prefix = `${endpoint}|`;
	for (const [k, v] of Object.entries(store.sentLog)) {
		if (!k.startsWith(prefix)) sentLog[k] = v;
	}
	return { ...store, subscriptions: rest, sentLog };
}

function isStoreShape(v: unknown): v is Store {
	if (typeof v !== 'object' || v === null) return false;
	const o = v as Record<string, unknown>;
	if (o.version !== 1) return false;
	if (typeof o.subscriptions !== 'object' || o.subscriptions === null) return false;
	if (typeof o.sentLog !== 'object' || o.sentLog === null) return false;
	return true;
}
