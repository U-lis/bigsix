# Phase 3.5 — TEST 체크리스트 (개정 B · 개정 C)

**기준선**: `bash tests/server/run.sh` 실측 315 통과 (Phase 3 완료 시점).
**목표**: 재작성 · bigsix cron · 공용 tz 모듈 신설 후에도 총 **≥ 315** 통과.

## 개정 C (2026-09-28) — ADR-43~45

### `/send` payload (FR-36.7 개정 C · FR-41.2 · ADR-45)
- [ ] `payload: { title: "a", body: "b" }` → 발송 · push 래퍼가 받은 문자열이 `JSON.stringify(payload)` 와 같다.
- [ ] `payload` 에 알 수 없는 필드(`url`, `tag`) 가 있어도 통과하고 그대로 실린다.
- [ ] `payload: null` / `[]` / `"text"` / 없음 → `400 payload-invalid`.
- [ ] UTF-8 직렬화 3072 바이트 → 통과, 3073 바이트 → `400 payload-too-large`. 한글 문자열로 만들어 문자 수 기준이 아님을 확인.
- [ ] 최상위 `title` 또는 `body` → `400 unknown-field:title` / `unknown-field:body`.
- [ ] 로그 출력에 payload 안 문자열이 없다.

### 내부 경로 잠금 (FR-36.8 · ADR-43)
- [ ] `X-Forwarded-For` 있음 + `GET /subscriptions?app=bigsix` → `404`.
- [ ] `X-Forwarded-For` 있음 + `POST /send` (올바른 body) → `404`, 발송 없음, sentLog 무변경.
- [ ] `X-Forwarded-For` 있음 + `POST /subscribe` · `DELETE /subscribe` → 정상 동작 (201/200/204).
- [ ] 헤더 없음 + `GET /subscriptions` · `POST /send` → 정상 동작.
- [ ] 404 응답 본문이 알 수 없는 경로의 404 와 같다.

### 설정 (ADR-44)
- [ ] `RELAY_DATA_DIR` 없음 → `loadConfig` 예외, 메시지에 변수 이름 포함.
- [ ] `RELAY_DATA_DIR=/x` → `vapidPrivateKeyPath === '/x/vapid.private'` (별도 지정 없을 때).
- [ ] `grep -rn "server/relay/data" server/ deploy/` → 0건.

### bigsix cron (FR-34.5' · FR-47.2 개정 C)
- [ ] `buildPayload` — 프로그램별 운동일 → `{title: '빅6', body: '<프로그램명> · <종목들>'}`, 휴식일 → `null`.
- [ ] `buildPayload` 결과 `title` ≤ 80 · `body` ≤ 200 (전 프로그램 · 전 요일).
- [ ] relayClient 가 부르는 URL 이 `http://127.0.0.1:8791/subscriptions` · `/send` (접두사 없음).
- [ ] relay `400 unknown-field` 응답 → journal 에 오류 한 줄, 다음 구독 계속.

### SW payload 해석 (FR-38.1 개정 C · EC-96)
- [ ] `parsePayload({title:'t', body:'b'})` → 그대로.
- [ ] `parsePayload({title:'t'})` → `body: ''`.
- [ ] `parsePayload({title: 1})` / `null` / `'x'` / `[]` → `{title:'빅6', body:''}`.
- [ ] `parsePayload({title:'t', body:'b', url:'/x'})` → 알 수 없는 필드 무시, 예외 없음.
- [ ] `event.data.json()` 이 던지는 경우 대체 알림이 뜬다 (`pwa-sw.test.ts`).

## server/lib/tz/localNow.ts (FR-48 · ADR-42)

