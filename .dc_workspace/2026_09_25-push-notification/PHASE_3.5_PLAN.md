# Phase 3.5 — 릴레이 재작성 + bigsix cron 신설 (개정 B)

**앞 페이즈**: Phase 3 (Complete · 초안 계약).
**뒤 페이즈**: Phase 4 (배포 통합) — Phase 3.5 완료 후에만 배포.
**번호**: 서버 계약을 뒤집지만 UI 페이즈(4~7) 를 밀지 않기 위해 `3.5` 로 끼운다.
선례: `.dc_workspace/2026_09_18-history-export/PHASE_2.5_PLAN.md`, `2026_09_03-program-session/PHASE_3.5_PLAN.md`.

## 개정 이력 (이 페이즈의 정체성 변화)

- **2026-09-26 개정 A 초안**: 「범용 릴레이로 전환」 — `progressions.ts` 삭제, `subscriptions.ts` 스키마 v1→v2 (`app`·`title`·`bodyByDay` 도입), `handlers.ts` 검증 재작성, `scheduler.ts` 페이로드 조립 변경. 서버 안에 스케줄러는 남아 있었다.
- **2026-09-26 개정 B 최종** (이 문서): **릴레이 안의 스케줄러가 완전히 사라진다.** 「언제·무엇을」은 앱 cron 몫. 이 페이즈의 범위가 (a) 릴레이 재작성 + (b) bigsix cron 신설 + (c) 공용 tz 모듈 신설 로 확대. 커밋 경계도 그에 맞춰 재편.

## 개정 C 대응 절 (2026-09-28 — 아래 개정 B 본문보다 이 절이 우선)

개정 C 는 이 페이즈의 폴더 구조·커밋 경계를 바꾸지 않는다. 커밋 (b)(c) 의 내용 몇 곳과 앱 쪽 SW 순수 함수 하나가 바뀐다.

**참조**: SPEC H-19~H-21, FR-34.5', FR-36.7(개정 C)·36.8, FR-38.1(개정 C), FR-41.2(개정 C), FR-47.2·47.7(개정 C), EC-94~96. GLOBAL ADR-43~45.

**커밋 (b) 에 더하는 것 — 릴레이**
- `server/relay/src/handlers.ts` · `POST /send`:
  - 요청 필드 화이트리스트 `{app, endpoint, payload, dedupKey}`. 최상위 `title`·`body` 는 `400 unknown-field:title` / `unknown-field:body`.
  - `payload`: 객체 · non-null · non-array. `Buffer.byteLength(JSON.stringify(payload), 'utf8') ≤ 3072`. 위반 `400 payload-invalid` / `400 payload-too-large`.
  - 발송은 `JSON.stringify(payload)` 그대로. `push.ts` 래퍼는 문자열을 받도록 시그니처를 맞춘다.
  - 로그에 payload 를 찍지 않는다.
- `server/relay/src/index.ts` · 라우팅: `X-Forwarded-For` 헤더가 있는 요청이 `GET /subscriptions` · `POST /send` 면 `404 not-found` (알 수 없는 경로와 같은 응답). `/subscribe` 는 헤더와 무관.
- `server/relay/src/config.ts`: `RELAY_DATA_DIR` **필수** — 없으면 `loadConfig` 가 예외 (ADR-44). 기본값 `server/relay/data` 를 두지 않는다. `RELAY_VAPID_PRIVATE_KEY_PATH` 기본값은 `<RELAY_DATA_DIR>/vapid.private`.
- `server/relay/data/` 디렉터리 자체를 만들지 않는다 (`.gitkeep` 도 없음). 아래 폴더 구조의 `data/` 줄은 개정 C 로 무효.
- 테스트:
  - `tests/server/relay/test-send.mjs` — payload 객체 통과 · 배열/null/문자열 거절 · 3072 바이트 경계(한글로 바이트 ≠ 문자 수 확인) · 최상위 `title` 거절 · 발송 페이로드가 `JSON.stringify(payload)` 와 같음 · 로그에 payload 문자열 없음.
  - `tests/server/relay/test-internal-routes.mjs` (신규) — `X-Forwarded-For` 있음: `GET /subscriptions` 404 · `POST /send` 404 · `POST /subscribe` 정상. 헤더 없음: 둘 다 정상.
  - `tests/server/relay/test-config.mjs` (신규 또는 기존 스위트에 추가) — `RELAY_DATA_DIR` 없으면 예외 · 있으면 vapid 경로 기본값이 그 아래.

