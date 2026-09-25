#!/usr/bin/env node
// VAPID 키 쌍 생성/회전 (ADR-33). 서버에서 최초 1회 · 이후 회전 시 실행한다.
//
//   node server/scripts/vapid-init.mjs           # 신규 생성 (파일이 이미 있으면 실패)
//   node server/scripts/vapid-init.mjs --rotate  # 기존 파일을 백업하고 새 키 생성
//
// 결과:
//   - 비밀키는 <data-dir>/vapid.private 에 UTF-8 로 저장하고 chmod 0600 을 건다.
//   - stdout 에 공개키 한 줄을 인쇄 — pipe 로 잡아 src/lib/data/vapid.ts 에 넣는다.
//   - stderr 로 안내 문구.
//
// 데이터 디렉터리는 환경 변수 BIGSIX_DATA_DIR 로 바꿀 수 있고, 없으면 이 스크립트
// 옆의 ../data (즉 server/data) 를 쓴다. tests/deploy/test-vapid-init.sh 가
// mktemp 디렉터리를 이 변수로 밀어넣어 저장소를 건드리지 않고 검증한다.
//
// **비밀키를 표준출력으로 흘리지 않는다.** stdout 은 공개키만 담는 계약이라,
// 그대로 파이프해서 저장·업로드해도 안전해야 한다.

import { chmodSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(HERE, '..', 'data');
const dataDirEnv = process.env.BIGSIX_DATA_DIR;
const DATA_DIR = dataDirEnv
	? isAbsolute(dataDirEnv)
		? dataDirEnv
		: resolve(process.cwd(), dataDirEnv)
	: DEFAULT_DATA_DIR;
const PRIV_PATH = join(DATA_DIR, 'vapid.private');
const rotate = process.argv.includes('--rotate');

// 데이터 디렉터리는 최초 실행 때 없을 수 있다. 재귀 생성으로 만든다.
mkdirSync(DATA_DIR, { recursive: true });

if (existsSync(PRIV_PATH) && !rotate) {
	// 덮어쓰기 방지 — 이미 있는 비밀키를 실수로 날리는 것을 막는다.
	// 새로 만들 필요가 있으면 --rotate 로 명시적으로 부른다.
	process.stderr.write(`이미 존재: ${PRIV_PATH}\n회전하려면 --rotate 로 다시 실행.\n`);
	process.exit(2);
}
if (existsSync(PRIV_PATH) && rotate) {
	// 회전 시에도 기존 파일을 잃지 않는다. ISO 타임스탬프를 파일명에 붙여 백업.
	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	const bak = `${PRIV_PATH}.bak.${ts}`;
	renameSync(PRIV_PATH, bak);
	process.stderr.write(`백업: ${bak}\n`);
}

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
writeFileSync(PRIV_PATH, privateKey, { encoding: 'utf8' });
chmodSync(PRIV_PATH, 0o600);
process.stderr.write(`비밀키 저장: ${PRIV_PATH} (0600)\n`);
process.stdout.write(publicKey + '\n');
