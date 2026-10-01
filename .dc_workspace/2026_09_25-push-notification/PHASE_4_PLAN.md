# Phase 4 — 배포 통합 + VAPID 부트스트랩

> **개정 C 대응 필요 (2026-09-28)**: 아래 「개정 C 대응 절」 이 이 페이즈의 최종 계약이다. 개정 C 절과 개정 B 절이 어긋나면 개정 C 가 이긴다. 개정 B 절과 원문(개정 A) 은 이력용.

## 개정 C 대응 절 (최종)

**참조**: SPEC H-19·H-20, FR-36.8, FR-39.2'·39.3'·39.4(개정 C)·39.5(개정 C)·39.7, EC-94. GLOBAL ADR-43·44, RISK-10·11.

**바뀌는 것 (개정 B → 개정 C)**

| 개정 B 항목 | 개정 C 최종 |
|---|---|
| nginx `location /api/push/ { proxy_pass http://127.0.0.1:8791/; }` | **`location = /api/push/subscribe { ... proxy_pass http://127.0.0.1:8791/subscribe; proxy_set_header X-Forwarded-For $remote_addr; }`** + **`location /api/push/ { return 404; }`** |
| `push-relay-api.service` `WorkingDirectory=/home/ulismoon/apps/bigsix` | **`WorkingDirectory=/home/ulismoon/apps/push-relay`** (릴레이 전용 체크아웃) |
| `RELAY_DATA_DIR=/home/ulismoon/apps/bigsix/server/relay/data` | **`RELAY_DATA_DIR=/var/lib/push-relay`** (필수 변수) |
| `RELAY_VAPID_PRIVATE_KEY_PATH=.../server/relay/data/vapid.private` | **`/var/lib/push-relay/vapid.private`** |
| `remote.sh` full: 릴레이 + cron 둘 다 install · 재시작 | **cron 만** — `(cd server/apps/bigsix-cron && npm ci --omit=dev)` · `sudo systemctl restart bigsix-cron.timer` |
| — | **`deploy/relay-deploy.sh <ref>` 신설** (아래) |
| `deploy.sh` 검증: `/api/push/subscribe` 잘못된 body → 400 | 그대로 + **공개 경로 `GET /api/push/subscriptions?app=bigsix` → 404 · `POST /api/push/send` → 404** |
| sudoers `bigsix-restart`: `push-relay-api.service` · `bigsix-cron.timer` | 그대로 (두 스크립트가 각자 하나씩 쓴다) |
| `vapid-init.mjs` 출력 `server/relay/data/` | **`RELAY_DATA_DIR`** 을 읽어 그 아래에 쓴다. 없으면 거부 |

**`deploy/relay-deploy.sh <ref>` (신규)**
- 대상 체크아웃: 홈서버 `~/apps/push-relay`. 없으면 오류로 멈추고 「최초 1회 설정」 을 가리킨다 (자동 clone 하지 않는다 — 한 번만 하는 일).
- 흐름: `resolve_commit` (`lib.sh` 재사용) → ssh 로 `REF=... REPO=~/apps/push-relay bash deploy/remote.sh relay` → 원격에서 git 동기화 · `(cd server/relay && npm ci --omit=dev)` · `sudo systemctl restart push-relay-api.service` → 로컬에서 검증.
- 검증: 원격이 체크아웃한 커밋 대조 · `systemctl is-active push-relay-api` · 공개 경로 `POST /api/push/subscribe` `{}` → 400 · `GET /api/push/subscriptions?app=bigsix` → 404 · `POST /api/push/send` → 404.
- `remote.sh` 에 `relay` 모드를 더한다 (sync · server-install 과 같은 방식). full 모드와 relay 모드는 서로를 부르지 않는다.

**`deploy/nginx/bigsix.conf` (개정 C 최종)**
```
    # push 릴레이 — 공개하는 것은 구독 등록·해지 하나뿐이다 (ADR-43).
    # /subscriptions · /send 는 앱 cron 이 loopback 으로만 부른다. 여기서 막고,
    # 릴레이도 X-Forwarded-For 가 붙은 두 요청을 404 로 거절한다 (이중 잠금).
    location = /api/push/subscribe {
        client_max_body_size 16k;
        proxy_pass http://127.0.0.1:8791/subscribe;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
    location /api/push/ {
        return 404;
    }
```

