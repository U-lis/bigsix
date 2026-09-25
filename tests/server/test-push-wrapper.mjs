// server/src/push.ts — web-push 래퍼 상태 코드 분류 (FR-37.4 / EC-78 / EC-85).
//
// web-push 는 몽키패치. 실제 푸시 서비스로 나가지 않도록 sendNotification 을
// 스텁 함수로 갈아끼운다. push.ts 가 부르는 모듈 인스턴스와 이 스텁을 심는
// 인스턴스가 같아야 하므로, 절대 경로로 명시 로드해 캐시 키가 일치하게 한다
// (Node ESM 은 resolved URL 로 모듈을 캐시한다).

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { section, eq, ok, ng, assertTrue, summary } from './helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const WEB_PUSH_URL = pathToFileURL(join(REPO, 'server', 'node_modules', 'web-push', 'src', 'index.js')).href;

const wpMod = await import(WEB_PUSH_URL);
const webpush = wpMod.default;
const { sendPush } = await import(pathToFileURL(join(REPO, 'server', 'src', 'push.ts')).href);

section('push.ts 래퍼 — web-push 상태 코드 분류 (FR-37.4)');

// 스텁 상태 저장.
let sendCalls = [];
let sendBehavior = null; // { throw: {statusCode, message} } | { resolve: true }
let vapidCalls = [];

webpush.setVapidDetails = function stub(subject, publicKey, privateKey) {
	vapidCalls.push({ subject, publicKey, privateKey });
};

webpush.sendNotification = async function stub(subscription, payload) {
	sendCalls.push({ subscription, payload });
	if (sendBehavior === null) throw new Error('no behavior set');
	if (sendBehavior.throw !== undefined) {
		throw Object.assign(new Error(sendBehavior.throw.message ?? 'stub'), {
			statusCode: sendBehavior.throw.statusCode
		});
	}
	return { statusCode: 201 };
};

const VAPID = {
	subject: 'mailto:test@example.com',
	publicKey: 'PUBLIC-KEY',
	privateKey: 'PRIVATE-KEY'
};
const SUB = { keys: { p256dh: 'p256', auth: 'auth-secret' } };
const OK_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/token-a';

function reset() {
	sendCalls = [];
	vapidCalls = [];
	sendBehavior = null;
}

// --- 200 → ok ---
reset();
sendBehavior = { resolve: true };
{
	const r = await sendPush(OK_ENDPOINT, SUB, { title: 'x' }, VAPID);
	eq('2xx → ok kind', 'ok', r.kind);
	eq('sendNotification 1회 호출', 1, sendCalls.length);
	eq('subscription.endpoint 전달', OK_ENDPOINT, sendCalls[0].subscription.endpoint);
	eq('subscription.keys.p256dh 전달', 'p256', sendCalls[0].subscription.keys.p256dh);
	eq('subscription.keys.auth 전달', 'auth-secret', sendCalls[0].subscription.keys.auth);
	assertTrue(
		'payload 는 JSON 문자열로 직렬화',
		typeof sendCalls[0].payload === 'string' && sendCalls[0].payload.startsWith('{')
	);
	eq('payload 안 title 보존', 'x', JSON.parse(sendCalls[0].payload).title);
}

// --- setVapidDetails 가 subject/publicKey/privateKey 3값으로 호출됨 ---
eq('setVapidDetails 1회 호출', 1, vapidCalls.length);
eq('vapid subject 전달', VAPID.subject, vapidCalls[0].subject);
eq('vapid publicKey 전달', VAPID.publicKey, vapidCalls[0].publicKey);
eq('vapid privateKey 전달', VAPID.privateKey, vapidCalls[0].privateKey);

// --- 404 → gone (EC-78) ---
reset();
sendBehavior = { throw: { statusCode: 404, message: 'Not Found' } };
{
	const r = await sendPush(OK_ENDPOINT, SUB, { title: 'x' }, VAPID);
	eq('404 → gone', 'gone', r.kind);
	eq('404 status 보존', 404, r.status);
}

// --- 410 → gone ---
reset();
sendBehavior = { throw: { statusCode: 410, message: 'Gone' } };
{
	const r = await sendPush(OK_ENDPOINT, SUB, { title: 'x' }, VAPID);
	eq('410 → gone', 'gone', r.kind);
	eq('410 status 보존', 410, r.status);
}

// --- 401 → auth ---
reset();
sendBehavior = { throw: { statusCode: 401, message: 'Unauthorized' } };
{
	const r = await sendPush(OK_ENDPOINT, SUB, { title: 'x' }, VAPID);
	eq('401 → auth', 'auth', r.kind);
	eq('401 status 보존', 401, r.status);
}

// --- 403 → auth ---
reset();
sendBehavior = { throw: { statusCode: 403, message: 'Forbidden' } };
{
	const r = await sendPush(OK_ENDPOINT, SUB, { title: 'x' }, VAPID);
	eq('403 → auth', 'auth', r.kind);
	eq('403 status 보존', 403, r.status);
}

// --- 500 → other ---
reset();
sendBehavior = { throw: { statusCode: 500, message: 'Server' } };
{
	const r = await sendPush(OK_ENDPOINT, SUB, { title: 'x' }, VAPID);
	eq('500 → other', 'other', r.kind);
	eq('500 status 보존', 500, r.status);
}

// --- statusCode 없는 예외 → network ---
reset();
sendBehavior = { throw: { statusCode: undefined, message: 'ETIMEDOUT' } };
{
	const r = await sendPush(OK_ENDPOINT, SUB, { title: 'x' }, VAPID);
	eq('statusCode 없음 → network', 'network', r.kind);
}

// --- 발송 직전 endpoint 재검사: 화이트리스트 밖 endpoint 는 발송 시도 없이 endpoint-rejected ---
reset();
sendBehavior = { throw: { statusCode: 500 } }; // 여기 도달하면 안 됨
{
	const r = await sendPush(
		'https://example.com/evil',
		SUB,
		{ title: 'x' },
		VAPID
	);
	eq('임의 도메인 → endpoint-rejected', 'endpoint-rejected', r.kind);
	eq('sendNotification 미호출 (이중 방벽)', 0, sendCalls.length);
}
{
	const r = await sendPush('http://fcm.googleapis.com/x', SUB, { title: 'x' }, VAPID);
	eq('http 스킴 → endpoint-rejected', 'endpoint-rejected', r.kind);
}
{
	const r = await sendPush('https://127.0.0.1/x', SUB, { title: 'x' }, VAPID);
	eq('localhost/사설 IP → endpoint-rejected', 'endpoint-rejected', r.kind);
}

// --- 문자열 payload 는 그대로 넘긴다 (JSON 이중 직렬화 방지) ---
reset();
sendBehavior = { resolve: true };
{
	const r = await sendPush(OK_ENDPOINT, SUB, 'raw-string-payload', VAPID);
	eq('문자열 payload → ok', 'ok', r.kind);
	eq('문자열 payload 그대로 전달', 'raw-string-payload', sendCalls[0].payload);
}

ok('web-push 응답 코드 분류가 EC-78/EC-85 를 커버한다');

summary();
