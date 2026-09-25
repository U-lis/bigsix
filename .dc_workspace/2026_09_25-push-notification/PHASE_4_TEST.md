# Phase 4 — TEST 체크리스트

## FR-39.2 — nginx location

- [ ] `grep -n "location /api/push/" deploy/nginx/bigsix.conf` — 1건.
- [ ] `grep -n "proxy_pass http://127.0.0.1:8791/;" deploy/nginx/bigsix.conf` — 정확히 슬래시 끝 (rewrite 동작).
- [ ] `grep -n "proxy_set_header Host" deploy/nginx/bigsix.conf` — 1건 이상.

## FR-39.1 — deploy/README.md 갱신

- [ ] `grep -n "서버 런타임" deploy/README.md` — 절 헤더 존재.
- [ ] `grep -n "정적 파일뿐이라 서버 런타임은 없다" deploy/README.md` — **0건** (문구 제거 확인).
- [ ] `grep -n "journalctl -u bigsix-api" deploy/README.md` — 1건 이상.
- [ ] `grep -n "bigsix-scheduler.timer" deploy/README.md` — 1건 이상.
- [ ] `grep -n "VAPID" deploy/README.md` — 절 존재.
- [ ] `grep -n "vapid-init.mjs" deploy/README.md` — 사용법 명시.
- [ ] `grep -n "sudoers.d/bigsix-restart" deploy/README.md` — sudoers 세팅 안내 존재.

## systemd unit 파일 (ADR-32)

- [ ] `test -f deploy/systemd/bigsix-api.service`.
- [ ] `test -f deploy/systemd/bigsix-scheduler.service`.
- [ ] `test -f deploy/systemd/bigsix-scheduler.timer`.
- [ ] `grep -n "OnCalendar=\\*:0/1" deploy/systemd/bigsix-scheduler.timer` — 매 분 확인.
- [ ] `grep -n "AccuracySec=15s" deploy/systemd/bigsix-scheduler.timer` — 정밀도 확인.
- [ ] `grep -n "Type=oneshot" deploy/systemd/bigsix-scheduler.service`.
- [ ] `grep -n "User=ulismoon" deploy/systemd/bigsix-api.service`.
- [ ] `grep -n "Restart=on-failure" deploy/systemd/bigsix-api.service`.
- [ ] `grep -n "BIGSIX_VAPID_PRIVATE_PATH" deploy/systemd/*.service` — 두 서비스 모두 환경변수 설정.

## FR-39.3 — remote.sh 서버 install

- [ ] `grep -n "server_install\\|server-install" deploy/remote.sh` — 함수·모드 존재.
- [ ] `grep -n "npm ci --omit=dev" deploy/remote.sh` — 서버 dep 설치 커맨드.
- [ ] `grep -n "systemctl restart bigsix-api" deploy/remote.sh` — 재시작 단계 존재.
- [ ] `bash tests/deploy/test-remote-server-install.sh` 통과 — server-install 모드가 sync + npm ci 를 실행.

## FR-39.4 — deploy.sh API 응답 확인

- [ ] `grep -n "API 응답 확인\\|/api/push/subscribe" deploy/deploy.sh` — 검증 단계 존재.
- [ ] `grep -n "\\[ \"\\$api_status\" = \"400\" \\]" deploy/deploy.sh` — 400 을 기대함 (200 아님, 서버 살아 있음을 잘못된 body 로 확인).

## FR-39.5 — VAPID 부트스트랩

- [ ] `test -f server/scripts/vapid-init.mjs`.
- [ ] `test -x server/scripts/vapid-init.mjs` (executable).
- [ ] `grep -n "generateVAPIDKeys" server/scripts/vapid-init.mjs` — web-push API 사용.
- [ ] `grep -n "chmodSync.*0o600" server/scripts/vapid-init.mjs` — 파일 권한 600.
- [ ] `bash tests/deploy/test-vapid-init.sh` 통과:
  - 신규 생성 시 exit 0, stdout 은 공개키 한 줄, 파일 존재 · 권한 600.
  - 재실행 (without --rotate) → exit 2, 기존 파일 그대로.
  - --rotate → 백업 파일 `.bak.<ts>` 존재, 새 파일 생성.

## ADR-33 안전 장치

- [ ] `.gitignore` 에 `server/data/vapid.private` 이 매치되는 규칙 존재.
- [ ] `git check-ignore server/data/vapid.private` → 결과 있음.
- [ ] `git check-ignore server/data/.gitkeep` → 결과 없음 (제외 대상).

## 통합

- [ ] `bash tests/deploy/run.sh` — 기존 3 스위트 + 신규 2 스위트 = 5 스위트 통과.
- [ ] `bash tests/server/run.sh` — 통과 그대로 (변화 없어야 함).
- [ ] `pnpm check` 0/0.
- [ ] `pnpm test` 797 그대로.

## 홈서버 실물 검증 (사용자 확인 후 실행)

- [ ] `./deploy/deploy.sh feature/push-notification` — 배포 성공, 모든 검증(SHA 대조 · 3경로 200 · 프리캐시 대조 · API POST invalid → 400) 통과.
- [ ] `ssh homeserver 'sudo systemctl status bigsix-api.service'` → `active (running)`.
- [ ] `ssh homeserver 'sudo systemctl status bigsix-scheduler.timer'` → `active (waiting)`.
- [ ] `ssh homeserver 'journalctl -u bigsix-api -n 5 --no-pager'` — 부팅 로그 (`bigsix push api on 8791`).
- [ ] `ssh homeserver 'journalctl -u bigsix-scheduler -n 10 --no-pager'` — 최소 1개 tick 로그 (`tick { sent: 0, ... }`).
- [ ] `ssh homeserver 'ls -l apps/bigsix/server/data/vapid.private'` — 권한 `-rw-------`, 소유 `ulismoon`.
- [ ] `curl -sS -X POST https://bigsix.siot-ieung.duckdns.org/api/push/subscribe -H 'Content-Type: application/json' -d '{}' -w '\n%{http_code}\n'` → 400 + 이유 문자열.
- [ ] `curl -sS https://bigsix.siot-ieung.duckdns.org/api/push/nonexistent -X GET -w '\n%{http_code}\n'` → 404 (서버에 알 수 없는 경로).
- [ ] **프리캐시 전수 대조 통과** (Phase 1 RISK-1 최종 안전망): `deploy.sh` 출력 `==> 프리캐시 목록 대조` → `전부 200`.

## VAPID 최초 발급 (사용자 확인 후 실행)

- [ ] `ssh homeserver 'cd apps/bigsix && node server/scripts/vapid-init.mjs' > /tmp/vapid.pub`
- [ ] `/tmp/vapid.pub` 에 공개키 문자열 (한 줄, base64url).
- [ ] Phase 5 커밋 시점에 이 공개키를 `src/lib/data/vapid.ts` 에 반영.

---

## 검증 메모

<!-- Coder 가 채운다. 배포 실행 결과, VAPID 발급 결과. -->