- [ ] `localNow(instant, 'Asia/Seoul')` — 반환 필드 `{date, hhmm, weekday, weekdayKo}` 존재 · 형식 정확.
- [ ] `weekday` 값이 `'MO'|'TU'|'WE'|'TH'|'FR'|'SA'|'SU'` 중 하나.
- [ ] `weekdayKo` 값이 `'월'|'화'|'수'|'목'|'금'|'토'|'일'` 중 하나.
- [ ] 서울 자정 직전(23:59) → 로컬 날짜와 요일이 그날, 자정 직후(00:00) → 다음 날 · 다음 요일.
- [ ] UTC 로 표기된 같은 순간에 tz `Asia/Seoul` · `America/New_York` 각각 다른 로컬 시각.
- [ ] DST 경계(예: `America/New_York`, 2026-03-08) 에서 파트 반환 정상.
- [ ] 잘못된 tz (`"Not/A/Zone"`) → 예외 (Intl 이 던진다).
- [ ] 순수 함수 — 같은 인자로 두 번 호출 시 같은 결과 (Date.now 를 안에서 부르지 않는다).

## 릴레이 스키마 v3 (`server/relay/src/subscriptions.ts` · ADR-31 개정 B)

### 로더

- [ ] `Store.version === 3` 인 파일 → 그대로 로드.
- [ ] `Store.version === 2` (개정 A 파일) → `emptyStore()`, 로그에 `subscriptions v2 discarded`.
- [ ] `Store.version === 1` (초안 파일) → `emptyStore()`.
- [ ] `Store.version` 없음 · 손상된 JSON · `subscriptions` 누락 → `emptyStore()`.

### 저장 필드

- [ ] `Subscription` 객체가 `{app, keys, meta, createdAt, updatedAt}` 필드만 갖는다. 그 밖의 필드(`title`, `bodyByDay`, `notifyAt`, `tz`, `programId`) 는 저장 시 걸러진다 · 저장되지 않는다.
- [ ] `subscriptions` 키 형식이 `${app}|${endpoint}` (첫 파이프 앞이 app).
- [ ] 같은 endpoint · 다른 app 은 두 레코드로 존재.
- [ ] endpoint 안 파이프 문자 → 저장 헬퍼 거절 `400 endpoint-invalid`.

### sentLog

- [ ] 키 형식 `${app}|${endpoint}|${dedupKey}` — 세 파트, dedupKey 는 마지막 파이프 이후 전부.
- [ ] 값 형식 `<ISO 발송 시각>` 문자열.
- [ ] pruning: `sentAt < now - 8일` 인 항목은 매 `/send` 처리 끝에 제거. 릴레이는 tz 를 모르므로 「로컬 날짜」 가 아닌 「발송 순간의 ISO」 로 판정.

### upsertSubscription

- [ ] 신규 삽입 → `created === true`, `createdAt === now`, `updatedAt === now`.
- [ ] 같은 `(app, endpoint)` 재호출 → `created === false`, `createdAt` 유지, `updatedAt` 갱신, `keys`·`meta` 교체.
- [ ] 다른 app + 같은 endpoint → `created === true` (별개 레코드).

### removeSubscription

- [ ] `(app, endpoint)` 일치 시 해당 레코드 · sentLog `${app}|${endpoint}|*` 삭제.
- [ ] 존재하지 않는 `(app, endpoint)` → 저장소 참조 그대로 반환.
- [ ] 같은 endpoint 라도 다른 app 은 지우지 않는다.

## POST /subscribe (`server/relay/src/handlers.ts` · FR-36.1 개정 B)

### 정상

- [ ] 정상 body `{app, endpoint, keys, meta}` → `201`. 저장.
- [ ] 같은 `(app, endpoint)` 재요청 → `200`. `keys`·`meta` 갱신, `updatedAt` 갱신.
- [ ] 서로 다른 app · 같은 endpoint → 각각 `201`.

### 필드 검증

- [ ] `app` 누락 → `400 app-missing`. 형식 실패 → `400 app-invalid`.
- [ ] `endpoint` 누락 → `400 endpoint-missing`.
- [ ] `keys.p256dh`·`keys.auth` 누락 → `400 keys-missing`.
- [ ] `meta` 누락 → `400 meta-missing`.
- [ ] `meta === null` · `Array.isArray(meta)` · `typeof meta === 'string'` → `400 meta-invalid`.
- [ ] `JSON.stringify(meta).length > 1024` → `400 meta-too-long`.
- [ ] `title`·`bodyByDay`·`notifyAt`·`tz` 필드가 body 에 있으면 → `400 unknown-field:<name>` (초안·개정 A 클라이언트 잔재 방지).
- [ ] `programId` 필드가 body 에 있으면 → `400 unknown-field:programId`.

