# Phase 4 — 배포 통합 + VAPID 부트스트랩

**목표**
서버 코드를 홈서버에서 실제로 돌린다. nginx 프록시 · systemd 서비스·타이머 · `deploy/*.sh` 갱신 · VAPID 키 부트스트랩 · `deploy/README.md` 갱신. `tests/deploy/` 방식으로 서버-install 흐름을 가짜 저장소에서 검증.

## SPEC 참조

- FR-39.1: `deploy/README.md` 「정적 파일뿐이라 서버 런타임은 없다」 문구 제거 · 재작성. 서버 런타임 시작·중지·로그 방법 추가.
- FR-39.2: `deploy/nginx/bigsix.conf` 에 `/api/push/` 프록시 location 추가 (포트 8791, GLOBAL 확정).
- FR-39.3: `deploy/remote.sh` 에 API 서버 시작/재시작 추가.
- FR-39.4: `deploy/deploy.sh` 배포 후 검증에 `/api/push/subscribe` 응답 확인 추가.
- FR-39.5: VAPID 키 쌍 생성 절차를 `deploy/README.md` 에 기록. 공개키 앱 빌드 시 상수 주입, 비밀키는 서버 파일.
- ADR-32 (systemd timer), ADR-33 (VAPID 저장·교체).

## 변경 파일

| 파일 | 편집 종류 | 내용 |
|---|---|---|
| `deploy/nginx/bigsix.conf` | 편집 | `/api/push/` proxy_pass location 추가 |
| `deploy/systemd/bigsix-api.service` | 신규 | 서버 API 유닛 |
| `deploy/systemd/bigsix-scheduler.service` | 신규 | 스케줄러 oneshot 유닛 |
| `deploy/systemd/bigsix-scheduler.timer` | 신규 | 1분 간격 timer |
| `deploy/remote.sh` | 편집 | `server-install` 모드 추가 · full 모드에 서버 재시작 단계 |
| `deploy/deploy.sh` | 편집 | 배포 후 `/api/push/subscribe` 응답 확인 추가 |
| `deploy/README.md` | 편집 | 「서버 런타임」 절 · 「VAPID 키」 절 · 「최초 1회 설정」 갱신 |
| `server/scripts/vapid-init.mjs` | 신규 | VAPID 키 쌍 생성/회전 스크립트 |
| `tests/deploy/test-remote-server-install.sh` | 신규 | 서버-install 모드 검증 (가짜 저장소, 홈서버 없이) |
| `tests/deploy/test-vapid-init.sh` | 신규 | vapid-init.mjs 스크립트 검증 |

## `deploy/nginx/bigsix.conf` 변경 diff (요지)

`location /` 위(우선순위상)에 삽입:

```
    # bigsix push API — Node 프로세스가 127.0.0.1:8791 에 대기.
    # proxy_pass URL 끝의 `/` 로 /api/push/subscribe → /subscribe 로 rewrite.
    location /api/push/ {
        proxy_pass http://127.0.0.1:8791/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
```

- Cache-Control 은 API 응답에 필요 없음 (서버가 알아서). 여기서 header 추가 안 함.
- 재로드: `sudo systemctl reload nginx` (최초 1회 설정 시 재배포 이전에).

## systemd 유닛 파일

### `deploy/systemd/bigsix-api.service`

```
[Unit]
Description=bigsix push API
After=network.target

[Service]
Type=simple
User=ulismoon
WorkingDirectory=/home/ulismoon/apps/bigsix
ExecStart=/home/ulismoon/.nvm/versions/node/v24/bin/node --experimental-strip-types server/src/index.ts
Restart=on-failure
RestartSec=3s
Environment=BIGSIX_PORT=8791
Environment=BIGSIX_DATA_DIR=/home/ulismoon/apps/bigsix/server/data
Environment=BIGSIX_VAPID_PRIVATE_PATH=/home/ulismoon/apps/bigsix/server/data/vapid.private
Environment=BIGSIX_VAPID_SUBJECT=mailto:familygameguild@gmail.com

[Install]
WantedBy=multi-user.target
```

