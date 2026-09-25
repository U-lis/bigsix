// endpoint 발송 대상 제한 (Phase 3 · SPEC4 Phase 2 검증 인계).
//
// 서버는 사용자 앱이 보낸 임의 endpoint URL 로 POST 를 쏜다. 그대로 허용하면
// SSRF 성격의 위험이 생긴다 (외부에서 도달 가능한 입력 → 내부 자원 스캔).
// 대응:
//   1) 허용 도메인 상수 목록으로 제한. 브라우저별 표준 푸시 서비스만 통과.
//   2) `https` 이외의 스킴 거절.
//   3) 사설 IP · localhost 거절 (도메인 화이트리스트로도 걸러지지만 이중 방벽).
//   4) 새 브라우저 푸시 서비스가 나오면 이 상수 한 곳만 고치면 된다.
//
// 등록 시점(`handlers.ts`)과 발송 시점(`push.ts`) 양쪽에서 부른다.

/**
 * 허용된 endpoint 도메인.
 * - `fcm.googleapis.com` — Chrome / Chromium / Edge.
 * - `updates.push.services.mozilla.com` — Firefox.
 * - `.push.apple.com` — Safari (iOS 16.4+ / macOS 13+). 점으로 시작하면
 *   서브도메인 매칭 (`web.push.apple.com` 등을 커버).
 */
export const ALLOWED_ENDPOINT_HOSTS: readonly string[] = Object.freeze([
	'fcm.googleapis.com',
	'updates.push.services.mozilla.com',
	'.push.apple.com'
]);

export interface EndpointCheckResult {
	ok: boolean;
	reason?: string;
}

/** endpoint 문자열이 허용 조건을 만족하는지. */
export function checkEndpoint(raw: string): EndpointCheckResult {
	if (typeof raw !== 'string' || raw === '') {
		return { ok: false, reason: 'endpoint-missing' };
	}
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		return { ok: false, reason: 'endpoint-not-url' };
	}
	if (u.protocol !== 'https:') {
		return { ok: false, reason: 'endpoint-scheme' };
	}
	const host = u.hostname.toLowerCase();
	if (host === '' || host === 'localhost') {
		return { ok: false, reason: 'endpoint-host' };
	}
	if (isPrivateAddress(host)) {
		return { ok: false, reason: 'endpoint-host' };
	}
	if (!isAllowedHost(host)) {
		return { ok: false, reason: 'endpoint-host' };
	}
	return { ok: true };
}

function isAllowedHost(host: string): boolean {
	for (const rule of ALLOWED_ENDPOINT_HOSTS) {
		if (rule.startsWith('.')) {
			// `.push.apple.com` → `web.push.apple.com` 등 서브도메인만 허용.
			// (베어 도메인 `push.apple.com` 은 허용하지 않는다 — 실서비스 형식이 아니다.)
			if (host.endsWith(rule) && host.length > rule.length) return true;
		} else if (host === rule) {
			return true;
		}
	}
	return false;
}

function isPrivateAddress(host: string): boolean {
	// IPv6 loopback.
	if (host === '::1' || host === '[::1]') return true;

	// IPv4 dotted-quad.
	const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
	if (v4 !== null) {
		const a = Number(v4[1]);
		const b = Number(v4[2]);
		if (a === 10) return true; // 10.0.0.0/8
		if (a === 127) return true; // 127.0.0.0/8 loopback
		if (a === 169 && b === 254) return true; // link-local
		if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
		if (a === 192 && b === 168) return true; // 192.168.0.0/16
		if (a === 0) return true; // 0.0.0.0/8
		return false;
	}
	return false;
}