**`push-relay-api.service` (개정 C 최종)**
```
[Unit]
Description=Push relay API (앱 도메인 지식 없음 · 별도 체크아웃에서 실행)
After=network.target

[Service]
Type=simple
User=ulismoon
WorkingDirectory=/home/ulismoon/apps/push-relay
ExecStart=/home/ulismoon/.nvm/versions/node/v24/bin/node --experimental-strip-types server/relay/src/index.ts
Restart=on-failure
RestartSec=3s
Environment=RELAY_PORT=8791
Environment=RELAY_DATA_DIR=/var/lib/push-relay
Environment=RELAY_VAPID_SUBJECT=mailto:familygameguild@gmail.com

[Install]
WantedBy=multi-user.target
```
`bigsix-cron.service` · `.timer` 는 개정 B 그대로 (`WorkingDirectory=/home/ulismoon/apps/bigsix`, `RELAY_BASE_URL=http://127.0.0.1:8791`).

**`deploy/README.md` 갱신 (개정 C)**
- 「최초 1회 설정」 에 추가:
  ```bash
  git clone https://github.com/U-lis/bigsix.git ~/apps/push-relay
  sudo install -d -o ulismoon -g ulismoon -m 700 /var/lib/push-relay
  RELAY_DATA_DIR=/var/lib/push-relay node ~/apps/push-relay/server/relay/scripts/vapid-init.mjs
  ```
- 「서버 런타임」 절: 릴레이와 bigsix cron 은 **다른 체크아웃에서 다른 명령으로** 배포된다는 표. 배포 순서 규약 — 릴레이 계약(FR-36) 이 바뀌는 커밋은 `relay-deploy.sh` 먼저, `deploy.sh` 나중 (GLOBAL RISK-10).
- 「공개 표면」 한 단락: 인터넷에 열리는 것은 `/api/push/subscribe` 뿐. 다른 앱 vhost 도 같은 두 location 을 쓴다.
- 「VAPID 키 교체」: 경로 `/var/lib/push-relay/vapid.private`.
- 데이터 백업 대상: `/var/lib/push-relay/subscriptions.json` (~~`~/apps/bigsix/server/data/subscriptions.json`~~).

**tests/deploy/ (개정 C)**
- `test-remote-relay.sh` (신규) — 가짜 저장소로 `remote.sh relay` 가 지정 ref 로 동기화하고 `server/relay` 만 install 하는지. `bigsix-cron` 은 건드리지 않는지.
- `test-remote-server-install.sh` — full/server-install 모드가 **`server/relay` 를 install 하지 않는지** 로 기대값 변경.
- `test-nginx-surface.sh` (신규) — `deploy/nginx/bigsix.conf` 에 `location = /api/push/subscribe` 1건, `location /api/push/` 블록이 `return 404`, `proxy_set_header X-Forwarded-For` 존재, `proxy_pass http://127.0.0.1:8791/;` (통째 프록시) 0건 (GLOBAL RISK-11).
- `test-vapid-init.sh` — `RELAY_DATA_DIR` 없으면 거부, 있으면 그 아래 생성.

**커밋 경계 (개정 C)** — 개정 B 의 (a)~(d) 를 이 순서로 대체한다.
- (a) `feat(deploy): nginx 공개 표면을 /subscribe 로 좁힌다` + `test-nginx-surface.sh`.
- (b) `feat(deploy): systemd 유닛 rename · 신설 — 릴레이는 별도 체크아웃·/var/lib 데이터`.
- (c) `feat(deploy): remote.sh relay 모드 · relay-deploy.sh · full 모드에서 릴레이 제외` + `test-remote-relay.sh` · `test-remote-server-install.sh` 갱신.
- (d) `feat(deploy): deploy.sh 공개 경로 404 검증 · vapid-init RELAY_DATA_DIR` + `test-vapid-init.sh` 갱신.
- (e) `docs(deploy): README 개정 C — 최초 설정 · 배포 순서 · 공개 표면`.

**Phase 4 완료 기준 (개정 C)**
- `pnpm check` · `pnpm test` 회귀 없음. `bash tests/deploy/run.sh` · `bash tests/server/run.sh` 통과.
- 홈서버 (최초 1회 설정 후, `relay-deploy.sh` → `deploy.sh` 순서로):
  - `curl -sS -o /dev/null -w '%{http_code}' -X POST https://bigsix.siot-ieung.duckdns.org/api/push/subscribe -H 'Content-Type: application/json' -d '{}'` → **400**.
  - 같은 호스트 `GET /api/push/subscriptions?app=bigsix` → **404**, `POST /api/push/send` → **404**.
  - 서버 안에서 `curl -sS http://127.0.0.1:8791/subscriptions?app=bigsix` → **200 `[]`**.
  - `systemctl show -p WorkingDirectory push-relay-api` → `/home/ulismoon/apps/push-relay`.
  - `ls -ld /var/lib/push-relay` → `drwx------ ulismoon`. `~/apps/bigsix/server/relay/data` · `~/apps/push-relay/server/relay/data` 없음.
  - `deploy.sh` 한 번 더 실행 후 `systemctl show -p ActiveEnterTimestamp push-relay-api` 값이 바뀌지 않음 (bigsix 배포가 릴레이를 재시작하지 않는다).
  - `journalctl -u bigsix-cron -n 20` — tick 로그.