- **Node 경로**: `v24` 심볼릭(있으면) 또는 최초 설치 스크립트에서 `readlink -f $(nvm which 24)` 로 확정하고 unit 을 수정 후 install. `deploy/README.md` 「최초 1회」 절에 명시.

### `deploy/systemd/bigsix-scheduler.service`

```
[Unit]
Description=bigsix push scheduler tick

[Service]
Type=oneshot
User=ulismoon
WorkingDirectory=/home/ulismoon/apps/bigsix
ExecStart=/home/ulismoon/.nvm/versions/node/v24/bin/node --experimental-strip-types server/src/scheduler.ts
Environment=BIGSIX_DATA_DIR=/home/ulismoon/apps/bigsix/server/data
Environment=BIGSIX_VAPID_PRIVATE_PATH=/home/ulismoon/apps/bigsix/server/data/vapid.private
Environment=BIGSIX_VAPID_SUBJECT=mailto:familygameguild@gmail.com
```

### `deploy/systemd/bigsix-scheduler.timer`

```
[Unit]
Description=bigsix push scheduler every minute

[Timer]
OnCalendar=*:0/1
AccuracySec=15s
Persistent=false
Unit=bigsix-scheduler.service

[Install]
WantedBy=timers.target
```

## `server/scripts/vapid-init.mjs` (신규)

```js
#!/usr/bin/env node
// VAPID 키 쌍 생성/회전. 서버에서 최초 1회 · 이후 회전 시 실행.
//
//   node server/scripts/vapid-init.mjs [--rotate]
//
// 결과:
//   - 기본: server/data/vapid.private 이 이미 있으면 실패로 종료 (덮어쓰기 방지).
//   - --rotate: 기존 파일을 vapid.private.bak.<ts> 로 백업하고 새 키 생성.
//   - 표준출력에 공개키 인쇄 — 개발자가 src/lib/data/vapid.ts 에 붙여넣는다.

import { readFileSync, writeFileSync, existsSync, renameSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', 'data');
const PRIV_PATH = join(DATA_DIR, 'vapid.private');
const rotate = process.argv.includes('--rotate');

if (existsSync(PRIV_PATH) && !rotate) {
  console.error(`이미 존재: ${PRIV_PATH}\n회전하려면 --rotate 로 다시 실행.`);
  process.exit(2);
}
if (existsSync(PRIV_PATH) && rotate) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `${PRIV_PATH}.bak.${ts}`;
  renameSync(PRIV_PATH, bak);
  console.error(`백업: ${bak}`);
}

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
writeFileSync(PRIV_PATH, privateKey, { encoding: 'utf8' });
chmodSync(PRIV_PATH, 0o600);
console.error(`비밀키 저장: ${PRIV_PATH} (0600)`);
console.log(publicKey);   // 표준출력에 공개키만 인쇄 — pipe 로 잡기 쉽게.
```

## `deploy/remote.sh` 변경 (요지)

```bash
MODE="${1:-full}"
: "${REF:?REF 가 필요하다}"
: "${REPO:?REPO 가 필요하다}"

sync_repo() { ... 기존 그대로 ... }

server_install() {
    cd "$REPO/server"
    # web-push 를 서버 코드가 쓴다. pnpm 이 아니라 npm — server/ 는 앱 workspace 와 분리.
    npm ci --omit=dev --silent
}

if [ "$MODE" = 'sync' ]; then sync_repo; exit 0; fi
if [ "$MODE" = 'server-install' ]; then sync_repo; server_install; exit 0; fi

: "${DOCROOT:?DOCROOT 가 필요하다}"
# ... 기존 앱 빌드 흐름 그대로 ...

# ── (신규) 서버 코드 재시작 ─────────────────────────────────
server_install
echo "==> systemd restart"
sudo systemctl restart bigsix-api.service
sudo systemctl restart bigsix-scheduler.timer
```

- `bigsix-scheduler.service` 는 timer 가 부르는 oneshot 이므로 직접 restart 하지 않는다. timer 를 restart 하면 다음 tick 부터 새 코드로.
- `sudo` 에 관해서는 `/etc/sudoers.d/bigsix-restart` 세팅 필요 — README 에 명시.