### 요청 크기

- [ ] 16 KiB 초과 body → `400 request-too-large`. 저장소 무변경.

## DELETE /subscribe (FR-36.2 유지)

- [ ] `{app, endpoint}` 정확 · 저장소에 존재 → 삭제 · `204`.
- [ ] 존재하지 않음 → `204` (idempotent).
- [ ] `{app: "other", endpoint}` 이지만 실제는 `("bigsix", endpoint)` → 저장소 무변경 · `204` (EC-86).
- [ ] `app` 누락 → `400`.

## GET /subscriptions?app=<id> (FR-36.6 신규)

- [ ] `app=bigsix` 요청 → `200` · Content-Type `application/json` · body 배열.
- [ ] 배열 각 요소: `{endpoint, meta, createdAt, updatedAt}` (**`keys` 없음**).
- [ ] `app=bigsix` 이 저장소에 없음 → `200 []`.
- [ ] `app` 파라미터 없음 → `400 app-missing`.
- [ ] `app` 형식 실패 → `400 app-invalid`.
- [ ] 다른 app 의 구독은 응답에 포함되지 않는다 (앱 스코프 격리).

## POST /send (FR-36.7 개정 C · FR-44 · ADR-41 · ADR-45)

### 정상 발송

- [ ] 정상 body `{app, endpoint, payload: {title, body}}` (dedupKey 없음) → 발송 · `200 {"status":"sent"}` · sentLog 미기록 (dedupKey 없으므로).
- [ ] `dedupKey` 포함 → 발송 · `200 {"status":"sent"}` · sentLog 에 `${app}|${endpoint}|${dedupKey}` 기록.

### dedup 억제 (EC-91)

- [ ] 같은 `(app, endpoint, dedupKey)` 두 번째 호출 → 발송하지 않고 `200 {"status":"suppressed","reason":"dedup"}`.
- [ ] `dedupKey` 를 다르게 하면 두 번째도 발송 · `200 sent`.

### 만료 정리 (FR-44.3)

- [ ] 발송 응답 `410` → 릴레이가 `(app, endpoint)` 삭제 · 응답 `200 {"status":"sent","deleted":true}`.
- [ ] 발송 응답 `404` → 위와 동일.
- [ ] 삭제 스코프 정확: 같은 endpoint · 다른 app 의 구독은 남는다.

### 대상 없음 (EC-92)

- [ ] `(app, endpoint)` 저장소에 없음 → `404 subscription-not-found` · 저장소 무변경.
- [ ] `app` 이 다른 데 저장된 경우 (예: 저장은 `bigsix`, 요청은 `other`) → `404 subscription-not-found`.

### 필드 검증

