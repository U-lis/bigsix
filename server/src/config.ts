// 서버 환경 변수 로더. Phase 2 · ADR-29 / Phase 3 · ADR-33.
//
// - BIGSIX_PORT  기본값 8791 (nginx `proxy_pass http://127.0.0.1:8791/;` 와 짝).
// - BIGSIX_DATA_DIR  기본값 'server/data'. subscriptions.json 이 놓일 자리.
// - BIGSIX_VAPID_PUBLIC_KEY  VAPID 공개키 (base64url).
// - BIGSIX_VAPID_SUBJECT     VAPID subject (기본 'mailto:admin@localhost').
// - BIGSIX_VAPID_PRIVATE_KEY_PATH  비밀키 파일 경로 (기본 '<dataDir>/vapid.private',
//   ADR-33). 스케줄러가 발송 직전 이 파일을 읽어 서명.
//
// Phase 3 은 CLI 진입점만 갖고, 실제 배포·systemd 는 Phase 4. loadConfig 자체는
// VAPID 필드가 비어 있어도 성공 — 스케줄러 CLI 에서 필요할 때만 읽는다.

import { join } from 'node:path';

export interface Config {
	port: number;
	dataDir: string;
	vapidPublicKey: string;
	vapidSubject: string;
	vapidPrivateKeyPath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const rawPort = env.BIGSIX_PORT ?? '8791';
	const port = Number.parseInt(rawPort, 10);
	if (!Number.isInteger(port) || port < 1 || port > 65535 || String(port) !== rawPort.trim()) {
		throw new Error(`BIGSIX_PORT 가 유효한 정수(1~65535)가 아님: ${env.BIGSIX_PORT}`);
	}
	const dataDir = env.BIGSIX_DATA_DIR ?? 'server/data';
	const vapidPublicKey = env.BIGSIX_VAPID_PUBLIC_KEY ?? '';
	const vapidSubject = env.BIGSIX_VAPID_SUBJECT ?? 'mailto:admin@localhost';
	const vapidPrivateKeyPath =
		env.BIGSIX_VAPID_PRIVATE_KEY_PATH ?? join(dataDir, 'vapid.private');
	return { port, dataDir, vapidPublicKey, vapidSubject, vapidPrivateKeyPath };
}
