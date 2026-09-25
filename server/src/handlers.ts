// 라우팅 핸들러. 순수 함수라 임의 body/컨텍스트로 테스트할 수 있다.
//
// - subscribe POST/DELETE 만 있다 (FR-36).
// - NFR-31: 요청 body 에서 받는 것은 `{ endpoint, keys, programId, notifyAt, tz }` 뿐.
//   요일 · 종목표 · 단계 · 수행 여부를 받는 필드는 스키마에 없다.
// - 응답 body 는 오류 사유 문자열이거나 비어 있음. 정상 응답은 status 만.

import {
	loadStore,
	removeSubscription,
	saveStore,
	upsertSubscription,
	type Subscription
} from './subscriptions.ts';

export interface HandleContext {
	dataDir: string;
	/** 저장 시각 (ISO). 테스트에서 주입 가능. */
	now: () => string;
	/** subscribe body 의 programId 를 검증하는 화이트리스트. */
	programIds: () => Set<string>;
}

export interface HandlerResponse {
	status: number;
	body?: string;
}

export interface SubscribeBody {
	endpoint: string;
	keys: { p256dh: string; auth: string };
	programId: string;
	notifyAt: string;
	tz: string;
}

const NOTIFY_AT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function validateSubscribeBody(
	v: unknown,
	programIds: Set<string>
): { ok: true; value: SubscribeBody } | { ok: false; reason: string } {
	if (typeof v !== 'object' || v === null) return { ok: false, reason: 'shape' };
	const o = v as Record<string, unknown>;

	// 허용된 필드만 받는다 — NFR-31. 예상외 필드가 있으면 400.
	// (요일 · 종목 · 단계 · 수행 여부 등이 실수로 들어오면 여기서 잡힌다.)
	const allowed = new Set(['endpoint', 'keys', 'programId', 'notifyAt', 'tz']);
	for (const key of Object.keys(o)) {
		if (!allowed.has(key)) return { ok: false, reason: `unknown-field:${key}` };
	}

	if (typeof o.endpoint !== 'string' || o.endpoint === '') {
		return { ok: false, reason: 'endpoint-missing' };
	}
	if (typeof o.keys !== 'object' || o.keys === null) {
		return { ok: false, reason: 'keys-missing' };
	}
	const keys = o.keys as Record<string, unknown>;
	if (typeof keys.p256dh !== 'string' || keys.p256dh === '') {
		return { ok: false, reason: 'p256dh-missing' };
	}
	if (typeof keys.auth !== 'string' || keys.auth === '') {
		return { ok: false, reason: 'auth-missing' };
	}
	// keys 도 다른 필드가 섞이면 400 (NFR-31 안전 장치).
	for (const k of Object.keys(keys)) {
		if (k !== 'p256dh' && k !== 'auth') return { ok: false, reason: `unknown-keys-field:${k}` };
	}

	if (typeof o.programId !== 'string' || o.programId === '') {
		return { ok: false, reason: 'programId-missing' };
	}
	if (!programIds.has(o.programId)) {
		return { ok: false, reason: 'programId-unknown' };
	}

	if (typeof o.notifyAt !== 'string' || !NOTIFY_AT_RE.test(o.notifyAt)) {
		return { ok: false, reason: 'notifyAt-invalid' };
	}

	if (typeof o.tz !== 'string' || !isValidTimeZone(o.tz)) {
		return { ok: false, reason: 'tz-invalid' };
	}

	return {
		ok: true,
		value: {
			endpoint: o.endpoint,
			keys: { p256dh: keys.p256dh, auth: keys.auth },
			programId: o.programId,
			notifyAt: o.notifyAt,
			tz: o.tz
		}
	};
}

function isValidTimeZone(tz: string): boolean {
	try {
		// Intl.DateTimeFormat 은 tz 를 모를 때 RangeError. 이 검사가 IANA 체크.
		new Intl.DateTimeFormat('en-CA', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

export async function handleSubscribePost(
	body: string,
	ctx: HandleContext
): Promise<HandlerResponse> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return { status: 400, body: 'not-json' };
	}
	const check = validateSubscribeBody(parsed, ctx.programIds());
	if (!check.ok) return { status: 400, body: check.reason };
	const store = await loadStore(ctx.dataDir);
	const { endpoint, keys, programId, notifyAt, tz } = check.value;
	const sub: Omit<Subscription, 'createdAt' | 'updatedAt'> = { keys, programId, notifyAt, tz };
	const { store: next, created } = upsertSubscription(store, endpoint, sub, ctx.now());
	await saveStore(ctx.dataDir, next);
	return { status: created ? 201 : 200 };
}

export async function handleSubscribeDelete(
	body: string,
	ctx: HandleContext
): Promise<HandlerResponse> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return { status: 400, body: 'not-json' };
	}
	if (typeof parsed !== 'object' || parsed === null) {
		return { status: 400, body: 'shape' };
	}
	const endpoint = (parsed as { endpoint?: unknown }).endpoint;
	if (typeof endpoint !== 'string' || endpoint === '') {
		return { status: 400, body: 'endpoint-missing' };
	}
	const store = await loadStore(ctx.dataDir);
	const next = removeSubscription(store, endpoint);
	if (next !== store) await saveStore(ctx.dataDir, next);
	return { status: 204 };
}