## `deploy/deploy.sh` 변경 (요지)

```bash
echo "==> 응답 확인"
fail=0
for path in / /manifest.webmanifest /sw.js; do
    ... # 기존 그대로
done

# (신규) API 서버 살아 있는지 — POST 잘못된 body 로 400 이 돌아오면 OK.
echo "==> API 응답 확인"
api_status=$(curl -sS -o /dev/null -w '%{http_code}' \
    -X POST "$URL/api/push/subscribe" \
    -H 'Content-Type: application/json' -d '{}')
printf '    %-24s %s\n' "/api/push/subscribe (POST invalid)" "$api_status"
[ "$api_status" = "400" ] || fail=1
```

- 200 이 아니라 400 을 성공으로 본다. 200 이면 서버가 이상한 상태.
- 502 / 504 (nginx 가 upstream 못 잡음) 면 서버 프로세스가 죽음. Fail.

## `deploy/README.md` 변경 (요지)

- 3번째 줄 문구 재작성:
  ```
  bigsix.siot-ieung.duckdns.org 로 서빙한다. 정적 앱과 홈서버 위 Node 프로세스(푸시 API)가 함께 돈다.
  ```
- 「서버 런타임」 절 신설:
  ```
  ## 서버 런타임 (0.3.0 이후)

  systemd 로 두 유닛이 돈다.

  | 유닛 | 하는 일 | 확인 |
  |---|---|---|
  | bigsix-api.service | POST/DELETE /api/push/subscribe 응답 | journalctl -u bigsix-api -f |
  | bigsix-scheduler.timer + service | 매 분 스케줄러 tick 실행 | journalctl -u bigsix-scheduler -f |

  재시작·중지: sudo systemctl {restart|stop|start} bigsix-api.service

  데이터: /home/ulismoon/apps/bigsix/server/data/subscriptions.json (사용자 소유, 백업 대상).
  ```
- 「VAPID 키」 절 신설 — 최초 발급, 공개키 앱 반영, 회전 절차.
- 「최초 1회 설정」 에 systemd unit 3개 install + sudoers 편집 추가.
- 「알려진 한계」 (또는 README 로) — 서버 꺼지면 알림 안 옴 (H-13).

## `tests/deploy/` 신규 스위트

### `tests/deploy/test-remote-server-install.sh`

- `helpers.sh` 의 `setup_sandbox` 를 재사용.
- 가짜 저장소 `SERVER` 에 `server/package.json` (간단한 dep 하나) 을 넣고, `REF=main REPO=$SERVER bash deploy/remote.sh server-install` 을 돌린다.
- 검증:
  - `$SERVER/server/node_modules/` 가 생김.
  - 종료 코드 0.
  - `sync` 도 함께 수행되어 최신 커밋에 서 있음.

### `tests/deploy/test-vapid-init.sh`

- `mktemp -d` 로 임시 디렉터리 안 `data/` 만들기.
- `node server/scripts/vapid-init.mjs` 실행 → stdout 에 공개키 (base64url 87자 대략), stderr 에 "비밀키 저장" 안내, `data/vapid.private` 존재, 파일 권한 600.
- 재실행 (without `--rotate`) → exit code 2, 새로 안 만들어짐.
- `--rotate` → 이전 파일이 `.bak.<ts>` 로 백업, 새 파일 생성.
- **web-push 실제 dep 필요** — `tests/deploy/run.sh` 실행 전에 `(cd server && npm ci)` 를 최소 1회 돌리는 사전 조건. Test script 첫 줄에서 `[ -d server/node_modules ]` 아니면 `npm ci --silent --omit=dev` 실행.

## 커밋 경계 (3개)

### (a) `feat(deploy): systemd 유닛 · nginx location · vapid-init`

- `deploy/nginx/bigsix.conf` 편집.
- `deploy/systemd/*.service`, `*.timer` 3개 신규.
- `server/scripts/vapid-init.mjs` 신규.
- 이 커밋에서는 `pnpm test` 영향 없음. shell tests 신규 커밋 (c) 에서.