- [ ] `payload` 모양·크기 검증은 위 「개정 C · `/send` payload」 절이 전부다. 릴레이는 `title`·`body` 개별 길이를 보지 않는다 (그 한도는 bigsix payload 규약 FR-34.5', `buildPayload` 몫).
- [ ] 최상위 `title`·`body` → `400 unknown-field:title` / `unknown-field:body` (개정 B 클라이언트 잔재 방지).
- [ ] `dedupKey.length > 64` → `400 dedupKey-too-long`.
- [ ] `app`·`endpoint` 검증은 `/subscribe` 와 동일.

### 상류 오류

- [ ] 발송 응답 `500` (또는 그 외 5xx) → `502 {"status":"upstream-error","code":500}`. 저장소 무변경 (구독 유지).

### pruning

- [ ] sentLog 에 `sentAt < now - 8d` 인 항목이 있으면 `/send` 처리 끝에 제거.

## 구조 grep 규약 (`server/relay/**` 는 도메인·tz 무지)

- [ ] `grep -rn "Intl.DateTimeFormat" server/relay/src/` → 0건.
- [ ] `grep -rn "progressions\|programId" server/relay/src/` → 0건.
- [ ] `grep -rn "server/lib/tz" server/relay/src/` → 0건.
- [ ] `grep -rn "buildBody\|buildPayload" server/relay/src/` → 0건.
- [ ] `test -e server/relay/src/scheduler.ts` → 없음.
- [ ] `test -e server/relay/src/progressions.ts` → 없음.

## bigsix cron (`server/apps/bigsix-cron/**` · FR-47 · ADR-42)

### payload.buildBody (순수 함수)

- [ ] `buildBody(program: new_blood, weekdayKo: '월')` → `"신참 · 푸시업, 레그 레이즈"` (예상 값 · progressions.json 실측).
- [ ] `buildBody(program: good_behavior, weekdayKo: '월')` → 문자열.
- [ ] 각 programId (`new_blood`·`good_behavior`·`veterano`·`solitary_confinement`·`supermax`) · 각 운동 요일 → 문자열 반환.
- [ ] 휴식일 (`buildBody(good_behavior, '화')` 등) → `null`.
- [ ] 일요일 (`buildBody(*, '일')`) → `null` (모든 프로그램에서).
- [ ] 문자열에 단계 번호 없음 (H-10) — 정규식 `\d+회` · `\d+세트` 매치 0건.
- [ ] 프로그램 한국어명 포함 (예: `모범수`).

### progressions 로더

- [ ] 상대 경로 `../../../../src/lib/data/progressions.json` 로드 성공.
- [ ] 로드 실패 (파일 없음) → 예외.
- [ ] 파싱 결과 `programs[id].schedule` 형태 유지.

### tick 로직 (Mock relayClient · Mock Date)

- [ ] `listSubscriptions` 이 빈 배열이면 `send` 를 부르지 않고 종료.
- [ ] `meta.tz` 로 계산한 로컬 `HH:MM` !== `meta.notifyAt` → `send` 안 부름.
- [ ] `HH:MM` 일치 · 요일 배열이 빈 배열(휴식일) → `send` 안 부름 (EC-83).
- [ ] `HH:MM` 일치 · 요일 배열 있음 → `send("bigsix", endpoint, <buildPayload 결과 = {title:"빅6", body}>, <로컬 날짜>)` 호출.
- [ ] `send` 응답 `{status:"sent"}` → 로그.
- [ ] `send` 응답 `{status:"suppressed"}` → 로그, 다음 구독으로 진행.
- [ ] `send` 응답 `{status:"sent","deleted":true}` → 로그, 다음 구독으로 진행 (재시도 없음).
- [ ] `send` HTTP 오류 → 로그, 다음 구독으로 진행 (재시도 없음 · 다음 tick 이 재시도 역할).
- [ ] `dedupKey` 는 sub 마다 그 sub 의 `meta.tz` 로 계산한 로컬 날짜.

### bigsix cron config

- [ ] `RELAY_BASE_URL` 환경변수 없으면 기본값 `http://127.0.0.1:8791`.
- [ ] `BIGSIX_APP_ID` 환경변수 없으면 기본값 `bigsix`.

## 통합 · 회귀

- [ ] `bash tests/server/run.sh` 통과. 총 통과 수 **≥ 315**.
- [ ] `pnpm test` 앱 tests 회귀 없음 (main dc84f1e 기준선 797 유지).
- [ ] `pnpm check` 오류 0, 경고 0 (NFR-33).

## Node.js 안전장치 (RISK-3.5)

- [ ] 로컬 개발 중 `$RELAY_DATA_DIR/subscriptions.json` 이 v1 · v2 파일이면 재실행 시 자동으로 `emptyStore` 로 초기화 · `console.warn('subscriptions v<n> discarded')`.
- [ ] endpoint 안 파이프 문자 등록 시도 → `400 endpoint-invalid`. Chrome/Firefox/Safari 실 endpoint 샘플에서 false-positive 없음.

## 비밀 유출 방지 (기존 스위트 유지)

- [ ] `tests/server/relay/test-no-secrets.mjs` (9). `GET /subscriptions` 응답에 `keys` 가 포함되지 않는지 별도 케이스로 확인.
- [ ] 새 `dedupKey`·`meta` 문자열이 저장 파일에 저장되지만 (payload 는 저장하지 않는다) 비밀 스캐너가 이들을 비밀로 오탐하지 않는지 확인 (기존 「이름이 아니라 값을 본다」 원칙 유지).

---

## 검증 메모

<!-- Coder 가 채운다. -->