**커밋 (c) 에 더하는 것 — bigsix cron**
- `payload.ts`: `buildBody(...)` 에 더해 `buildPayload(program, weekdayKo): { title, body } | null`. `title` ≤ 80 · `body` ≤ 200 을 이 함수가 보장한다 (넘으면 `body` 를 자르지 말고 예외 — 종목명은 고정 데이터라 넘을 일이 없으므로, 넘으면 데이터 오류다).
- `relayClient.ts`: `send(app, endpoint, payload, dedupKey?)`. 기본 `RELAY_BASE_URL=http://127.0.0.1:8791`, 경로는 `/subscriptions` · `/send` (접두사 `/api/push` 없음).
- `test-tick.mjs`: relay 가 `400 unknown-field` 를 주는 경우(버전 어긋남, GLOBAL RISK-10) 를 오류로 journal 에 남기고 다음 구독으로 넘어가는지.

**앱 쪽 — SW payload 해석 (커밋 (c) 뒤 별도 커밋 (c') 로)**
- `src/lib/pwa/push-handlers.ts`: `parsePayload(raw: unknown): PushPayload` 순수 함수 추가. 객체이고 `title` 이 문자열이면 그대로, `body` 가 문자열이 아니면 `''`. 그 밖이면 `{ title: '빅6', body: '' }` (EC-96). 알 수 없는 필드 무시.
- `src/pwa-sw.ts`: `event.data.json()` 이 던지면 `parsePayload(null)` 로. 결과를 `buildNotification` 에 넘긴다.
- `tests/unit/pwa-sw.test.ts`: 위 분기 전부.
- 커밋 메시지 예: `feat(pwa): push payload 해석을 SW 로 (개정 C)`.

**완료 기준 추가**
- `grep -rn "title.*80\|body.*200" server/relay/src/` → 0건 (길이 상한이 릴레이에서 빠졌다).
- `grep -rn "server/relay/data" server/ deploy/` → 0건.
- `bash tests/server/run.sh` 통과 수는 개정 B 목표(≥ 315) 그대로.

## SPEC · GLOBAL 참조

- H-17 (릴레이 = 구독 보관소 + 서명 발송기), H-18 (단일 운영자).
- FR-36 개정 B (`/subscribe`·`/subscriptions`·`/send` 네 엔드포인트), FR-40 확장 (네 엔드포인트 전부에 `app` 필수), FR-41 재조정 (`meta`·`title`·`body`·`dedupKey`), FR-44 (`/send` 세부), FR-47 (bigsix cron), FR-48 (공용 tz 모듈).
- EC-91 (dedup 억제), EC-92 (subscribe 없음), EC-93 (meta 형식).
- GLOBAL ADR-38 재작성 (릴레이 경계), ADR-30 개정 B (server/ 하위 구조), ADR-31 개정 B (v3 스키마), ADR-32 개정 B (스케줄러 이관), ADR-41 (dedupKey), ADR-42 (bigsix cron + 공용 tz).

## 목표

Phase 2·3 이 남긴 서버 코드를 「릴레이 = 얇게, 앱 cron = 앱 마음대로」 경계로 재작성한다.
- 릴레이 스키마 v1 → v3 (`meta` 도입, `programId`·`title`·`bodyByDay` 전부 삭제).
- 릴레이 안 스케줄러 삭제, dedup·410/404 정리는 `/send` 응답 안으로.
- bigsix cron 신설: `progressions.json` 로더 · tick 로직 · 발송 호출.
- 공용 tz 모듈 신설: `server/lib/tz/localNow.ts` (bigsix cron 이 import, 릴레이는 import 하지 않는다).
- 서버 테스트 총 개수 **≥ 315 유지**. 도메인 테스트가 릴레이 스위트에서 빠지고 bigsix cron 스위트로 이동, 계약 검증·`/send` 흐름 테스트 추가.

## 폴더 구조 변화 (ADR-30 개정 B)

```
server/                                (before: 릴레이 + 스케줄러 혼합)
  package.json                         → 삭제 · 두 하위로 분리
  src/                                 → 대부분 삭제 · 릴레이만 아래로 이관
  data/                                → 릴레이만의 자리 → server/relay/data/

server/                                (after: 개정 B)
  lib/tz/localNow.ts                   ✱ 신규
  relay/
    package.json                       ✱ 이관·정리 (web-push 만)
    src/
      index.ts                         ← 라우팅 재작성 (엔드포인트 4개)
      handlers.ts                      ← 재작성
      subscriptions.ts                 ← 스키마 v3
      push.ts                          ← 유지 (VAPID · 응답 코드 분류)
      endpoint-allowlist.ts            ← 유지
      config.ts                        ← 환경변수 접두사 RELAY_*
      progressions.ts                  ✗ 삭제 (이미 개정 A 예정이었으나 이번에 실행)
      scheduler.ts                     ✗ 삭제
    data/                              ← subscriptions.json (v3) · vapid.private
  apps/bigsix-cron/
    package.json                       ✱ 신규 (native fetch · 의존 최소)
    src/
      index.ts                         ✱ tick 진입점
      payload.ts                       ✱ buildBody(program, weekdayKo) 순수 함수
      progressions.ts                  ✱ ../../../src/lib/data/progressions.json 상대 로더
      relayClient.ts                   ✱ GET /subscriptions · POST /send 래퍼
      config.ts                        ✱ RELAY_BASE_URL · BIGSIX_APP_ID

tests/server/
  run.sh                               ← 두 서브 스위트 실행
  relay/                               ✱ 릴레이 스위트 (재작성)
    helpers.mjs
    test-subscribe.mjs                 (POST/DELETE)
    test-subscriptions-list.mjs        ✱ 신규 (GET)
    test-send.mjs                      ✱ 신규 (POST /send · dedup · 410/404 정리)
    test-subscriptions-store.mjs       (v3 스키마)
    test-endpoint-allowlist.mjs        (유지)
    test-push-wrapper.mjs              (유지)
    test-no-secrets.mjs                (유지)
    test-relay-no-tz.mjs               ✱ 신규 구조 테스트 (grep 규약)
  bigsix-cron/                         ✱ 신규 스위트
    helpers.mjs
    test-payload.mjs                   ✱ buildBody 순수 함수
    test-progressions.mjs              ✱ 로더
    test-tick.mjs                      ✱ tick 로직 (Mock relayClient)
  lib/tz/
    test-localNow.mjs                  ✱ 공용 tz 모듈 (tz 별 · 자정 · DST · 잘못된 tz)
```

## 예상 테스트 재분배 (총 ≥ 315 유지)

| 스위트 | 이전 (Phase 3 후) | 이후 (Phase 3.5 후) | 변화 |
|---|---:|---:|---:|
| relay/test-endpoint-allowlist | 53 | 53 | 0 |
| relay/test-no-secrets | 9 | 9 | 0 |
| relay/test-push-wrapper | 29 | 29 | 0 |
| ~~server/test-progressions~~ | 65 | **삭제 → bigsix-cron/** | -65 |
| ~~server/test-scheduler~~ | 60 | **삭제 → bigsix-cron/test-tick** | -60 |
| relay/test-subscribe | 78 | ~85 | +7 (개정 B 검증) |
| relay/test-subscriptions-store | 21 | ~30 | +9 (v3 스키마) |
| relay/test-subscriptions-list (신규) | 0 | ~15 | +15 |
| relay/test-send (신규) | 0 | ~50 | +50 (`/send` · dedup · 410/404 정리) |
| relay/test-relay-no-tz (신규) | 0 | ~5 | +5 (구조 grep 검증) |
| bigsix-cron/test-payload (신규) | 0 | ~30 | +30 (buildBody · 각 프로그램 · 휴식일) |
| bigsix-cron/test-progressions (신규) | 0 | ~15 | +15 (로더 · 상대 경로 · 오류) |
| bigsix-cron/test-tick (신규) | 0 | ~35 | +35 (tz 매칭 · dedupKey · 실패 흐름) |
| lib/tz/test-localNow (신규) | 0 | ~20 | +20 (tz 별 · 자정 · DST · 잘못된 tz) |
| **합계** | **315** | **~376** | **+61** |

**주의**: 도메인 테스트가 「이동」 하는 부분이 크고, 새 엔드포인트(`/send`·`/subscriptions`) 는 검증 케이스가 많아 자연스럽게 총량이 늘어난다. 315 를 밑돌지 않는 것이 완료 기준이다. 위 세부 숫자는 실측 시 소폭 변할 수 있음.

## 커밋 경계 (5개)

각 커밋 후 `bash tests/server/run.sh` 통과. `pnpm check` · `pnpm test` 는 서버 코드가 앱 빌드와 격리되어 있어 영향 없음 — 그래도 각 커밋 후 실행해 회귀 없음 확인.

### (a) `refactor(server): server/ 를 server/relay/ · server/apps/ · server/lib/ 로 재편`

- **파일 이동**: `server/src/*` → `server/relay/src/*`. `server/package.json` → `server/relay/package.json`. `server/data/` → `server/relay/data/`. `tests/server/test-*` → `tests/server/relay/test-*`.
- `tests/server/run.sh` 를 relay 스위트만 부르도록 조정 (bigsix-cron·lib 는 다음 커밋).
- `server/relay/src/config.ts` 환경 변수 접두사 `BIGSIX_*` → `RELAY_*`.
- 이 커밋만으로 기존 Phase 3 테스트가 새 경로에서 그대로 통과해야 한다 (315). 아직 스키마·엔드포인트는 개정 전.
- **위험**: import 상대 경로가 얽혀 있으면 놓치기 쉽다. `grep -rn "server/src\|from '\\.\\.\\/data'" server/ tests/` 로 확인.

### (b) `feat(server): 공용 tz 모듈 · subscriptions v3 스키마 · handlers 개정 B` (ADR-31·38·42, FR-36 개정 B, FR-40 확장, FR-48)

- **파일**:
  - `server/lib/tz/localNow.ts` 신규 (FR-48). `tests/server/lib/tz/test-localNow.mjs` 신규.
  - `server/relay/src/subscriptions.ts` — v1→v3. `Subscription` 타입: `{ app, keys, meta, createdAt, updatedAt }`. `Store.version === 3`. 로더는 v1·v2 파일을 `emptyStore()` 로 취급. sentLog 는 `${app}|${endpoint}|${dedupKey}` (개정 B).
  - `server/relay/src/handlers.ts` — 재작성.
    - `POST /subscribe`: 필드 화이트리스트 `{app, endpoint, keys, meta}`. `meta` 는 object · non-null · non-array · stringify 후 ≤ 1024.
    - `DELETE /subscribe`: 그대로 (개정 A 규약 유지).
    - **`GET /subscriptions?app=<id>` 신규** — 응답 배열에 `keys` 제외.
    - **`POST /send` 신규** — 검증 · sentLog 조회 · VAPID 서명 발송 · 응답 분류 (200 sent · 200 suppressed · 200 sent+deleted · 400 · 404 · 502).
  - `server/relay/src/index.ts` — 라우팅 4개.
  - `tests/server/relay/test-subscribe.mjs` — 새 계약 반영.
  - `tests/server/relay/test-subscriptions-store.mjs` — v3 스키마.
  - `tests/server/relay/test-subscriptions-list.mjs` — 신규 (GET).
  - `tests/server/relay/test-send.mjs` — 신규 (POST /send · dedupKey · 410/404 정리).
  - `tests/server/relay/test-relay-no-tz.mjs` — 신규. grep 규약으로 `Intl.DateTimeFormat` · `server/lib/tz` · `progressions` 문자열이 `server/relay/src/**` 에 0건인지 검증.
- **삭제**: `server/relay/src/progressions.ts`, `server/relay/src/scheduler.ts`, 이전 `tests/server/relay/test-progressions.mjs`, `tests/server/relay/test-scheduler.mjs`.
- 이 커밋 이후: 릴레이만 놓고 보면 이미 개정 B 계약. 스케줄 담당자가 없으므로 실제 배포 시 알림이 오지 않는다 — 다음 커밋에서 bigsix cron 을 세운다.

### (c) `feat(server): bigsix cron 신설` (ADR-42, FR-47)

- **파일**:
  - `server/apps/bigsix-cron/package.json` — 의존 최소 (native fetch · Node 24).
  - `server/apps/bigsix-cron/src/config.ts` — `RELAY_BASE_URL` · `BIGSIX_APP_ID` (기본 `bigsix`).
  - `server/apps/bigsix-cron/src/progressions.ts` — `../../../../src/lib/data/progressions.json` 상대 로더. 로드 실패시 예외.
  - `server/apps/bigsix-cron/src/payload.ts` — 순수 함수 `buildBody(program, weekdayKo): string` (`{name} · {종목1, 종목2}`). 단계 번호 없음 (H-10). 휴식일 → `null`.
  - `server/apps/bigsix-cron/src/relayClient.ts` — `listSubscriptions(app)`, ~~`send(app, endpoint, title, body, dedupKey?)`~~ → 개정 C: `send(app, endpoint, payload, dedupKey?)`.
  - `server/apps/bigsix-cron/src/index.ts` — tick 진입점. `Date.now()` → `localNow(new Date(), sub.meta.tz)` → 조건 확인 → payload 조립 → `/send` 호출.
  - `tests/server/bigsix-cron/test-payload.mjs`, `test-progressions.mjs`, `test-tick.mjs` (mock relayClient).
  - `tests/server/run.sh` 에 bigsix-cron 스위트 추가.
- **재사용**: `server/lib/tz/localNow.ts` 를 import. progressions 로더는 이 페이즈에서 새로 짜지만 개정 A 삭제 예정이었던 `server/src/progressions.ts` 의 형태(요일→종목 배열) 를 참고.

### (d) `chore(server): tests/server/run.sh · 문서 링크 재정비`

- `tests/server/run.sh` 가 세 서브디렉터리(relay · bigsix-cron · lib) 스위트를 모두 부르고 총 통과 수를 표준출력에 남기도록.
- 이전 파일 참조 정리 (grep 결과 0):
  - `grep -rn "server/src\|progressions.ts\|scheduler.ts\|bodyByDay\|programId" server/ tests/server/ | grep -v "\.dc_workspace"` → 릴레이 파일 안에 남으면 실패, bigsix cron 안에는 `progressions.ts`·`programId` 는 있어야 함 (앱 도메인 소유자).

### (e) `test(structure): 릴레이 tz 미접근 · 앱 도메인 미침범 · v3 스키마 원자적`

- 구조 grep 스위트 확정: `test-relay-no-tz.mjs` 가 릴레이 소스에서 tz·요일·progressions 접근을 잡는다.
- 저장 파일 shape 검증 — `Store.version === 3` 강제, v1·v2 파일이 있으면 `emptyStore()` 로 초기화되고 `console.warn('subscriptions v* discarded')` 를 남기는지.
- 마지막 통합 실행 결과 `bash tests/server/run.sh` 총 ≥ 315.

## 완료 기준

- 다섯 커밋 모두에서 `bash tests/server/run.sh` 통과, 총 통과 수 **≥ 315**.
- `pnpm check` 0/0.
- `pnpm test` 앱 tests 회귀 없음 (Phase 1 결과 유지).
- 파일·규약 검증:
  - `grep -rn "progressions\|programId" server/relay/src/` → 0건.
  - `grep -rn "Intl.DateTimeFormat" server/relay/src/` → 0건 (릴레이는 tz 를 모른다).
  - `grep -rn "server/lib/tz" server/relay/src/` → 0건.
  - `grep -rn "progressions\|programId" server/apps/bigsix-cron/src/` → 각 파일에서 사용되는 정상 참조 (앱 도메인 소유자).
  - `test -e server/relay/src/scheduler.ts` → 없음.
  - `test -e server/lib/tz/localNow.ts` → 있음.
- `subscriptions.json` 이 로컬 개발 중 v1·v2 로 있으면 재실행 시 자동으로 v3 로 초기화 (수동 개입 없음).

## 위험

- **RISK-3.5-a** (파일 이동 폭이 넓다): 커밋 (a) 는 순수 이동만이지만 import 경로가 많이 얽혀 있어 놓치기 쉽다. `git mv` 로 이동 · 이후 `grep -rn "from '\\./" server/` 로 상대경로 확인.
- **RISK-3.5-b** (릴레이·앱 cron 격리 유혹): bigsix cron 이 릴레이 저장소 파일(`subscriptions.json`) 을 직접 열어 성능·간결함을 얻고 싶은 유혹이 온다. 원칙: **파일을 열지 않고 릴레이 API 만 사용**. 나중에 릴레이를 별 저장소로 뽑을 때 이 원칙이 이관 비용을 낮춘다.
- **RISK-3.5-c** (테스트 총 개수 하락 우려): 도메인 테스트가 대량 이동한다. 이동 자체가 개수를 지키므로 자연스럽지만, `/send` 신규 케이스가 배정된 숫자 밑돌면 315 유지 실패. 미리 예상 배분표(위) 로 잡아 놓고, 커밋 (b)(c) 각각의 완료 기준에 「지금까지의 합계 ≥ 이전 기준선」 을 두어 조기 발견.
- **RISK-3.5-d** (native fetch 도입): bigsix cron 이 릴레이에 HTTP 요청을 native `fetch` 로 부른다. Node 24 는 fetch 표준이지만 실패 케이스(연결 거부·타임아웃) 처리를 초안이 짧게 지날 위험. `test-tick.mjs` 에 각 오류 모드 케이스 필수.
- **RISK-3.5-e** (v1·v2 데이터 유실): 개발 중 v1·v2 파일이 있으면 사라진다. 릴레이가 아직 홈서버에 설치된 적이 없어(Phase 4 설치 미실행) 운영 데이터는 존재하지 않는다 — 사용자가 버려도 된다고 확정한 것이 아니라, 버릴 것이 아직 없다. 커밋 메시지에 「v1·v2 파일은 자동 초기화 · 로그 경고」 명시.
- **RISK-3.5-f** (부분 배포 위험): 커밋 (b) 완료 시점에 릴레이는 「스케줄러 없는」 상태. 이 시점에 홈서버 배포하면 알림이 안 온다. **배포는 커밋 (c) (bigsix cron 신설) 이후에만.** Phase 4 배포 앞 검증.

## 임시 배포

이 페이즈에 포함하지 않는다. **Phase 4 배포 전에 반드시 이 페이즈가 완료되어야 한다.**
