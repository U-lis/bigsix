# Phase 2 — TEST 체크리스트

## 파일 · 폴더 구조 (ADR-30)

- [x] `test -d server` 통과.
- [x] `test -f server/package.json` 통과.
- [x] `test -f server/tsconfig.json` 통과.
- [x] `test -f server/src/index.ts`, `server/src/handlers.ts`, `server/src/subscriptions.ts`, `server/src/config.ts`, `server/src/progressions.ts` 모두 존재.
- [x] `test -f server/data/.gitkeep` 통과.
- [x] `git ls-files server/data` 결과에 `.gitkeep` 만 있음 (실제 데이터 파일 미커밋 확인).
- [x] `grep -n "^server/data/\\*$\\|^!server/data/.gitkeep$\\|^server/node_modules/$" .gitignore` — 3줄 다 존재.

## FR-36.1 — `POST /api/push/subscribe`

- [x] 유효한 body 로 POST → **201 Created**, 응답 본문 비어 있음.
- [x] 같은 endpoint 로 다시 POST (notifyAt 변경) → **200 OK**. 파일 재로드 시 `subscriptions[endpoint].notifyAt` 이 새 값.
- [x] `createdAt` 은 첫 등록 시각 그대로 유지, `updatedAt` 은 갱신됨.
- [x] JSON 파싱 실패 body → **400** + 본문 `not-json`.
- [x] `keys.p256dh` 누락 → **400** + shape 관련 이유.
- [x] `notifyAt` 이 `25:00` 등 잘못된 값 → **400**.
- [x] `tz` 가 `Foo/Bar` (Intl.DateTimeFormat 이 거부) → **400**.
- [x] `programId` 가 progressions.json 에 없는 값 → **400**.

## FR-36.2 — `DELETE /api/push/subscribe`

- [x] 존재하는 endpoint 삭제 → **204 No Content**. 파일 재로드 시 `subscriptions[endpoint]` 없음.
- [x] 존재하지 않는 endpoint 삭제 → **204** (idempotent).
- [x] JSON 파싱 실패 → **400** + `not-json`.
- [x] `endpoint` 필드 없음 → **400** + `endpoint-missing`.
- [x] 삭제 후 `sentLog` 에서도 해당 endpoint 프리픽스 항목이 사라짐.

## FR-36.3 · FR-36.4

- [x] 응답 헤더 `Access-Control-Allow-Origin` 미설정 (`curl -I` 로 확인).
- [x] 알 수 없는 경로 (`/foo`) 요청 → **404**.
- [x] 알 수 없는 메서드 (`GET /subscribe`) → **404**.

## 저장소 헬퍼 (ADR-31)

- [x] `loadStore` — ENOENT 이면 `emptyStore()` 반환.
- [x] `loadStore` — 손상된 JSON 이면 `emptyStore()` 반환 (에러 던지지 않음).
- [x] `loadStore` — `version !== 1` 이면 `emptyStore()` 반환.
- [x] `saveStore` — `dataDir` 이 없어도 mkdir recursive 로 생성.
- [x] `saveStore` — tmp 파일을 rename 하는 방식 (직접 write 아님). 실측: `readdir` 로 tmp 파일이 남지 않는지 확인.
- [x] `upsertSubscription` — 신규 시 `createdAt === updatedAt === now`, `created: true`.
- [x] `upsertSubscription` — 갱신 시 `createdAt` 유지, `updatedAt` 갱신, `created: false`.
- [x] `removeSubscription` — 존재하지 않는 endpoint 는 store 그대로 반환 (참조 동일).
- [x] `removeSubscription` — sentLog 도 해당 endpoint 프리픽스 정리.

## 서버 부팅 · CLI

