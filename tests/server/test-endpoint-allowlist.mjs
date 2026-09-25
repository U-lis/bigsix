// endpoint 허용 도메인 상수 · checkEndpoint 검증 (SPEC4 Phase 2 검증 인계 · SSRF 방어).
// 상수 자체를 테스트한다 — 오타나 빈 목록으로 인한 조용한 사고 방지.

import {
	ALLOWED_ENDPOINT_HOSTS,
	checkEndpoint
} from '../../server/src/endpoint-allowlist.ts';
import { section, eq, assertTrue, ok, summary } from './helpers.mjs';

section('endpoint-allowlist — 허용 도메인 상수');

// --- 상수 자체 ---
assertTrue('상수는 배열', Array.isArray(ALLOWED_ENDPOINT_HOSTS));
assertTrue('상수는 비어 있지 않다 (빈 목록 실수 방지)', ALLOWED_ENDPOINT_HOSTS.length >= 3);
assertTrue(
	'FCM (Chrome/Edge) 포함',
	ALLOWED_ENDPOINT_HOSTS.includes('fcm.googleapis.com')
);
assertTrue(
	'Mozilla autopush 포함',
	ALLOWED_ENDPOINT_HOSTS.includes('updates.push.services.mozilla.com')
);
assertTrue(
	'Apple Web Push 서브도메인 규칙 포함',
	ALLOWED_ENDPOINT_HOSTS.includes('.push.apple.com')
);

// 오타 검출 — 흔한 실수 (services 오탈자, 스킴 접두 실수).
for (const rule of ALLOWED_ENDPOINT_HOSTS) {
	assertTrue(
		`상수 항목 '${rule}' 은 스킴 접두 없음`,
		!rule.includes('://'),
		'`https://fcm.googleapis.com` 처럼 스킴을 붙이면 hostname 매칭이 깨진다.'
	);
	assertTrue(
		`상수 항목 '${rule}' 에 경로 없음`,
		!rule.includes('/'),
		'hostname 만 담아야 한다.'
	);
	// 대문자 실수.
	eq(`상수 항목 '${rule}' 은 소문자`, rule, rule.toLowerCase());
}

// 동결 — 런타임 변조 방지.
assertTrue('상수는 frozen', Object.isFrozen(ALLOWED_ENDPOINT_HOSTS));

section('checkEndpoint — 허용 케이스');

for (const good of [
	'https://fcm.googleapis.com/fcm/send/abc123',
	'https://fcm.googleapis.com/wp/xyz',
	'https://updates.push.services.mozilla.com/wpush/v2/gAAAAA...',
	'https://web.push.apple.com/some-token',
	'https://api.push.apple.com/3/device/token'
]) {
	const r = checkEndpoint(good);
	assertTrue(`허용: ${good}`, r.ok, `reason=${r.reason}`);
}

section('checkEndpoint — 거절 케이스');

// 임의 도메인.
{
	const r = checkEndpoint('https://example.com/some-endpoint');
	eq('임의 도메인 거절', false, r.ok);
	eq('임의 도메인 이유', 'endpoint-host', r.reason);
}
{
	const r = checkEndpoint('https://push.example/endpoint-a');
	eq('테스트용 example 거절', false, r.ok);
	eq('임의 도메인 이유 (2)', 'endpoint-host', r.reason);
}
// Apple 서브도메인 규칙: 베어 도메인만 (`push.apple.com`) 은 거절.
{
	const r = checkEndpoint('https://push.apple.com/token');
	eq('베어 push.apple.com 거절', false, r.ok);
}

// http 스킴.
{
	const r = checkEndpoint('http://fcm.googleapis.com/fcm/send/x');
	eq('http 스킴 거절', false, r.ok);
	eq('http 이유', 'endpoint-scheme', r.reason);
}
// 임의 스킴.
{
	const r = checkEndpoint('ftp://fcm.googleapis.com/x');
	eq('ftp 스킴 거절', false, r.ok);
	eq('ftp 이유', 'endpoint-scheme', r.reason);
}
// 프로토콜 없음 → URL 파싱 실패.
{
	const r = checkEndpoint('not-a-url');
	eq('URL 파싱 실패 거절', false, r.ok);
	eq('URL 이유', 'endpoint-not-url', r.reason);
}
// 빈 문자열.
{
	const r = checkEndpoint('');
	eq('빈 문자열 거절', false, r.ok);
	eq('빈 문자열 이유', 'endpoint-missing', r.reason);
}

// localhost / 사설 IP.
{
	const r = checkEndpoint('https://localhost/x');
	eq('localhost 거절', false, r.ok);
	eq('localhost 이유', 'endpoint-host', r.reason);
}
for (const priv of [
	'https://127.0.0.1/x',
	'https://10.0.0.1/x',
	'https://172.16.0.1/x',
	'https://172.31.255.254/x',
	'https://192.168.1.1/x',
	'https://169.254.169.254/x',
	'https://0.0.0.0/x'
]) {
	const r = checkEndpoint(priv);
	assertTrue(`사설 IP 거절: ${priv}`, !r.ok, `reason=${r.reason}`);
	eq(`사설 IP 이유: ${priv}`, 'endpoint-host', r.reason);
}

// 공인 IP 는 hostname 화이트리스트 밖이라 어차피 거절.
{
	const r = checkEndpoint('https://8.8.8.8/x');
	eq('공인 IP 도 화이트리스트 밖이라 거절', false, r.ok);
}

// 대소문자 — hostname 은 case-insensitive.
{
	const r = checkEndpoint('https://FCM.GOOGLEAPIS.COM/x');
	assertTrue('대문자 hostname 허용', r.ok);
}

// 서브도메인 매칭 정확성: '.push.apple.com' 규칙이 '.push.apple.company' 같은 헤어핀에 걸리지 않는다.
{
	const r = checkEndpoint('https://evil.push.apple.company/x');
	eq("'.push.apple.company' 도메인 거절", false, r.ok);
}

ok('checkEndpoint 는 SSRF 방어 상수를 한 곳에서 강제한다');

summary();