---

> **개정 B 대응 필요 (2026-09-26)**: 이 문서는 개정 A 계획으로 이미 작성이 끝난 상태다. 개정 B 에서 systemd unit 이름·개수·환경 변수가 바뀐다. 아래 「개정 B 대응 절」 을 실제 구현 시 반드시 참고할 것 — 원문(개정 A) 은 이력용으로 남긴다.

## 개정 B 대응 절 (이 절이 이 페이즈에서 실제로 지켜야 할 계약)

**바뀌는 것**

| 개정 A 항목 | 개정 B 최종 |
|---|---|
| `deploy/systemd/bigsix-api.service` | **`deploy/systemd/push-relay-api.service`** — 이름·설명·`ExecStart` 경로 · 환경변수 접두사 `RELAY_*` |
| `deploy/systemd/bigsix-scheduler.service` | **삭제** — 릴레이 안 스케줄러는 사라진다 (ADR-38 재작성) |
| `deploy/systemd/bigsix-scheduler.timer` | **삭제** |
| — (신규) | **`deploy/systemd/bigsix-cron.service`** — bigsix 앱 cron (oneshot). `ExecStart=... server/apps/bigsix-cron/src/index.ts`. `RELAY_BASE_URL=http://127.0.0.1:8791`, `BIGSIX_APP_ID=bigsix` |
| — (신규) | **`deploy/systemd/bigsix-cron.timer`** — `OnCalendar=*:0/1`, `AccuracySec=15s` (원래 bigsix-scheduler.timer 의 규약을 그대로 이관) |
| `deploy/remote.sh` `(cd server && npm ci ...)` | **`(cd server/relay && npm ci --omit=dev) && (cd server/apps/bigsix-cron && npm ci --omit=dev)`** — 두 하위 프로젝트 각각 install |
| `sudo systemctl restart bigsix-api.service` | **`sudo systemctl restart push-relay-api.service`** |
| `sudo systemctl restart bigsix-scheduler.timer` | **`sudo systemctl restart bigsix-cron.timer`** |
| `/etc/sudoers.d/bigsix-restart` | 대상 유닛 이름 갱신: `push-relay-api.service` · `bigsix-cron.timer` |

**환경 변수 접두사 재정비 (`RELAY_*`)**

릴레이는 bigsix 전용이 아니라 범용이므로 환경 변수도 앱 이름을 빼서 중립화한다.
- `BIGSIX_PORT` → `RELAY_PORT`
- `BIGSIX_DATA_DIR` → `RELAY_DATA_DIR` (~~기본값도 `server/relay/data` 로~~ → 개정 C: 기본값 없음, 필수)
- `BIGSIX_VAPID_PRIVATE_KEY_PATH` → `RELAY_VAPID_PRIVATE_KEY_PATH`
- `BIGSIX_VAPID_SUBJECT` → `RELAY_VAPID_SUBJECT`
- bigsix cron 은 앱이므로 접두사 `BIGSIX_APP_ID` 는 유지.

**`push-relay-api.service` (개정 B 최종)**
```
[Unit]
Description=Push relay API (bigsix 저장소가 호스팅. 앱 도메인 지식 없음)
After=network.target

[Service]
Type=simple
User=ulismoon
WorkingDirectory=/home/ulismoon/apps/bigsix
ExecStart=/home/ulismoon/.nvm/versions/node/v24/bin/node --experimental-strip-types server/relay/src/index.ts
Restart=on-failure
RestartSec=3s
Environment=RELAY_PORT=8791
Environment=RELAY_DATA_DIR=/home/ulismoon/apps/bigsix/server/relay/data
Environment=RELAY_VAPID_PRIVATE_KEY_PATH=/home/ulismoon/apps/bigsix/server/relay/data/vapid.private
Environment=RELAY_VAPID_SUBJECT=mailto:familygameguild@gmail.com

[Install]
WantedBy=multi-user.target
```