- [x] `BIGSIX_PORT=8899 BIGSIX_DATA_DIR=/tmp/bigsix-test-<pid> node --experimental-strip-types server/src/index.ts` — 로컬에서 정상 부팅. 콘솔에 `bigsix push api on 8899`.
- [x] `BIGSIX_PORT=99999` — 부팅 실패, 에러 메시지 명확.
- [x] `curl -sS -X POST http://127.0.0.1:8899/subscribe -H 'Content-Type: application/json' -d '{"endpoint":"https://example.com/e","keys":{"p256dh":"a","auth":"b"},"programId":"good_behavior","notifyAt":"19:00","tz":"Asia/Seoul"}'` → 201 (수동 확인, 결과를 검증 메모에).

## ADR-33 저장소 안전 장치 (`tests/server/test-no-secrets.mjs`)

- [x] `-----BEGIN` 패턴이 저장소 어디에도 없음 (`git ls-files` 대상).
- [x] `PRIVATE KEY` 문자열이 커밋된 어떤 파일에도 없음.
- [x] `server/data/vapid.private` 는 gitignore 로 커밋 방지 (Phase 4 에서 실제 생성 시 확인).

## 통합 검사

- [x] `bash tests/server/run.sh` 전부 통과 (subscribe · store · no-secrets 3 스위트).
- [x] `pnpm check` 오류 0, 경고 0. (NFR-33)
- [x] `pnpm test` 통과, 앱 tests 수 797 그대로 (서버 tests 는 별도 러너).
- [x] `git status` 에 `server/data/subscriptions.json` 이 뜨지 않음 (gitignore 확인).

## 비기능 (NFR-31 · NFR-32)

- [x] NFR-31: `subscribe` 가 받는 Body 는 `{ programId, notifyAt, tz }` 와 브라우저 구독 정보뿐이다. 요일 집합·종목표·단계·수행 여부를 받는 필드가 스키마에 **없다**.
- [x] NFR-31: 저장된 `subscriptions.json` 에 운동 기록·AppState 조각이 들어가지 않는다.
- [x] NFR-32: `.gitignore` 가 `server/data/*` 를 무시한다. 비밀키 패턴 검사 스위트가 통과한다.

---

## 검증 메모

검증 커밋: 24470f9 · 1709e34 · 2e0f249

**서버 테스트**: `bash tests/server/run.sh` — 85 통과 0 실패
- test-no-secrets.mjs: 5 통과
- test-subscribe.mjs: 59 통과
- test-subscriptions-store.mjs: 21 통과

**앱 품질**: `pnpm check` 0 errors 0 warnings / `pnpm test` 805 passed (797 기준선 + Phase 1 pwa 테스트 8건 = 805, 서버 추가로 감소 없음)

**배포 테스트**: `bash tests/deploy/run.sh` 통과

**gitignore 실측** (`git check-ignore`):
- `.gitignore:10:server/data/*` → `server/data/subscriptions.json` 무시 ✓
- `.gitignore:10:server/data/*` → `server/data/vapid.private` 무시 ✓
- `server/data/.gitkeep` 는 커밋 대상 ✓
- `git ls-files server/data` → `server/data/.gitkeep` 만 ✓

**NFR-31 prototype pollution 분석**: `JSON.parse` 의 `__proto__` 키는 `Object.keys()` 에 나타나므로 화이트리스트 루프가 잡아내 400 반환. 실제 prototype 오염은 일어나지 않음 (V8 JSON.parse 는 `Object.prototype` 을 수정하지 않음). 우회 경로 없음.

**미구현 사항 (Phase 3 이후 판단 필요)**:
- `readBody` 에 body 크기 제한 없음 — nginx `client_max_body_size` 가 앞단에서 막아야 함. Phase 4 배포 설정에서 확인할 것.
- `endpoint` URL 도메인 검증 없음 — Phase 3 에서 실제로 그 주소에 POST 하므로 SSRF 검토 필요. 단일 사용자 홈서버 + 127.0.0.1 바인딩이라 위험도는 낮지만 Phase 3 설계 시 푸시 서비스 도메인 패턴 제한 고려 권장.
- 인증 없음 — 구독 등록·삭제에 인증 없음. 127.0.0.1 바인딩이므로 로컬 접근만 가능. 단일 사용자 홈서버 맥락에서 수용 가능한 수준.