### (b) `feat(deploy): remote.sh · deploy.sh — 서버 install · API 응답 확인`

- `deploy/remote.sh` 편집 (server-install 모드, full 흐름에 서버 재시작).
- `deploy/deploy.sh` 편집 (API 응답 확인 추가).
- `deploy/README.md` 편집 (서버 런타임 · VAPID · 최초 1회 세 절).

### (c) `test(deploy): server-install · vapid-init 스크립트 검증`

- `tests/deploy/test-remote-server-install.sh` 신규.
- `tests/deploy/test-vapid-init.sh` 신규.
- `bash tests/deploy/run.sh` 로 통과 확인.

## 완료 기준

- 커밋 a~c 전부에서 `pnpm check` 0/0, `pnpm test` 797 유지.
- `bash tests/deploy/run.sh` 전체 스위트 통과 (기존 3 + 신규 2 = 5).
- `bash tests/server/run.sh` 그대로 통과.
- **홈서버에서 실제 배포 실행 (사용자 확인 지시로만)**:
  - `./deploy/deploy.sh feature/push-notification`
  - 배포 후 `curl -sS -X POST https://bigsix.siot-ieung.duckdns.org/api/push/subscribe -H 'Content-Type: application/json' -d '{}'` → **400**.
  - `journalctl -u bigsix-api -n 20` 에 서버 부팅 로그.
  - `journalctl -u bigsix-scheduler -n 20` 에 1~2 tick 로그 (`tick { sent: 0, skipped: 0, removed: 0 }`).
  - `sudo systemctl status bigsix-api.service` → `active (running)`.
  - `sudo systemctl status bigsix-scheduler.timer` → `active (waiting)`.
- **VAPID 부트스트랩 (최초 1회, 사용자 확인 지시로만)**:
  - `ssh homeserver 'cd apps/bigsix && node server/scripts/vapid-init.mjs' > /tmp/vapid.pub`
  - `/tmp/vapid.pub` 에 공개키 문자열. `src/lib/data/vapid.ts` 에 반영은 Phase 5 커밋의 일부.
  - `ssh homeserver 'ls -l apps/bigsix/server/data/vapid.private'` → `-rw-------` 600 권한.

## 위험

- **RISK-8** (systemd unit 첫 도입): unit 파일 3개, sudoers 편집 1회, nginx conf 갱신. 최초 1회 세팅이 여러 단계라 사고 여지 큼. `deploy/README.md` 에 순서와 검증 체크포인트 명시.
- **`nvm` Node 경로 하드코딩**: unit 파일에 `.nvm/versions/node/v24/bin/node` 를 박으면 minor 버전 상승 시 링크가 깨진다. `v24` 심볼릭 링크가 nvm 에 있는지 확인 후 unit 에 반영. 없으면 `nvm alias v24 24` 로 만들고 README 에 명시.
- **sudoers 편집 실수**: 잘못 편집하면 sudo 접근 자체가 막힘. `visudo -c` 검증 필수.
- **RISK-1** (프리캐시 회귀 재확인): 이 페이즈의 배포 검증이 Phase 1 회귀 위험의 최종 안전망. 프리캐시 전수 대조가 반드시 통과해야 다음으로 진행.

## 임시 배포

**이 페이즈에 포함한다 (Phase 4 완료 시점).** 사용자 확인 후 `./deploy/deploy.sh feature/push-notification` 실행. 배포 후 위 완료 기준의 홈서버 검증을 수행하고 결과를 TEST 문서 검증 메모에 기록.


## Phase 2 검증에서 넘어온 항목 — 요청 body 크기 제한

서버의 `readBody` 에는 크기 제한이 없다. 공개 경로가 되는 이 페이즈에서 앞단으로 막는다.

- `deploy/nginx/bigsix.conf` 의 `/api/push/` location 에 `client_max_body_size` 를 작게 건다
  (구독 body 는 1KB 남짓이므로 `8k` 면 충분하다).
- 제한을 넘는 요청이 413 으로 끊기는지 확인한다.