**`bigsix-cron.service` + `.timer` (개정 B 신설)**
```
# bigsix-cron.service
[Unit]
Description=bigsix app push scheduler tick (릴레이에 GET /subscriptions · POST /send)

[Service]
Type=oneshot
User=ulismoon
WorkingDirectory=/home/ulismoon/apps/bigsix
ExecStart=/home/ulismoon/.nvm/versions/node/v24/bin/node --experimental-strip-types server/apps/bigsix-cron/src/index.ts
Environment=RELAY_BASE_URL=http://127.0.0.1:8791
Environment=BIGSIX_APP_ID=bigsix

# bigsix-cron.timer
[Unit]
Description=bigsix app push scheduler every minute

[Timer]
OnCalendar=*:0/1
AccuracySec=15s
Persistent=false
Unit=bigsix-cron.service

[Install]
WantedBy=timers.target
```

**`vapid-init.mjs` 경로 갱신**
- `server/data/` → `server/relay/data/` 로 (릴레이 소유). 스크립트 파일 자체는 `server/relay/scripts/vapid-init.mjs` 로 이동. `deploy/README.md` 「VAPID 키 교체」 절도 이 경로로.

**`deploy/deploy.sh` API 응답 확인**
- 개정 A 그대로 유지 (잘못된 body POST → 400). `/send` 는 사이드이펙트가 있어 배포 검증 대상 아님.
- 배포 후 첫 tick 로그 확인: `journalctl -u bigsix-cron -n 20` — `tick { subscriptions: 0, sent: 0, suppressed: 0 }` 같은 로그가 나와야 한다.

**`deploy/README.md` 갱신 (개정 B)**
- 「서버 런타임」 절: 유닛 두 개 (`push-relay-api.service`, `bigsix-cron.timer`) 로 정리. 이름·역할·`journalctl` 명령.
- **「릴레이는 스케줄을 모른다」** 한 줄 명시 — 앱 cron 이 스케줄러 역할.
- 「최초 1회 설정」: unit 파일 3개 install + sudoers 편집. **sudoers 대상 유닛 이름을 개정 B 로 갱신**.
- 「VAPID 키 교체」: 경로 `server/relay/data/vapid.private` 반영.

**tests/deploy/ 스위트 (개정 B)**
- `test-remote-server-install.sh` — 가짜 저장소에 `server/relay/package.json` 과 `server/apps/bigsix-cron/package.json` 두 하위를 두고 `remote.sh server-install` 이 둘 다 install 하는지 검증.
- `test-vapid-init.sh` — 새 경로(`server/relay/data/`) 반영.

**커밋 경계 (개정 B — 개정 A 의 커밋 (a)(b)(c) 위에 하나 더 얹거나, Phase 4 작업 자체를 이 개정 B 계획으로 재출발)**

가장 안전한 순서:
- (a) `feat(deploy): systemd 유닛 rename · 신설 (개정 B)` — `push-relay-api.service` · `bigsix-cron.service` · `bigsix-cron.timer` 로 파일 rename/신설. 개정 A 로 이미 작성했던 unit 파일들은 삭제.
- (b) `feat(deploy): remote.sh · deploy.sh · vapid-init 경로 반영 (개정 B)` — 두 하위 install · 새 unit 이름 · vapid-init 경로.
- (c) `docs(deploy): README 개정 B 반영 · sudoers 대상 갱신`.
- (d) `test(deploy): server-install · vapid-init 경로 반영`.

**Phase 4 완료 기준 (개정 B)**
- `pnpm check` · `pnpm test` 회귀 없음.
- `bash tests/deploy/run.sh` 통과.
- 홈서버 실제 배포 후:
  - `curl -X POST https://bigsix.siot-ieung.duckdns.org/api/push/subscribe -H 'Content-Type: application/json' -d '{}'` → **400**.
  - `journalctl -u push-relay-api -n 20` — 서버 부팅 로그.
  - `journalctl -u bigsix-cron -n 20` — 1~2 tick 로그 (`tick { subscriptions: 0 }`).
  - `sudo systemctl status push-relay-api.service` → `active (running)`.
  - `sudo systemctl status bigsix-cron.timer` → `active (waiting)`.
  - **`sudo systemctl status bigsix-api.service`** → `not-found` (삭제됨 확인).

---

## 원문 (개정 A) — 이력 유지

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
Environment=BIGSIX_VAPID_PRIVATE_KEY_PATH=/home/ulismoon/apps/bigsix/server/data/vapid.private
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
Environment=BIGSIX_VAPID_PRIVATE_KEY_PATH=/home/ulismoon/apps/bigsix/server/data/vapid.private
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

