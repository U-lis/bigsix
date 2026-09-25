// web-push 래퍼. VAPID 서명 발송 + HTTP 상태 코드 분류.
//
// - VAPID 는 `setVapidDetails(subject, publicKey, privateKey)` 로 라이브러리 전역에 세팅.
//   실제 발송은 `sendNotification(subscription, payload)`.
// - 상태 코드 별 분류 (ADR-32 · FR-37.4 / EC-78 / EC-85):
//   * 2xx      → { kind:'ok' }
//   * 404, 410 → { kind:'gone', status } — 스케줄러가 구독 즉시 삭제
//   * 401, 403 → { kind:'auth', status } — VAPID 서명 실패. 저장소는 유지.
//   * 그 외 4xx/5xx → { kind:'other', status }
//   * statusCode 없는 예외 → { kind:'network' }
// - endpoint 발송 대상은 등록 시점 화이트리스트와 같은 상수로 재검사 (SSRF 이중 방벽).
//   등록된 뒤에도 파일 조작으로 임의 endpoint 가 끼어들 수 있어 발송 직전 한 번 더 본다.

import webpush from 'web-push';
import { checkEndpoint } from './endpoint-allowlist.ts';
import type { Subscription } from './subscriptions.ts';

export type PushErrorKind = 'gone' | 'auth' | 'network' | 'other' | 'endpoint-rejected';

export type PushResult =
	| { kind: 'ok' }
	| { kind: 'gone'; status: number }
	| { kind: 'auth'; status: number; reason?: string }
	| { kind: 'other'; status: number; reason?: string }
	| { kind: 'network'; reason?: string }
	| { kind: 'endpoint-rejected'; reason: string };

export interface Vapid {
	subject: string;
	publicKey: string;
	privateKey: string;
}

/**
 * subscription 하나에 push 를 보낸다.
 * `sub.keys` 는 { p256dh, auth }. `payload` 는 JSON 직렬화된다.
 */
export async function sendPush(
	endpoint: string,
	sub: Pick<Subscription, 'keys'>,
	payload: unknown,
	vapid: Vapid
): Promise<PushResult> {
	// 발송 시점에도 endpoint 화이트리스트 재검사 (이중 방벽).
	const check = checkEndpoint(endpoint);
	if (!check.ok) {
		return { kind: 'endpoint-rejected', reason: check.reason ?? 'endpoint-invalid' };
	}

	webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
	try {
		await webpush.sendNotification(
			{ endpoint, keys: sub.keys },
			typeof payload === 'string' ? payload : JSON.stringify(payload)
		);
		return { kind: 'ok' };
	} catch (e) {
		const err = e as { statusCode?: number; message?: string };
		const status = typeof err.statusCode === 'number' ? err.statusCode : 0;
		const reason = err.message;
		if (status === 404 || status === 410) return { kind: 'gone', status };
		if (status === 401 || status === 403) return { kind: 'auth', status, reason };
		if (status === 0) return { kind: 'network', reason };
		return { kind: 'other', status, reason };
	}
}
