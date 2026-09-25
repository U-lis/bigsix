# Phase 2 — TEST 체크리스트

## 파일 · 폴더 구조 (ADR-30)

- [ ] `test -d server` 통과.
- [ ] `test -f server/package.json` 통과.
- [ ] `test -f server/tsconfig.json` 통과.
- [ ] `test -f server/src/index.ts`, `server/src/handlers.ts`, `server/src/subscriptions.ts`, `server/src/config.ts`, `server/src/progressions.ts` 모두 존재.
- [ ] `test -f server/data/.gitkeep` 통과.
- [ ] `git ls-files server/data` 결과에 `.gitkeep` 만 있음 (실제 데이터 파일 미커밋 확인).
- [ ] `grep -n "^server/data/\\*$\\|^!server/data/.gitkeep$\\|^server/node_modules/$" .gitignore` — 3줄 다 존재.

## FR-36.1 — `POST /api/push/subscribe`

- [ ] 유효한 body 로 POST → **201 Created**, 응답 본문 비어 있음.
- [ ] 같은 endpoint 로 다시 POST (notifyAt 변경) → **200 OK**. 파일 재로드 시 `subscriptions[endpoint].notifyAt` 이 새 값.
- [ ] `createdAt` 은 첫 등록 시각 그대로 유지, `updatedAt` 은 갱신됨.
- [ ] JSON 파싱 실패 body → **400** + 본문 `not-json`.
- [ ] `keys.p256dh` 누락 → **400** + shape 관련 이유.
- [ ] `notifyAt` 이 `25:00` 등 잘못된 값 → **400**.
- [ ] `tz` 가 `Foo/Bar` (Intl.DateTimeFormat 이 거부) → **400**.
- [ ] `programId` 가 progressions.json 에 없는 값 → **400**.

## FR-36.2 — `DELETE /api/push/subscribe`

- [ ] 존재하는 endpoint 삭제 → **204 No Content**. 파일 재로드 시 `subscriptions[endpoint]` 없음.
- [ ] 존재하지 않는 endpoint 삭제 → **204** (idempotent).
- [ ] JSON 파싱 실패 → **400** + `not-json`.
- [ ] `endpoint` 필드 없음 → **400** + `endpoint-missing`.
- [ ] 삭제 후 `sentLog` 에서도 해당 endpoint 프리픽스 항목이 사라짐.

## FR-36.3 · FR-36.4

- [ ] 응답 헤더 `Access-Control-Allow-Origin` 미설정 (`curl -I` 로 확인).
- [ ] 알 수 없는 경로 (`/foo`) 요청 → **404**.
- [ ] 알 수 없는 메서드 (`GET /subscribe`) → **404**.

## 저장소 헬퍼 (ADR-31)

- [ ] `loadStore` — ENOENT 이면 `emptyStore()` 반환.
- [ ] `loadStore` — 손상된 JSON 이면 `emptyStore()` 반환 (에러 던지지 않음).
- [ ] `loadStore` — `version !== 1` 이면 `emptyStore()` 반환.
- [ ] `saveStore` — `dataDir` 이 없어도 mkdir recursive 로 생성.
- [ ] `saveStore` — tmp 파일을 rename 하는 방식 (직접 write 아님). 실측: `readdir` 로 tmp 파일이 남지 않는지 확인.
- [ ] `upsertSubscription` — 신규 시 `createdAt === updatedAt === now`, `created: true`.
- [ ] `upsertSubscription` — 갱신 시 `createdAt` 유지, `updatedAt` 갱신, `created: false`.
- [ ] `removeSubscription` — 존재하지 않는 endpoint 는 store 그대로 반환 (참조 동일).
- [ ] `removeSubscription` — sentLog 도 해당 endpoint 프리픽스 정리.

## 서버 부팅 · CLI

- [ ] `BIGSIX_PORT=8899 BIGSIX_DATA_DIR=/tmp/bigsix-test-<pid> node --experimental-strip-types server/src/index.ts` — 로컬에서 정상 부팅. 콘솔에 `bigsix push api on 8899`.
- [ ] `BIGSIX_PORT=99999` — 부팅 실패, 에러 메시지 명확.
- [ ] `curl -sS -X POST http://127.0.0.1:8899/subscribe -H 'Content-Type: application/json' -d '{"endpoint":"https://example.com/e","keys":{"p256dh":"a","auth":"b"},"programId":"good_behavior","notifyAt":"19:00","tz":"Asia/Seoul"}'` → 201 (수동 확인, 결과를 검증 메모에).

## ADR-33 저장소 안전 장치 (`tests/server/test-no-secrets.mjs`)

- [ ] `-----BEGIN` 패턴이 저장소 어디에도 없음 (`git ls-files` 대상).
- [ ] `PRIVATE KEY` 문자열이 커밋된 어떤 파일에도 없음.
- [ ] `server/data/vapid.private` 는 gitignore 로 커밋 방지 (Phase 4 에서 실제 생성 시 확인).

## 통합 검사

- [ ] `bash tests/server/run.sh` 전부 통과 (subscribe · store · no-secrets 3 스위트).
- [ ] `pnpm check` 오류 0, 경고 0.
- [ ] `pnpm test` 통과, 앱 tests 수 797 그대로 (서버 tests 는 별도 러너).
- [ ] `git status` 에 `server/data/subscriptions.json` 이 뜨지 않음 (gitignore 확인).

---

## 검증 메모

<!-- Coder 가 채운다. 각 커밋 SHA, 서버 부팅 확인, 테스트 결과. -->
