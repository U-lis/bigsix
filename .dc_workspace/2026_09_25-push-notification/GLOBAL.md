# bigsix SPEC4 — Global Documentation (운동일 푸시 알림)

**Target Version**: 0.3.0
**Work Type**: feature
**Source Issue**: https://github.com/U-lis/bigsix/issues/6
**Base Branch**: `main` (`dc84f1e`)
**Working Branch**: `feature/push-notification` (HEAD `cb56ef1`)
**Worktree**: `/home/ulismoon/Documents/bigsix-feature-push-notification`
**SOT**: 같은 디렉터리의 `SPEC.md` (SPEC4) — 본 문서와 어긋나면 SPEC 이 이긴다.
**개정 이력**:
- 2026-09-25 초안 — ADR-29~37 (bigsix 전용 · `programId` 계약).
- 2026-09-26 개정 A — 범용 릴레이 전환. ADR-38~40 추가, ADR-30·31·32 의 `programId`·`progressions.json` 전제 부분을 각 ADR 안에 「Phase 3.5 개정」 마커로 대체 표기. Phase 3.5 재작업 페이즈 삽입.
- **2026-09-26 개정 B** — 릴레이 경계를 더 조인다. **ADR-38 재작성** (릴레이 = 구독 보관소 + 서명 발송기, 스케줄 몰라), **ADR-41 신설** (dedupKey 설계), **ADR-42 신설** (bigsix cron · 공용 tz 모듈 위치). ADR-30·31·32 의 개정 A 마커 위에 **「개정 B」** 마커 겹쳐 얹는다 (개정 A 도 취소선, 개정 B 로 대체). Phase 3.5 는 「릴레이 재작업 + bigsix cron 신설」 로 범위 확대 · Phase 4 는 systemd unit 이름·개수 변경.
- **2026-09-28 개정 C** — 릴레이를 떼어내기 좋게 경계 세 곳을 더 조인다. **ADR-43 신설** (공개 표면 `/subscribe` 하나 · nginx + 릴레이 두 겹 잠금), **ADR-44 신설** (릴레이 수명 분리 — 별도 체크아웃 · `/var/lib/push-relay` · `relay-deploy.sh`), **ADR-45 신설** (불투명 payload). ADR-31·38·40 과 「서버 API 상세」 · 「배포 통합 요약」 에 「개정 C」 마커. Phase 3.5 · Phase 4 PLAN 에 개정 C 절.

**선행 SPEC/GLOBAL 승계**:
- `.dc_workspace/2026_09_03-program-session/GLOBAL.md` — 엔진 ADR-1~7
- `.dc_workspace/2026_09_04-ui/GLOBAL.md` — UI 1차 ADR-8~14
- `.dc_workspace/2026_09_05-ui-2/GLOBAL.md` — UI 2차 ADR-15~19
- `.dc_workspace/2026_09_18-history-export/GLOBAL.md` — SPEC3 ADR-20~28
- 이번은 **ADR-29 부터** 잇는다 (개정 C 후: ADR-29~45).

---

## Feature Overview

SPEC4 「Overview」 그대로 잇는다.

1. **볼 계기가 없다** — 앱을 열지 않으면 오늘 운동일인지 모른다.
2. **웹은 앱이 닫혀 있는 상태에서 정해진 시각에 실행할 방법이 없다** — `setTimeout`, SW 타이머, Periodic Background Sync, `TimestampTrigger` 는 각각 스로틀·종료·간격 미보장·개발 중단 이유로 부적합.
3. **외부에서 깨워야 한다** — 실질적으로 Web Push 뿐. Firebase/FCM 불필요, VAPID 만으로 Chrome · Firefox · Safari(iOS 16.4+) 전부 동작.

**Solution 요지**
- **Phase 1** (Complete) `generateSW` → `injectManifest` 전환. 커스텀 서비스워커 파일을 `src/pwa-sw.ts` 로 두고 프리캐시·SPA 라우팅을 코드로 재구성, 이 자리에 `push` · `notificationclick` 핸들러를 얹는다 (FR-31 · FR-38).
- **Phase 2** (Complete · Phase 3.5 에서 계약 개정 B) 서버 런타임 뼈대. Node.js 24 + native `http`. 두 엔드포인트로 시작해 개정 B 에서 네 엔드포인트 (`/subscribe` POST·DELETE, `/subscriptions` GET, `/send` POST) 로 확장된다. **초안·개정 A 의 `programId`/`bodyByDay` 스키마는 Phase 3.5 에서 `meta` 하나로 접힌다.**
- **Phase 3** (Complete · Phase 3.5 에서 계약 개정 B) 발송 스케줄러. **개정 B: 이 페이즈가 만든 스케줄러는 Phase 3.5 에서 완전히 삭제된다.** dedup·410/404 정리 로직은 `/send` 응답 안으로 옮겨진다.
- **Phase 3.5** (신규 · 개정 B 로 범위 확대) **릴레이 재작업 + bigsix cron 신설.** 릴레이 쪽: `progressions.ts`·`scheduler.ts` 삭제, `subscriptions.ts` 스키마 v1→v3 (`meta` 도입, `bodyByDay`·`programId` 제거), `handlers.ts` 재작성 (`/subscribe` 개정 · `GET /subscriptions` · `POST /send` 신설), sentLog 는 `/send` dedupKey 기반으로. bigsix cron 쪽: `server/apps/bigsix-cron/` (또는 확정 경로) 신설 · progressions 로더 · tz 판정(FR-48 공용 모듈) · 본문 조립 · `/send` 호출. 공용 tz 모듈 `server/lib/tz/localNow.ts` 신설. `tests/server/` 총 315 유지 (도메인 테스트는 앱 cron 테스트로 이동).
- **Phase 4** 배포 통합. systemd unit 재정비 (`push-relay-api.service`, `bigsix-cron.service` + `.timer`; 기존 `bigsix-api.service`·`bigsix-scheduler.*` 는 rename/삭제). `nginx` 프록시 · `deploy/*.sh` 갱신 · VAPID 부트스트랩 (FR-39 개정 B). **Phase 4 는 이미 작성이 끝났으므로 PLAN 에 개정 절을 두어 무엇을 고쳐야 하는지 명시**한다.
- **Phase 5** 앱 알림 설정 UI. About 모달 알림 섹션. 감지 유틸·룬 스토어·`bigsix.push` 저장 (FR-32 · UI-12~16). **앱은 `meta` 만 서버에 보낸다** (개정 B). ~~`pushPayload.buildBodyByDay` 순수 함수~~ 는 앱에서 제거되고 bigsix cron 으로 이동 (Phase 3.5).
- **Phase 6** 재등록 통합. 프로그램 선택 · 제안 승인 · 시각 변경의 단일 진입점 (`push.reregister`), EC-80 실패 표시 (FR-33). 재등록 body 는 `{ app, endpoint, keys, meta }` (개정 B — bodyByDay 재계산 없음).
- **Phase 7** 문서 갱신. README · CHANGELOG 0.3.0 · CLAUDE.md 훅 목록 · `deploy/README.md` (VAPID 회전 시 전 앱 무효화 · 릴레이 = 서명 발송기, 스케줄은 앱 몫 안내).

---

## Architecture Decisions

1~4차의 ADR-1~28 을 승계하고, 이번 개정에서 새로 결정한 사항을 **ADR-29~40** 으로 잇는다 (ADR-29~37 은 2026-09-25 초안, **ADR-38~40 은 2026-09-26 범용 릴레이 개정**, ADR-41~42 는 개정 B, **ADR-43~45 는 2026-09-28 개정 C**).

### 승계 요약 (변경 없음)

- ADR-1~7 (엔진): planDay/planOn, AppState.stints/proposals, SessionInput/SessionRecord 분리, 미수행일 파생, 날짜 주입, 제안 2단계 API, history 인덱스 기반 카운트.
- ADR-8~14 (UI 1차): 단일 SvelteKit 앱, 보조 운동 제거, `adjustedAtSessionIndex` 앵커, 저장 봉투, `todayClock`, `boot()` 시퀀스, 페이즈 매핑.
- ADR-15~19 (UI 2차): 파생 카운트 유지, 자유 운동 판정 필터, RPE 정정, cube-study 준용 화면 규약.
- ADR-20~28 (SPEC3): `src/lib/ui/history/` 배치, 도메인 index 경유, 스키마 v3→v4, 시그니처 확장 규칙, `todayClock.nowIsoLocal`, 내보내기 파일 스키마, 폴더 재배치, R-2 import 표기.

**이번 개정에서 유효성이 재확인된 것**
- **ADR-21 (도메인 공개 API 경유)**: 이번 UI 코드가 `programId` 를 얻을 때 `currentStint(appState.value)?.programId` (`$lib/domain` 경유) 로만 접근하고 `appState.value.stints[...]` 식 내부 구조 접근은 0건이어야 한다. 사용자 지시 사항 재확인.
- **ADR-24 (시각 근원 하나)**: 구독 등록 시 시각은 `<input type="time">` 값(사용자 선택, 도메인 무관) 이고, tz 는 `Intl.DateTimeFormat().resolvedOptions().timeZone` 로 등록 순간에만 읽는다. `todayClock` 에 새 필드는 얹지 않는다 — 시각의 근원 규약과 충돌하지 않는다.
- **NFR-3 (도메인 순수성)**: 알림은 도메인에 들어가지 않는다. `src/lib/domain/**` 은 이번 작업에서 수정하지 않는다 (NFR-34). 알림 로직은 전부 `src/lib/ui/shell/` 아래 새 파일이거나 `server/` 하위.

---

### ADR-29 — 서버 런타임은 Node.js 24 + native `http`. 프레임워크 없음. (OQ-20)

**Problem**
이 저장소의 **첫 서버 런타임**이다. 언어·프레임워크·의존성 표면적을 뭘로 잡을 것인가.

**Decision**
- 런타임: **Node.js 24** (홈서버가 이미 `nvm 24` 로 앱 빌드에 쓰고 있어 재설치 불필요, `deploy/README.md:119` 「Node | nvm 24 (`~/.nvm`), pnpm 은 corepack」).
- 프레임워크: **없음.** 표준 `node:http` 모듈로 라우팅 2개(`POST /api/push/subscribe`, `DELETE /api/push/subscribe`) 만 구현. Express/Fastify/Hono 는 의존성 부풀리기.
- 의존성: `web-push` (VAPID 발송) 하나. 타입은 `@types/web-push` (dev).
- 서버 코드는 TypeScript 로 쓰되 **컴파일 없이 `node --experimental-strip-types` 로 실행** — 도메인 계층이 plain Node 로 도는 것과 같은 방식 (ADR-27 예외). Node 24 는 이 옵션을 지원한다.

**Rejected 대안**
- **Deno** — 홈서버에 새 런타임 설치 필요. 앱과 별도 툴체인이 되어 배포 스크립트 이중화.
- **Python(FastAPI)** — `web-push` 급성숙 파이썬 대체(`pywebpush`) 는 있으나, 홈서버에 Python 런타임 유지가 별도 부담. `tools/gen_*.py` 는 개발자 로컬에서만 돈다.
- **Go** — 컴파일 산출물 배포. 서버 코드가 얼마 안 되는 것에 비해 배포 파이프라인이 복잡.
- **Express** — 두 엔드포인트에 프레임워크는 낭비. `node:http` 로 20~30줄이면 끝난다.

**Rationale**
「가장 얇은 것」이 유지 부담을 최소화한다. `pnpm` 을 서버에도 쓰지 않는다 — 서버는 별도 `package.json` (Phase 4 에서 배포 시 `pnpm install`) 하나로 처리.

---

### ADR-30 — 서버 코드는 `server/` 하위. 앱 소스와 격리. (첫 서버 런타임 구조)

> **Phase 3.5 개정 B (2026-09-26)**: 개정 A 는 `progressions.ts` 를 서버에서 삭제하고 진행했으나, 이번 B 개정에서 「서버」 안에 두 프로세스(릴레이 · bigsix cron) 가 생긴다. `server/` 하위 구조가 **ADR-38 재작성 + ADR-42** 로 재편된다:
> ```
> server/
>   lib/tz/localNow.ts       # 공용 tz 판정 (FR-48). 릴레이 · 앱 cron 이 공유
>   relay/                   # 범용 릴레이. 앱 도메인 지식 0.
>     src/                   # index.ts · handlers.ts · subscriptions.ts · push.ts · endpoint-allowlist.ts · config.ts
>     package.json           # web-push · @types/web-push
>     data/                  # 런타임: subscriptions.json · vapid.private
>     systemd/push-relay-api.service
>   apps/bigsix-cron/        # bigsix 앱 스케줄러. progressions.json 을 상대경로로 참조
>     src/                   # index.ts (tick 진입점) · payload.ts (본문 조립) · relayClient.ts
>     systemd/bigsix-cron.service · bigsix-cron.timer
> ```
> - 개정 A 의 「`../../src/lib/data/progressions.json` 을 로드」 는 이제 **bigsix cron 만** 한다 (릴레이 아님). 이 상대 경로는 그대로 유효.
> - `server/relay/` 는 「범용 모양 유지」 규약이 강제된다 (H-17). 구조 테스트가 `progressions` · `programs` · `bigsix` 라는 문자열이 `relay/src/` 안에 없음을 검증한다.
> - 개정 A 원문의 「하위 구조」 다이어그램 (`server/src/index.ts` · `subscriptions.ts` · `scheduler.ts` · `progressions.ts` · `config.ts` 를 나란히 두는 배치) 은 이 새 배치로 **완전히 대체**된다. 이력용으로만 남는다.
> - `bash tests/server/run.sh` 는 릴레이 · 앱 cron 두 스위트를 함께 돌리도록 `run.sh` 를 수정한다 (Phase 3.5).

**Problem**
저장소는 지금까지 정적 앱뿐이었다. 서버 코드를 어디에 두고 앱 빌드와 어떻게 격리할 것인가.

**Decision**
- 위치: `server/` (저장소 루트 직속).
- 하위 구조:
  ```
  server/
    package.json          # web-push 의존, "type": "module"
    src/
      index.ts            # http 서버, 라우팅 진입점 (Phase 2)
      subscriptions.ts    # JSON 파일 저장소 (Phase 2)
      scheduler.ts        # 발송 진입점 (Phase 3, CLI)
      progressions.ts     # progressions.json 사본 파서 (Phase 3)
      config.ts           # 환경 변수 · 파일 경로 로더 (Phase 2)
    data/                 # 런타임 데이터. .gitignore 로 커밋 방지 (Phase 2)
      .gitkeep            # 디렉터리 자체는 커밋
    scripts/
      vapid-init.mjs      # VAPID 키 생성 · 회전 (Phase 4, ADR-33)
    systemd/              # 유닛 파일 (Phase 4)
      bigsix-api.service
      bigsix-scheduler.service
      bigsix-scheduler.timer
  ```
- 앱 빌드는 `server/` 를 완전히 무시한다. `vite.config.ts` 는 `server/` 를 만지지 않고, `svelte-check` 도 `tsconfig.json` 의 `include` 밖. 앱 tests 도 `server/` 를 import 하지 않는다.
- **`progressions.json` 사본** — 앱은 `src/lib/data/progressions.json` 을 그대로 쓴다. 서버는 배포 시 이 파일을 자기 자리(`server/data/progressions.json` 아님 — 아래 참고) 에 가져다 두지 않고, **저장소 안 원본을 그대로 상대 경로로 읽는다**: `server/src/progressions.ts` 가 `../../src/lib/data/progressions.json` 을 로드. 사본을 만들지 않으므로 앱과 서버가 자동 동기화된다 (SPEC H-9 「사본을 갖는다」의 「사본」은 물리적 파일 사본이 아니라 서버 프로세스의 in-memory 캐시를 뜻하는 것으로 해석).
- 서버 tests: **`tests/server/`** 신설. `tests/deploy/` 방식(bash+node) 을 그대로 따라, 실제 HTTP 서버를 임시 포트에 띄우고 요청을 쏴 검증. 홈서버·systemd 불필요.

**Rejected 대안**
- `src/server/` — SvelteKit 프로젝트 규약 침범. `svelte-check` 와 vite 가 이 경로를 헷갈릴 수 있음.
- 별도 저장소 — 배포·리뷰 단위가 갈라진다. 이슈 #6 의 「홈서버 하나」 감안하면 monorepo 형태로 두는 것이 자연스럽다.
- `progressions.json` 서버용 사본 별도 파일 — 앱 데이터 갱신 시 두 곳을 동기화해야 한다. 사고 여지.

**Rationale**
`src/` 는 앱 소스, `deploy/` 는 배포 스크립트, `server/` 는 서버 런타임. 셋이 서로를 침범하지 않는다.

---

### ADR-31 — 구독 저장은 JSON 파일 하나 (`<RELAY_DATA_DIR>/subscriptions.json`). SQLite 도입하지 않는다. (OQ-21)

> **개정 C (2026-09-28)**: 파일 위치가 저장소 밖으로 나간다. 운영은 `/var/lib/push-relay/subscriptions.json`, 경로는 필수 환경변수 `RELAY_DATA_DIR` 로만 정한다 (ADR-44). 아래 「개정 B」 박스의 `server/relay/data/` 경로는 이 개정으로 대체된다. 스키마 v3 는 그대로.

> **Phase 3.5 개정 B (2026-09-26)**: 개정 A 의 v2 스키마 (`app`·`title`·`bodyByDay` 포함) 도 폐기. **v3 으로 다시 잡는다**. Subscription 레코드가 「릴레이가 저장하는 최소」 만 남는다.
>
> ```json
> {
>   "version": 3,
>   "subscriptions": {
>     "<app>|<endpoint URL>": {
>       "app": "bigsix",
>       "keys": { "p256dh": "...", "auth": "..." },
>       "meta": { "tz": "Asia/Seoul", "notifyAt": "19:00", "programId": "good_behavior" },
>       "createdAt": "...",
>       "updatedAt": "..."
>     }
>   },
>   "sentLog": {
>     "<app>|<endpoint URL>|<dedupKey>": "<sent ISO time>"
>   }
> }
> ```
>
> 변경 요지 (개정 B):
> - **`title` · `bodyByDay` · `notifyAt` · `tz` 를 스키마에서 지운다.** 앱이 정하는 값은 `meta` 안에 접힌다. 릴레이는 `meta` 를 파싱하지 않는다 — JSON 이고 크기 상한(1024) 을 넘지 않으면 통과 (FR-41.2).
> - **sentLog 키가 `${app}|${endpoint}|<dedupKey>`** 로 바뀐다. 개정 A 는 「로컬 날짜」였고 릴레이가 tz 로 계산했지만, 개정 B 는 릴레이가 tz 를 모른다 — 앱이 `dedupKey` 로 넘긴 불투명 문자열을 그대로 키에 넣는다. bigsix cron 이 로컬 날짜를 dedupKey 로 넣으면 결과적으로 개정 A 와 동일한 하루 1회 억제 효과가 난다 (FR-44.2, ADR-41).
> - `version: 2 → 3`. 로컬에 개정 A 로 만들어진 v2 파일이 있으면 마이그레이션 없이 **버린다.** 근거는 사용자 확정이 아니라 사실이다 — 릴레이는 아직 홈서버에 설치된 적이 없고(Phase 4 설치 절차 미실행) 따라서 운영 중인 `subscriptions.json` 이 존재하지 않는다. 있다면 개발 중 로컬 파일뿐이다. 로더는 `version !== 3` 을 `emptyStore()` 로 취급.
> - subscriptions 저장 키 `${app}|${endpoint}` 는 유지. endpoint 안 파이프 거절도 유지 (신규 안전 장치).
> - sentLog 8일 보존은 그대로 유지되지만 pruning 기준이 바뀐다: 개정 A 는 「키에서 날짜를 뽑아」 로컬 오늘 −8일 초과 항목을 지웠다. 개정 B 는 릴레이가 tz 를 모르므로 **`sentLog` 값(발송 시각 ISO)** 을 기준으로 pruning 한다 (`sentAt < now - 8d`). 키의 dedupKey 는 오래된 판정에 쓰지 않는다.
> - 동시성 · 원자적 rename 은 그대로.

**Problem**
구독을 어디에, 어떤 형식으로 저장할 것인가. 스케줄러의 중복 방지 기록도 여기에 함께 담을 것인가.

**Decision**
- 파일: `server/data/subscriptions.json`.
- 스키마:
  ```json
  {
    "version": 1,
    "subscriptions": {
      "<endpoint URL>": {
        "keys": { "p256dh": "...", "auth": "..." },
        "programId": "good_behavior",
        "notifyAt": "19:00",
        "tz": "Asia/Seoul",
        "createdAt": "2026-09-25T12:34:56+09:00",
        "updatedAt": "2026-09-25T12:34:56+09:00"
      }
    },
    "sentLog": {
      "<endpoint URL>|2026-09-25": "2026-09-25T19:00:12+09:00"
    }
  }
  ```
- **동시성**: API 서버 · 스케줄러가 같은 파일을 쓴다. `read → mutate → write-tmp → rename` 패턴 (POSIX rename atomic). `flock` 는 도입하지 않는다 — 사용자 지시 사항 (단일 사용자, 기기 1~3개).
- **자원 규모**: 사용자 1명 × 기기 3개 = 최대 3 subscriptions, sentLog 는 8일치 × 3 = 최대 24 엔트리. 파일은 수 KB 이하 → JSON 파싱 코스트 무의미.
- **키 형식**: subscriptions 는 `endpoint` 를 그대로 키로 (URL, 수백 자). sentLog 는 `endpoint|YYYY-MM-DD` (파이프 구분자, endpoint 안에 파이프가 등장할 여지 있으므로 **첫 등장 파이프 앞까지가 endpoint** 라는 규약을 저장 헬퍼에서 강제).
- **`version: 1`**: 향후 스키마 변경 대비 필드 자리. 이번 버전에는 마이그레이션 체인 없음 — v1 만 존재. v0 (미존재) → v1 은 「빈 파일이면 초기화」로 대체.

**Rejected 대안**
- **SQLite (`better-sqlite3`)** — native 컴파일 의존성. 서버 첫 배포에서 nvm 24 위에 native module 컴파일이 실패했던 경험(cube-study `sharp` 사례). 규모(수 KB) 대비 과잉.
- **분리 파일** (`subscriptions.json` + `sent-log.json`) — 두 파일을 원자적으로 함께 갱신하기 위한 락 필요. 하나로 묶는 편이 rename-atomic 하나로 끝난다.
- **환경변수/메모리** — 재시작 시 상실. 스케줄러가 systemd timer 로 별도 프로세스이므로 상태를 파일로 넘겨야 한다.

**Rationale**
사용자 지시 「단일 사용자」 규모에서 파일 하나가 최소 표면적이다. 데이터가 늘어 500+ 엔트리가 되면 그때 SQLite 로 옮긴다 — YAGNI.

---

### ADR-32 — 스케줄러: 1분마다 실행, `(endpoint, 로컬날짜)` 로 dedup, 8일 보존, TZ 는 `Intl.DateTimeFormat`. (OQ-22)

> **Phase 3.5 개정 B (2026-09-26)**: **이 ADR 은 「릴레이 안의 스케줄러」로서는 전면 폐기.** 릴레이는 스케줄을 모른다 (H-17). 매 분 실행 · tz 판정 · 요일·시각 매칭 · 발송은 **bigsix cron 으로 이관** (ADR-42, FR-47).
> - 원문 (1)~(6) 알고리즘은 그대로 bigsix cron 의 tick 로직으로 옮겨진다. 단:
>   - (5) dedup 판정은 릴레이 안 `/send` 에서 수행 (ADR-41). 앱 cron 은 `dedupKey = 로컬 날짜` 를 넣기만 하면 된다.
>   - (6) 만료 정리(410/404)는 릴레이가 `/send` 응답 안에서 처리 (FR-44.3). 앱 cron 은 응답의 `deleted: true` 를 로그로 남기고 다음 tick 을 기다린다.
> - **TZ 처리는 공용 모듈 (`server/lib/tz/localNow.ts`, FR-48, ADR-42)** 로 뺀다. 릴레이는 이 모듈을 import 하지 않는다 (구조 테스트로 강제).
> - systemd unit 이름: `bigsix-scheduler.service`·`bigsix-scheduler.timer` → **`bigsix-cron.service`·`bigsix-cron.timer`** 로 rename (Phase 4). 「릴레이가 아니라 앱 cron」임을 이름에도 반영.
> - 개정 A 의 이 ADR 상단 각주 (「(2)(3) 이 ADR-38 로 대체」 · 「dedup 키는 `${app}|${endpoint}|${localDate}`」) 도 함께 폐기. 새 dedup 규약은 ADR-41 로 이관.
> - (4)(5)(6) 은 그대로. (6) 발송 페이로드는 `{ title: sub.title, body: sub.bodyByDay[weekday] }` 로 구성 (FR-34.5). `buildPayload` 를 부르지 않는다 (progressions.ts 자체가 사라진다).
>
> dedup 키는 `${endpoint}|${localDate}` → `${app}|${endpoint}|${localDate}` (ADR-31 개정). 보존 8일 · pruning · TZ 처리 · 로그 방식은 그대로.

**Problem**
FR-37 스케줄러가 1분마다 도는데 같은 (endpoint, day) 에 중복 발송하지 않아야 한다. TZ 경계(자정 직후) 처리와 보존 기간을 어떻게 잡는가.

**Decision**
- **실행 주기**: systemd timer `OnCalendar=*:0/1` (매 분 0초). `AccuracySec=15s` 로 짧게 잡는다. 각 실행은 스케줄러 CLI 를 부른다 — `node --experimental-strip-types server/src/scheduler.ts`.
- **매칭 알고리즘** (한 실행에서 모든 구독 순회):
  1. `sub.tz` 로 현재 시각을 로컬화: `new Intl.DateTimeFormat('en-CA', { timeZone: sub.tz, year, month, day, hour, minute, weekday, hour12:false })` 로 파트를 얻는다. `en-CA` 는 `YYYY-MM-DD` 반환이라 파싱하기 쉽다.
  2. `weekday` 를 한글 요일(`월` · `화` · …) 로 매핑. `progressions.json` 의 `schedule` 이 한글 키.
  3. `programs[sub.programId].schedule[weekday]` 가 비어 있으면 skip (휴식일, FR-34.4 / EC-83).
  4. 로컬 `HH:MM` 이 `sub.notifyAt` 과 정확히 같지 않으면 skip.
  5. 키 `${endpoint}|${localDate}` 가 `sentLog` 에 있으면 skip (dedup).
  6. 발송 → 성공 시 `sentLog[key] = 로컬 ISO 시각`. 응답이 `410 Gone` / `404 Not Found` 면 `subscriptions[endpoint]` 삭제 (FR-37.4 / EC-78 / EC-85).
- **TZ 경계**: 자정에 두 개의 로컬 날짜가 서로 다른 요일이 될 수 있으나, 스케줄러는 「지금 이 순간의 로컬 시각·요일」 하나만 본다. 자정 직후 실행은 새 날짜/요일이므로 자동 처리된다. 특별 케이스 없음.
- **보존 기간**: 스케줄러가 매 실행 끝에 sentLog 를 훑어 **8일보다 오래된** 엔트리를 삭제 (오늘 로컬 날짜 기준 −8일 초과). 7일이 아니라 8일인 이유: 서로 다른 tz 를 오가는 사용자가 있어도 안전 여유. 저장 크기가 무의미하므로 인색할 이유 없음.
- **로그**: `console.log` 를 그대로 씀 → systemd 가 journald 에 담아준다. `journalctl -u bigsix-scheduler` 로 확인.

**Rejected 대안**
- **크론 대신 setInterval** — 서버 프로세스가 죽으면 다시 못 뜬다. systemd timer 는 재부팅에도 살아난다.
- **초 단위 정확도** — 사용자가 「오후 7시」 라고 잡을 때 7시 0초 vs 7시 30초의 차이를 신경 쓰지 않는다. 분 단위로 충분 (FR-37.2 명시).
- **dedup 없이 timer 를 5분에 한 번** — 사용자가 놓친 알림이 있으면 아쉽고, 서버 재시작 사이에 발송이 누락된다.

**Rationale**
Dedup 기록을 같은 파일에 두면 API 요청·스케줄러 실행 어느 쪽이 실패해도 원자성이 보장된다. TZ 는 `Intl.DateTimeFormat` 이 표준이라 별도 라이브러리 불필요.

---

### ADR-33 — VAPID: 서버에서 생성, 비밀키는 서버 로컬 파일, 공개키는 앱 상수(저장소 커밋). 교체 절차 문서화. (OQ-23)

**Problem**
VAPID 키 쌍(공개/비밀)을 어떻게 만들고, 어디에 두고, 어떻게 교체하는가. **비밀키는 저장소에 커밋하지 않는다** (NFR-32).

**Decision**
- **생성**: `server/scripts/vapid-init.mjs` 를 서버에서 최초 1회 실행. 내부는 `web-push` 의 `generateVAPIDKeys()` 를 부르고 결과 `{ publicKey, privateKey }` 를 두 파일에 기록.
- **비밀키 저장**: `server/data/vapid.private` (base64url, 한 줄). 파일 소유는 `ulismoon`, `chmod 600`. `.gitignore` 로 커밋 차단 (`server/data/*` 전체를 gitignore, `.gitkeep` 만 커밋).
- **공개키 배포**: `server/scripts/vapid-init.mjs` 는 표준 출력에 공개키를 인쇄. 개발자가 그 문자열을 `src/lib/data/vapid.ts` (Phase 5 신규) 의 상수에 붙여넣고 커밋. 공개키는 base64url 이라 저장소에 안전.
- **환경변수 대신 파일인 이유**: systemd unit 에서 환경변수를 다루려면 `EnvironmentFile=` 로 별도 파일을 지정해야 하고 그 파일은 어차피 디스크에 있다. 그럴 바에는 파일 하나가 단순.
- **교체 절차** (`deploy/README.md` 「VAPID 키 교체」 절 신설, Phase 4):
  1. 서버에서 `node server/scripts/vapid-init.mjs --rotate` 실행 → `server/data/vapid.private` 를 새 값으로 덮어씀. 기존 파일은 `.bak.<timestamp>` 로 백업.
  2. 새 공개키를 출력. 개발자가 `src/lib/data/vapid.ts` 에 반영 후 커밋 · 푸시.
  3. 배포 (`./deploy/deploy.sh`) → 앱과 서버의 공개키가 다시 일치.
  4. **기존 구독은 무효화된다** — 브라우저는 예전 공개키로 만든 subscription 을 새 공개키로 발송하면 서명 검증 실패로 반응이 없거나 `410` 반환. 앱은 사용자가 다음에 About 을 열 때 「알림 켜기」 를 다시 누르도록 안내 (EC-80 흐름 재사용).
- **저장소 안전 장치**:
  - `.gitignore` 에 `server/data/`, `server/data/vapid.private`, `!server/data/.gitkeep` 추가 (Phase 2).
  - `tests/server/no-secrets.test.mjs` — 저장소 어디에도 `-----BEGIN` / `BASE64_PRIVATE` 패턴이 없음을 확인. 실수로 키가 커밋되면 CI 에서 잡힌다.

**Rejected 대안**
- **비밀키를 환경변수로만** — systemd unit 에 문자열이 들어가고 `systemctl cat` 으로 노출된다. 파일 권한이 더 안전.
- **매 배포 시 자동 회전** — 사용자 재구독 부담이 크다. 회전은 유출 대응 등 필요시만.
- **키 쌍을 CI 에서 생성** — GitHub Actions 시크릿에 비밀키를 두면 유출 표면적이 늘어난다.

---

### ADR-34 — iOS 미설치 감지: `matchMedia('(display-mode: standalone)')` + `navigator.standalone`. `install.svelte.ts` 와 연동하지 않는다. (OQ-24)

**Problem**
FR-32.4 · EC-77: iOS 홈 화면 미설치 상태(Safari 탭)에서는 `PushManager` 가 없다. 이를 검출해 안내 문구를 낸다.
사용자 지시 명시: `install.svelte.ts` 는 `beforeinstallprompt` 기반으로 **iOS standalone 감지 능력이 없다**.

**Decision**
- 새 파일: **`src/lib/ui/shell/pushSupport.ts`** — 순수 함수 4개.
  ```ts
  export function isPushSupported(): boolean;   // 'PushManager' in window && 'Notification' in window && 'serviceWorker' in navigator
  export function isStandalone(): boolean;      // matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  export function isIos(): boolean;             // /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
  export function pushBlocker(): 'none' | 'unsupported' | 'ios-not-installed';
  ```
- `pushBlocker()` 결과가 알림 섹션의 표시 갈래를 결정한다 (FR-32.4).
  - `'none'` — 정상 흐름.
  - `'ios-not-installed'` (iOS && !standalone && !isPushSupported) — 「홈 화면에 추가 후 이 기능을 쓸 수 있습니다」 (UI-16).
  - `'unsupported'` (그 외 `!isPushSupported`) — 「이 브라우저는 푸시 알림을 지원하지 않습니다」.
- **`install.svelte.ts` 는 건드리지 않는다.** UI-16 의 「설치 방법으로 가는 링크」 는 만들지 않는다 — iOS Safari 에서 `beforeinstallprompt` 가 발동하지 않으므로 링크할 대상이 없다. 사용자가 iOS 에서 자체 「공유 → 홈 화면에 추가」 를 쓰도록 문구로만 안내.
- 순수 함수이므로 tests 는 UA · matchMedia 를 mock 해 검증 가능.

**Rejected 대안**
- **UA 파싱을 서버에서** — 서버 API 는 CORS 없이 같은 origin 만 응답 (FR-36.3). UA 는 브라우저에 있고, 브라우저에서만 필요.
- **`install.svelte.ts` 안에 `isIosNotInstalled` 를 얹기** — 원본 파일 책임이 흐려진다. 이 파일은 「설치 프롬프트 캐시」 이지 「환경 판정」 이 아니다.

---

### ADR-35 — 커스텀 SW 는 `src/pwa-sw.ts`. `generateSW` 3옵션 이관 방식 확정. (OQ-25 · FR-31)

**Problem**
FR-31 이 요구하는 `injectManifest` 전환에서
(1) SW 파일을 어디에 두고,
(2) 현재 `workbox:` 키 3옵션 (`globPatterns`, `ignoreURLParametersMatching`, `navigateFallback`) 을 어떻게 옮기고,
(3) `sw.svelte.ts:54` 의 `/sw.js` 하드코딩과 어긋나지 않게 하는가.

**Decision**
- **파일**: **`src/pwa-sw.ts`**.
  - vite-pwa/sveltekit 문서 기본 `srcDir: 'src', filename: 'sw.ts'` 를 그대로 쓰지 않고 `pwa-sw.ts` 로 이름을 바꾼다. 이유: SvelteKit 자체 서비스워커 컨벤션(`src/service-worker.ts`) 과 이름을 분리해 「이 파일은 vite-pwa 소관」임을 파일명으로 명시. 향후 SvelteKit 이 서비스워커 API 를 확장해 같은 파일에 손을 대도 충돌하지 않는다.
  - 빌드 출력 파일명은 vite-pwa 기본값 그대로 `sw.js` — `sw.svelte.ts:54` 의 `/sw.js` 하드코딩과 일치 (FR-31.3 보존 요구).
- **`vite.config.ts` 변경**:
  ```ts
  SvelteKitPWA({
    strategies: 'injectManifest',
    registerType: 'autoUpdate',
    manifest: { ... 그대로 ... },
    injectManifest: {
      srcDir: 'src',
      filename: 'pwa-sw.ts',
      globPatterns: ['**/*.{js,css,html,json,svg,png,woff2}']
    }
  })
  ```
  - `ignoreURLParametersMatching` 과 `navigateFallback` 은 **`injectManifest` 의 build-time 옵션(`InjectManifestOptions`)에 없다** — workbox 스펙 그대로. SPEC FR-31.1 요구는 「세 값의 동작을 보존하는 것」이므로, 이관은 SW 코드에서:
    ```ts
    // src/pwa-sw.ts
    import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
    import { NavigationRoute, registerRoute } from 'workbox-routing';

    precacheAndRoute(self.__WB_MANIFEST, {
      ignoreURLParametersMatching: [/.*/],   // ← generateSW 등가 (NFR-30.b)
    });
    cleanupOutdatedCaches();
    self.skipWaiting();                       // ← autoUpdate 등가
    self.clients.claim();

    // SPA 라우팅 fallback — navigateFallback: '/' 등가 (NFR-30.c)
    registerRoute(new NavigationRoute(createHandlerBoundToURL('/')));
    ```
  - 이 세 옵션의 등가성은 Phase 1 TEST 의 프리캐시 전수 대조 (`deploy/deploy.sh`) 로 검증. 그 스크립트가 이미 `/sw.js` 에서 `url:"..."` 패턴을 뽑아 200 을 확인한다 (`deploy/deploy.sh:60-74`).
- **push · notificationclick 핸들러**는 같은 파일 하단에 얹는다 — FR-38 (Phase 1 에서 포함, 서버 없이도 SW 유닛 테스트 가능).

**Rejected 대안**
- **`src/service-worker.ts` (SvelteKit 이름)** — SvelteKit 이 이 이름을 자체 API 로 예약하고 있어 향후 충돌 여지.
- **`static/sw.ts`** — vite-pwa 가 소스로 처리하지 않아 injectManifest 가 동작하지 않는다.
- **세 옵션을 별도 config 필드로 옮기려 시도** — workbox 스펙상 존재하지 않는다. 코드로 이관하는 것이 유일한 정공법.

**Rationale**
SPEC FR-31.1 은 「동작을 보존하는 것」으로 명확히 명시한다. 이관 방식은 GLOBAL ADR-35 에서 상세 확정. Phase 1 완료 기준의 프리캐시 대조가 안전망.

---

### ADR-36 — 알림 상태는 별도 `localStorage` 키 `bigsix.push` 로 저장. AppState 봉투에 넣지 않는다.

**Problem**
FR-32.6 이 명시: "알림 설정 상태 (구독 등록 여부, 선택한 시각) 는 `localStorage` 에 별도 키(`bigsix.push`) 로 저장한다. `bigsix.state` (AppState) 에는 넣지 않는다 — 알림은 도메인 로직과 무관하다." NFR-3 (도메인 순수성), NFR-34 (`src/lib/domain/**` 이번 미수정) 준수.

**Decision**
- 스토리지 키: `bigsix.push`.
- 봉투 스키마:
  ```ts
  interface PushEnvelope {
    schemaVersion: 1;
    push: {
      enabled: boolean;             // 사용자가 「알림 켜기」 를 마지막으로 성공한 상태
      notifyAt: string | null;      // "HH:MM" 형식. enabled === false 면 null 허용
      endpoint: string | null;      // 마지막으로 서버에 등록한 endpoint (재등록 판별에 사용)
      lastError: string | null;     // EC-80 표시용. null 이면 오류 없음
      updatedAt: string;            // ISO local
    };
  }
  ```
- **스키마 버전**: `bigsix.state` 의 `CURRENT_SCHEMA_VERSION = 4` 와 **분리**. `bigsix.push` 는 독립 봉투로 `schemaVersion: 1` 부터 시작. 앞으로도 각자 진화한다.
- 저장·읽기 헬퍼는 `src/lib/ui/shell/push.svelte.ts` (Phase 5) 안의 사설 함수 — `state/storage.ts` 규약(문자열 통일, 예외 안 던짐)을 참고하되 확장은 하지 않는다. 스토리지 확장은 SPEC5 이후 필요할 때 결정.
- **판별**: `AppState` 봉투 shape 검사는 이 키를 무시한다. 초기화(FR-19.4 「전체 데이터 초기화」)는 `bigsix.push` 도 함께 지운다 — `src/lib/ui/state/reset.ts:performReset` 에 한 줄 추가 (Phase 5).

**Rejected 대안**
- **`AppState` 봉투에 `push?: {...}` 필드** — NFR-3 위반. 알림은 도메인이 모른다.
- **`bigsix.push.schemaVersion` 을 `bigsix.state.schemaVersion` 과 공유** — 알림 스키마가 바뀌지 않는데 앱 상태 스키마가 오르는 상황(반대도)에서 마이그레이션 관계가 복잡해진다.

---

### ADR-37 — 재등록 단일 진입점: `push.reregister()`. UI 두 곳에서만 후크한다.

**Problem**
FR-33.3 재등록 트리거가 UI 여러 곳(프로그램 선택 · 수동 전환 · 제안 승인 · 시각 변경) 에 흩어질 위험. 사용자 지시 위험 항목 2.

**Decision**
- 단일 함수: **`push.reregister()`** — `src/lib/ui/shell/push.svelte.ts` 의 룬 스토어 메서드.
  ```ts
  async reregister(): Promise<void> {
    // 1) 현재 스토어 상태를 확인 — enabled === false 면 즉시 return (재등록 필요 없음).
    // 2) currentStint(appState.value)?.programId 로 현재 programId 획득 (ADR-21).
    //    없으면 unsubscribe + enabled=false 로 되돌리고 lastError 설정 (EC-79 흐름).
    // 3) 기존 브라우저 subscription 이 있으면 unsubscribe(). 서버 DELETE.
    // 4) 새 subscription 생성 (PushManager.subscribe). 서버 POST.
    // 5) 성공 시 bigsix.push 갱신. 실패 시 enabled=false, lastError 설정 (FR-33.4 / EC-80).
  }
  ```
- 후크 위치는 **두 곳**:
  - `src/routes/programs/+page.svelte:27` (`selectProgram` 호출 직후) 와 그 파일 `confirmSwitch`. 둘 다 `programId` 가 바뀌는 자리.
  - `src/routes/+page.svelte:62` (`acceptProposal` 호출 직후).
- 시각 변경(FR-33.3.d)은 About 모달 안에서 직접 발생하고, 그 자리에 이미 push 스토어가 있으므로 「후크」가 아니라 **직접 호출**: About 알림 섹션의 `<input type="time">` `onchange` → `push.setNotifyAt(v)` → 내부에서 `reregister()`.
- 각 호출 지점은 fire-and-forget 이 아니라 **`await push.reregister()` 를 하지 않는다** — 사용자의 다음 조작(`goto('/')` 등)을 막지 않기 위해서. 오류는 `bigsix.push.lastError` 에 실려 About 모달을 열면 보인다.
- **`programId` 접근**: ADR-21 승계. `push.svelte.ts` 는 `$lib/domain` 의 `currentStint` 로만 접근한다. `appState.value.stints[…]` 식 내부 구조 접근은 0건 — Phase 5 tests 가 이를 검증.

**Rejected 대안**
- **각 UI 파일에서 subscribe/unsubscribe 를 직접 호출** — 3곳에 흩어져 오차 발생 여지. SPEC 위험 항목 2.
- **`$effect` 로 `programId` 변화를 감지해 자동 재등록** — 부팅 시 첫 로드에서 endpoint 없이 재등록을 트리거해 서버로 잘못된 요청. 명시적 후크가 안전.

---

### ADR-38 — **재작성 2026-09-26 B.** 릴레이는 구독 보관소 + 서명 발송기. 스케줄은 앱 cron 이 갖는다. (H-17 · H-18)

**개정 이력**
- **개정 A 원문 (2026-09-26)**: 서버가 도메인은 몰라도 「시각·요일 매칭 · dedup · 410/404 정리」 는 계속 했다. 앱이 `bodyByDay` 를 미리 조립해 넘겼다.
- **개정 B (2026-09-26)** — 개정 A 에서도 서버가 「스케줄러」로 매 분 도는 부분이 남아 있었다. 사용자 지적: **"릴레이는 뭐든 받아 보내주는 역할만. 언제 무엇을 보낼지는 각 서비스 안의 워커·크론이 결정한다. 그래서 중립 기능으로 분리한 것 아닌가."** 이 지적을 그대로 반영해 릴레이의 시간 인식을 완전히 뺀다. 아래 「Decision」이 개정 B 의 최종.

**Problem (개정 B 재기술)**
- 개정 A 릴레이는 여전히 「매 분 도는 스케줄러」 를 안고 있었다. 그 순간 릴레이는 시각·타임존·요일 개념을 갖고, 앱이 제출한 `bodyByDay[weekday]` 를 「그날 요일에 발송」해야 했다.
- 이것이 사용자 결정 (개정 B) 의 「중립」 정의를 어긴다: 「언제 · 무엇을」이 릴레이 안에 절반쯤 남아 있으면 앱마다 필요한 시간 규칙(로컬 요일 판정 · 휴식일 정의 · 하루 여러 번 알림 · 특정 이벤트 트리거 …) 이 등장할 때 릴레이 코드가 매번 확장돼야 한다.
- 「릴레이는 뭐든 받아서 서명해 보내주기만 한다」 로 경계를 다시 그으면 앱마다의 스케줄 규칙이 앱 cron 안에 갇힌다.

**Decision (개정 B 최종)**

**릴레이가 하는 일 (전부)**:
1. `POST /subscribe` — `{ app, endpoint, keys, meta }` 를 받아 `(app, endpoint)` 키로 저장. `meta` 는 앱이 정하는 불투명 JSON, 릴레이는 JSON 이라는 사실과 크기 상한만 검증한다.
2. `DELETE /subscribe` — `(app, endpoint)` 스코프 삭제. idempotent 204. 다른 앱 삭제 시도는 무변경.
3. `GET /subscriptions?app=X` — 그 앱 스코프의 구독 목록 반환. `keys` 는 응답에 넣지 않는다 (비밀).
4. `POST /send` — `{ app, endpoint, title, body, dedupKey? }` 를 받아 저장된 keys 로 VAPID 서명해 발송. `dedupKey` 가 있으면 sentLog 로 억제. 응답 410/404 이면 그 구독 정리 후 `deleted: true` 로 알림.
5. VAPID 서명 · endpoint SSRF 허용 목록 · 원자적 JSON rename.

**릴레이가 절대 하지 않는 일**:
- 시각·요일·타임존 계산. FR-48 공용 tz 모듈을 **import 하지 않는다** — 구조 테스트로 강제.
- `progressions.json` 참조. 앱 도메인 지식 전부.
- 재시도 큐. 5xx 는 응답에 실패로 남기고 앱 cron 의 다음 tick 에 맡긴다.
- `dedupKey` 문자열 해석. 앱이 정한다. 릴레이는 대소문자·형식 검사 없이 문자열로만 취급.

**앱 cron (bigsix cron 이 첫 사례)**:
- systemd timer 1분 (또는 앱이 원하는 주기). 릴레이의 배포 절차와 같은 저장소에서 나가되 프로세스 분리.
- `GET /subscriptions?app=<self>` 로 목록을 받는다. 각 레코드의 `meta` 를 앱이 해석해 「지금 이 기기에 무엇을 보낼지」 를 결정.
- 결정하면 `POST /send { app, endpoint, title, body, dedupKey }`. bigsix 는 `dedupKey = 로컬 날짜`.
- 릴레이 응답으로 흐름을 결정. 실패 로그는 systemd journal.
- 도메인 지식(progressions.json · programId 해석 · 요일 매핑 · 본문 조립) 은 전부 이 cron 안에.

**`meta` 스키마 (bigsix 결정)**:
- `meta = { tz: "<IANA>", notifyAt: "<HH:MM>", programId: "<current>" }`.
- 릴레이는 이 스키마를 강제하지 않는다. 다른 앱은 다른 형태를 넣을 수 있다.

**대체하는 것 (개정 B 관점)**
- **개정 A ADR-38 원문** (릴레이가 tz 판정·요일 매칭·`bodyByDay` 저장·매 분 스케줄러 소유) → 폐기.
- **ADR-30 의 `progressions.ts` 배치** → 개정 A 에서 이미 삭제. 개정 B 에서는 progressions 로더가 bigsix cron 안으로 부활 (릴레이가 아니라 앱 cron 이 도메인 소유자).
- **ADR-31 v2 스키마 (`title`·`bodyByDay` 포함)** → v3 (`meta` 로 접힘) 로 다시 대체.
- **ADR-32 「릴레이 안의 스케줄러」** → 완전 폐기. bigsix cron 으로 이관 (ADR-42).
- **개정 A 요일 코드 (`MO`~`SU`) 를 릴레이가 안다는 부분** → 폐기. 릴레이는 요일 개념을 갖지 않는다. bigsix cron 이 `progressions.json` 의 한글 요일 그대로 쓴다.
- **Phase 5 `pushPayload.buildBodyByDay` (앱 UI 안 순수 함수)** → 폐기 · bigsix cron 안 `payload.buildBody` 로 이동 (Phase 3.5 확대 범위).

**Rejected 대안 (개정 B)**
- **X. 개정 A 그대로 유지 (릴레이 안에 스케줄러 남기기)** — 앱마다 다른 스케줄 규칙(예: cube-study 는 「금요일 오후 5시 + 일요일 오전」, bigsix 는 「매 운동일 저녁」) 이 등장하면 릴레이가 「스케줄 조건 DSL」 을 지원해야 한다. 유지 부담 급상승. 「받아서 보낸다」 원칙이 흐려진다.
- **Y. 릴레이가 「크론 표현식」 을 저장해 앱이 시간 규칙만 넣기** — 앱 도메인의 「휴식일 · 진행 상태 · 사용자 별 다른 시각」이 크론 표현으로 잡히지 않는다. 시간 규칙만 옮기고 도메인은 앱에 남으면 두 곳에서 스케줄이 나뉘어 어긋난다.
- **Z. 앱이 서버에 「push 지시」를 미리 예약** — 개정 A 의 확장. 예약 시점과 발송 시점 사이에 앱 상태가 바뀌면 반영이 어렵다 (개정 A 의 `bodyByDay` 재계산 문제 재발). 「보낼 때 만든다」 가 근본적으로 낫다.

**개정 C 보강 (2026-09-28)** — 위 Decision 의 두 곳이 바뀐다.
- 4번 `/send` 요청은 `{ app, endpoint, payload, dedupKey? }` 이다. `title`·`body` 는 앱 payload 안으로 들어간다 (ADR-45).
- `/subscriptions` 와 `/send` 는 loopback 전용이다 (ADR-43). 앱 cron 이 부르는 경로는 `http://127.0.0.1:8791/...` 이다.

**Rationale**
- 스케줄이 앱 cron 에 갇히면 앱마다 자기 필요에 맞는 규칙을 자기 코드로 짤 수 있다. 릴레이는 그 규칙을 알 필요가 없다.
- 릴레이 코드가 얇아지면 나중에 별 저장소로 들어내는 비용이 낮아진다 (사용자 확정: 지금은 이 저장소에 두지만 「기계적으로 들어낼 수 있는 형태」).
- 「받아서 보낸다」 라는 한 문장이 릴레이 전체를 설명하도록 만드는 것이 이번 개정의 목표.

---

### ADR-39 — VAPID 키는 앱 공유 키쌍 하나. 회전 시 전 앱 무효화 감수. (2026-09-26 · H-16)

**Problem**
범용 릴레이가 되면 각 앱이 자기 VAPID 키를 가질 수도 있다 (서버가 `app` 별로 다른 키를 관리). 이렇게 나눌 것인가.

**Decision**
- 앱 전체가 **같은 키쌍 하나**를 공유한다. 서버는 `BIGSIX_VAPID_PRIVATE_KEY_PATH` / `BIGSIX_VAPID_PUBLIC_KEY` 를 한 벌만 로드한다.
- 공개키는 각 앱의 저장소에 상수(예: bigsix 는 `src/lib/data/vapid.ts`) 로 커밋. 앱마다 같은 값이 들어간다.
- **트레이드오프 명시**: 이 키쌍을 회전(rotate) 하면 **모든 앱의 기존 구독이 한꺼번에 무효화**된다. 각 앱의 사용자가 「알림 켜기」 를 다시 눌러야 한다. 자동 감지 수단 없음 (EC-90). README · `deploy/README.md` 에 이 사실을 반드시 명시한다 (FR-43.2, Phase 7).
- 이후 앱별 키로 나눠야 할 필요가 생기면: **스키마 변경 없이** 가능하다. `app` 필드가 이미 스코프를 나눠 두었다. `<dataDir>/vapid.<app>.private` 같은 파일 규약을 도입하고 `sendPush` 앞에서 app 별 키를 골라 서명하면 된다. 이번엔 하지 않는다 — YAGNI.

**Rejected 대안**
- **A. 앱별 키를 처음부터 두기** — 세팅이 앱 수만큼 곱해진다. 사용자 지시 「홈서버 단일 운영자」 · 「세팅 한 번」 반대. 초기 부담 대비 실익 없음.
- **B. 회전 절차를 자동화** — 회전은 유출 대응 등 예외 상황이 목적. 자주 도는 이벤트가 아니라 자동화의 실익이 작다.

**Rationale**
운영자가 한 명이고 앱이 몇 개 안 되는 규모에서는 「공유 키 + 회전 시 전 앱 재구독」 이 「앱별 키 + 앱별 회전」 보다 유지 부담이 낮다. 회전이 실제로 필요한 상황이면 어차피 모든 앱의 사용자에게 안내가 나갈 것이므로 재구독 부담이 특별한 비용은 아니다.

---

### ADR-40 — 앱 식별 (`app`) 과 입력 크기 상한. (2026-09-26 · 개정 B 로 스코프 확장)

**Problem**
- 범용 릴레이가 되면 저장 키의 스코프가 `endpoint` 만으로는 부족하다. 서로 다른 앱이 같은 브라우저 · 같은 endpoint 로 각자 구독을 걸 수 있고, 한 앱의 실수가 다른 앱의 구독을 지워선 안 된다.
- 릴레이가 앱이 준 문자열을 저장하거나 발송하므로 무제한 입력은 위험하다. Web Push 페이로드 상한(~4KB) 과 저장 파일 부풀림 방지가 필요.

**Decision (개정 B)**
- `app: string` 필드를 **네 엔드포인트 전부에 요구** (`POST /subscribe`·`DELETE /subscribe`·`GET /subscriptions?app=`·`POST /send`). 형식은 `^[a-z0-9][a-z0-9_-]{0,31}$`.
- 저장 키를 `${app}|${endpoint}` 로. sentLog 는 개정 B 에서 `${app}|${endpoint}|${dedupKey}` (ADR-41). endpoint 안에 파이프가 있으면 400 (신규 안전 장치).
- `DELETE` · `POST /send` 는 `(app, endpoint)` 일치할 때만 대상 인정. 불일치는 저장소 무변경. `DELETE` 는 `204` (idempotent), `POST /send` 는 `404 subscription-not-found` (EC-92).
- 크기 상한 (FR-41 개정 B):
  - 요청 body 전체: 16 KiB.
  - `app` 32, `endpoint` 2048, keys 각 256.
  - `meta` (JSON stringify 후 문자 수): 1024.
  - ~~`title` 80, `body` 200~~ → **개정 C**: `payload` UTF-8 직렬화 ≤ 3072 바이트 (ADR-45). `title`·`body` 길이는 bigsix payload 규약으로 이동.
  - `dedupKey` 64.
- ~~`bodyByDay` 키 검증~~: **개정 B 에서 무효** (FR-42 폐기).
- **자기 신고 (H-18)**: 서버는 `app` 화이트리스트를 두지 않는다. 남의 앱이 이 릴레이에 붙으려면 별도 인증이 필요해진다 — 그 조건이 오기 전까지는 이 릴레이를 공용 인터넷에 노출하지 않는다. **개정 C 에서 이 문장을 코드로 강제한다** (ADR-43).

**Rejected 대안**
- **A. `app` 대신 origin (Origin/Referer 헤더) 로 스코프** — CORS 를 안 쓰기로 결정(FR-36.3) 했고, 프록시 뒤에서 Origin 이 신뢰 정보가 되지 않는다.
- **B. `app` 화이트리스트를 서버에 두기** — 「앱은 데이터 · 자기 신고」 원칙(H-18, ADR-38 재작성) 위반.
- **C. 크기 상한을 유연하게 (앱별로 다르게)** — 스토리지·페이로드 상한은 앱과 무관. 서버 상수로 충분.

**Rationale**
- `app` 은 「데이터에 스코프를 주는 최소한의 라벨」 이다. 릴레이가 이 값의 의미를 해석하지 않고, 스코프 키로만 쓴다.
- 크기 상한 자체는 릴레이 상수로, 필요하면 코드 한 곳 수정.

---

### ADR-41 — dedupKey: 릴레이가 해석하지 않는 불투명 문자열. sentLog 8일 보존. (2026-09-26 B · FR-44)

**Problem**
- 릴레이는 스케줄을 모르므로 「오늘 이미 보냈나」 를 스스로 판단할 수 없다 (개정 A 는 로컬 날짜를 릴레이가 계산했다 — 개정 B 에서 폐기).
- 그러나 앱 cron 이 두 번 tick 안에서 실수로 같은 발송을 요청할 위험은 있다. 앱 cron 이 재시작·재배포 사이에 상태를 잃고 다시 보낼 수도 있다. 릴레이 쪽에도 최소한의 안전망이 필요.

**Decision**
- `POST /send` 가 옵션 필드 `dedupKey: string` 을 받는다. 없으면 dedup 검사 자체를 안 한다.
- 있으면 `(app, endpoint, dedupKey)` 를 sentLog 에서 찾는다.
  - 있으면 → 발송하지 않고 `200 {"status":"suppressed","reason":"dedup"}` (EC-91).
  - 없으면 → 발송 후 sentLog 에 기록. `200 {"status":"sent"}`.
- 릴레이는 dedupKey 문자열의 **형식·의미·자리수를 검사하지 않는다.** 앱마다 원하는 규약을 자유롭게 씀. bigsix cron 은 로컬 날짜(`2026-09-28`) 를 넣어 하루 1회 억제. 다른 앱은 프로그램 ID + 시간 조합, UUID 등 자기 필요에 맞게.
- **sentLog 보존 8일** (개정 A 규약 유지). pruning 은 매 `/send` 처리 끝에서 8일보다 오래된 항목을 삭제. **개정 B 변경점**: 릴레이가 tz 를 모르므로 「로컬 날짜」 로 판정하지 않고 **sentLog 값(발송 시각 ISO)** 을 기준으로 판정 (`sentAt < now - 8d`).
- `dedupKey` 크기 상한 64자 (FR-41.2).

**Rejected 대안**
- **A. dedupKey 없으면 자동으로 발송 시각을 키로** — 그러면 앱이 「같은 요청 두 번」 을 실수로 보내도 억제되지 않는다. 명시적 옵트인이 계약이 더 명확.
- **B. 릴레이가 dedupKey 형식을 강제 (예: 날짜만)** — 앱마다 다른 억제 규약을 지원하지 못한다. 「릴레이는 해석하지 않는다」 원칙에도 어긋난다.
- **C. dedupKey 필수화** — 앱이 dedup 불필요한 경우(1회성 알림 · 이벤트) 도 있다. 옵션이 옳다.

**Rationale**
- 불투명 문자열이 「릴레이는 뭐든 받는다」 원칙에 부합. 앱마다 다른 억제 규약을 자유롭게 넣을 수 있다.
- 8일 보존은 개정 A 의 실무 기준 유지. tz 이동을 오가는 사용자 여유.

---

### ADR-42 — bigsix cron 코드 위치 · 공용 tz 모듈. 릴레이와 격리한 프로세스 · 재사용 가능한 라이브러리. (2026-09-26 B · FR-47 · FR-48)

**Problem**
- 개정 B 에서 릴레이 안의 스케줄러가 사라지고, 각 앱이 자기 cron 을 갖는다. bigsix cron 은 이 저장소에서 만든다.
- 「지금이 이 기기의 로컬 `HH:MM` 인지」 판정은 앱 도메인과 무관하고, 앞으로 다른 앱 cron 도 똑같이 필요할 것이다. 이걸 앱 코드에 넣으면 앱마다 복붙이 생긴다.

**Decision**

**bigsix cron 위치**: `server/apps/bigsix-cron/`. 하위:
```
server/apps/bigsix-cron/
  package.json           # 별도 (또는 relay 와 공유 — 최소 부담쪽 선택. 초안: 별도.)
  src/
    index.ts             # tick 진입점 (`node --experimental-strip-types ...`)
    payload.ts           # 순수 함수: buildBody(program, weekdayKo) → string
    relayClient.ts       # GET /subscriptions · POST /send 래퍼
    progressions.ts      # ../../../src/lib/data/progressions.json 을 상대 경로로 로드
  systemd/
    bigsix-cron.service  # oneshot
    bigsix-cron.timer    # OnCalendar=*:0/1
```

- 앱 cron 은 progressions 로더의 소유자다 (개정 A 에서 잠깐 릴레이가 소유했다 삭제 · 개정 B 에서 앱 cron 으로 부활).
- 상대경로 `../../../src/lib/data/progressions.json` 을 그대로 로드 — 사본 없음, 앱과 자동 동기화.

**공용 tz 모듈 위치**: `server/lib/tz/localNow.ts`.
```ts
// 순수 함수. 인자만으로 계산 — Date.now 도 안에서 부르지 않는다.
export function localNow(instant: Date, tz: string): {
  date: string;                                    // "YYYY-MM-DD"
  hhmm: string;                                    // "HH:MM"
  weekday: 'MO'|'TU'|'WE'|'TH'|'FR'|'SA'|'SU';
  weekdayKo: '월'|'화'|'수'|'목'|'금'|'토'|'일';   // progressions.json 은 한글 요일
};
```

- `Intl.DateTimeFormat('en-CA', { timeZone: tz, ... })` 로 파트 조회 (기존 ADR-32 방식 재사용).
- bigsix cron 이 tick 마다 이 함수를 호출한다: `localNow(new Date(), sub.meta.tz)`.
- 릴레이는 이 모듈을 **import 하지 않는다.** 구조 테스트가 `grep -r "server/lib/tz" server/relay/` == 0 을 강제 (H-17).

**process 격리**:
- 릴레이 프로세스와 bigsix cron 프로세스는 별개. systemd 로 관리. 파일 저장소를 공유하는 유일한 경계는 릴레이가 소유한 `server/relay/data/subscriptions.json`. cron 은 그 파일을 직접 열지 않고 `GET /subscriptions?app=bigsix` 로만 접근 — 「같은 저장소 안에 있어도 릴레이 API 를 계약면으로 삼는다」 원칙.

**패키지 관리 부담 최소화**:
- 초안: `server/relay/package.json` 과 `server/apps/bigsix-cron/package.json` 을 나눈다. 각각 `npm ci --omit=dev` 로 설치. 릴레이는 `web-push` 만, bigsix cron 은 없거나 native fetch 로 릴레이 호출 (Node 24 는 fetch 표준 제공).
- `server/lib/` 는 두 서브 프로젝트가 상대 경로로 import (`import { localNow } from '../../../lib/tz/localNow.ts'`). 별도 패키지로 안 만든다 — 오버킬.

**Rejected 대안**
- **A. bigsix cron 을 `deploy/scripts/bigsix-cron.sh` 로 만들고 curl+jq 로 구현** — 도메인 계산(progressions·tz)이 shell 로는 복잡. 유지 부담 높음.
- **B. bigsix cron 을 앱 클라이언트(SW) 안에 두기 (Periodic Background Sync)** — SPEC 「Problem」 절이 이미 배제한 방향 (스로틀·간격 미보장).
- **C. 공용 tz 모듈을 `src/lib/domain/` 에 두기 (앱 도메인과 함께)** — NFR-3 (도메인 순수성) 위반, 그리고 앱 빌드 산출물이 서버 프로세스에 실려야 함. `server/lib/` 가 맞는 위치.
- **D. bigsix cron 을 릴레이 프로세스 안에서 `setInterval` 로 돌리기** — 개정 B 의 「릴레이는 스케줄을 모른다」 위반. 이 결정을 무너뜨린다.

**Rationale**
- 「릴레이 = 얇게 · 앱 cron = 앱 마음대로」 를 코드 구조로도 강제한다.
- `server/lib/tz` 는 앞으로 다른 앱 cron 도 재사용할 수 있다. cube-study cron 이 이 저장소가 아니라 다른 저장소에 있게 되더라도, 이 모듈은 npm package 로 뽑든 카피하든 손댈 여지가 열려 있다.

---

### ADR-43 — 공개 표면은 `/subscribe` 하나. `/subscriptions`·`/send` 는 loopback 전용, nginx 와 릴레이 두 겹으로 잠근다. (2026-09-28 C · H-19 · FR-36.8)

**Problem**
- 개정 B 의 nginx 설정(`deploy/nginx/bigsix.conf:45-50`, `location /api/push/`)은 릴레이의 네 엔드포인트를 **전부** 공개로 프록시했다.
- 그런데 `GET /subscriptions` 와 `POST /send` 는 인증이 없다 (H-18). SPEC FR-47.7 은 「vhost 프록시가 유일한 경계」 라고 적었지만 그 vhost 는 공개였다.
- 결과: 누구나 `GET /api/push/subscriptions?app=bigsix` 로 endpoint·meta(tz·programId) 를 얻고, `POST /api/push/send` 로 사용자 폰에 임의 제목·본문을 띄울 수 있었다. 릴레이가 아직 설치된 적이 없어 실제 노출은 없었다.

**Decision**
- **공개 표면**: 브라우저가 부르는 `POST`·`DELETE /subscribe` 뿐이다.
- **잠금 1 — nginx**: 정확 일치 location 하나와 나머지 404.
  ```
  location = /api/push/subscribe {
      client_max_body_size 16k;                          # FR-41.1
      proxy_pass http://127.0.0.1:8791/subscribe;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $remote_addr;     # 잠금 2 가 이 헤더를 본다
  }
  location /api/push/ { return 404; }
  ```
- **잠금 2 — 릴레이**: `X-Forwarded-For` 헤더가 있는 요청이 `GET /subscriptions` · `POST /send` 로 오면 `404 not-found`. 알 수 없는 경로와 같은 응답이라 존재 여부를 드러내지 않는다. 릴레이는 이미 `127.0.0.1` 에만 바인드한다 (`server/src/index.ts:83`) — 이 바인드가 잠금 0 이다.
- **앱 cron**: loopback 으로 직접 부른다 (`RELAY_BASE_URL=http://127.0.0.1:8791`, 접두사 `/api/push` 없음).
- **검증**: `deploy/deploy.sh` · `deploy/relay-deploy.sh` 가 공개 경로에서 두 엔드포인트가 404 인지 확인한다 (FR-39.4). `tests/server/relay/` 에 헤더 유무별 라우팅 테스트.

**Rejected 대안**
- **A. 앱별 토큰으로 `/send`·`/subscriptions` 인증** — 옳은 최종형이지만 지금은 호출자가 같은 호스트의 cron 하나뿐이다. 토큰 발급·보관·회전 절차가 따라온다. 다른 호스트의 호출자가 생길 때 도입한다 (H-18 그대로).
- **B. nginx 만으로 막기** — 설정 한 줄 실수(`location /api/push/` 로 되돌리기)로 다시 열린다. 릴레이 쪽 잠금은 테스트로 고정할 수 있다.
- **C. 릴레이를 공개/내부 두 포트로 나누기** — 같은 효과지만 프로세스 설정·nginx·systemd 가 모두 두 벌이 된다. 헤더 검사 한 곳이 더 싸다.

**Rationale**
- 인증 없이 안전하려면 「부를 수 있는 사람」 을 네트워크로 제한하는 수밖에 없다. 두 겹이면 한쪽 실수로 뚫리지 않는다.
- 릴레이를 떼어 다른 저장소로 옮겨도 이 규약은 코드(잠금 2)와 함께 따라간다.

---

### ADR-44 — 릴레이 수명 분리: 별도 체크아웃 · 저장소 밖 데이터 · 별도 배포 명령. (2026-09-28 C · H-20 · FR-39.3' · FR-39.7)

**Problem**
- 개정 B 배치에서는 릴레이 데이터가 bigsix 체크아웃 안(`~/apps/bigsix/server/relay/data`) 에 있고, bigsix 배포(`remote.sh` full 모드) 가 릴레이를 재시작했다.
- 앱이 늘면: bigsix 를 배포할 때마다 모든 앱의 알림 경로가 끊기고, 다른 앱의 구독 데이터가 bigsix 체크아웃에 산다. 나중에 릴레이를 별 저장소로 옮길 때 데이터 이전이 필요해진다.
- 같은 체크아웃에서 돌면 bigsix 배포의 `git checkout` · `npm ci` 가 실행 중인 릴레이 프로세스 아래의 파일을 바꾼다.

**Decision**
- **체크아웃**: 홈서버에 릴레이 전용 clone `~/apps/push-relay` (같은 GitHub 저장소). `push-relay-api.service` 의 `WorkingDirectory` 가 이것이다. bigsix cron 은 계속 `~/apps/bigsix` 에서 돈다.
- **데이터**: `/var/lib/push-relay` (소유 `ulismoon`, 700). `subscriptions.json` · `vapid.private` 가 여기 산다. 「최초 1회 설정」 에서 `sudo install -d -o ulismoon -g ulismoon -m 700 /var/lib/push-relay`.
- **설정**: `RELAY_DATA_DIR` 는 **필수**. 없으면 릴레이가 기동을 거부한다 (`loadConfig` 가 예외). 기본값을 저장소 안에 두면 체크아웃 안에 운영 데이터가 다시 생기기 때문이다. `RELAY_VAPID_PRIVATE_KEY_PATH` 기본값은 `<RELAY_DATA_DIR>/vapid.private`. 테스트는 임시 디렉터리를 넘긴다.
- **배포 명령**: `deploy/relay-deploy.sh <ref>` 신설. `~/apps/push-relay` 동기화 → `(cd server/relay && npm ci --omit=dev)` → `push-relay-api.service` 재시작 → 커밋 대조 · loopback 응답 · 공개 경로 404 확인. `lib.sh` 의 `resolve_commit` 재사용. `remote.sh` 에 `relay` 모드를 더하는 방식도 허용 — 요점은 bigsix full 모드에서 릴레이를 건드리지 않는 것.
- **bigsix 배포**: `remote.sh` full 모드는 `server/apps/bigsix-cron` install 과 `bigsix-cron.timer` 재시작만 한다.
- **배포 순서**: 릴레이 계약(FR-36) 이 바뀌는 커밋은 릴레이 먼저, bigsix 나중. `deploy/README.md` 에 적는다.
- **분리 시점**: 릴레이를 별 저장소로 옮길 때 바뀌는 것은 `~/apps/push-relay` 의 clone URL 과 `relay-deploy.sh` 의 위치뿐이다. 데이터·unit·nginx 는 그대로.

**Rejected 대안**
- **A. 같은 체크아웃, 재시작만 분리** — bigsix 배포의 `npm ci` 가 실행 중인 릴레이의 `node_modules` 를 바꾼다. 지연 로드가 있으면 깨진다. 버전 대조(어느 커밋의 릴레이가 돌고 있나)도 흐려진다.
- **B. 지금 바로 별 저장소로 분리** — 사용자 결정은 「기계적으로 들어낼 수 있는 형태로 이 저장소에 둔다」. 저장소 분리는 계약이 안정된 뒤.
- **C. 데이터를 `~/.local/share/push-relay`** — root 없이 되지만 사용자 홈 백업 정책과 섞인다. 서비스 상태는 `/var/lib` 가 관례이고 한 번 만들면 root 가 다시 필요 없다.

**Rationale**
- 앱이 늘어나는 순간 릴레이는 「bigsix 의 일부」 가 아니라 공유 인프라다. 공유 인프라의 수명이 한 앱의 배포에 묶이면 안 된다.
- 지금 분리해 두면 저장소 분리가 이사가 아니라 주소 변경이 된다.

---

### ADR-45 — push payload 는 앱이 정하는 불투명 JSON. 릴레이는 크기만 본다. (2026-09-28 C · H-21 · FR-34.5' · FR-41.2)

**Problem**
- 개정 B 의 `/send` 는 `{ title, body }` 두 필드로 닫혀 있었다. 알림 종류가 늘면 곧 필요해지는 것들 — 누를 때 열 URL, 같은 알림 덮어쓰기(`tag`), 앱별 아이콘, 액션 버튼 — 이 하나씩 올 때마다 릴레이 스키마·검증·테스트를 고쳐야 한다.
- 이는 ADR-38 의 「앱이 늘어도 릴레이 코드는 안 고친다」 와 충돌한다. `meta` 는 이미 불투명인데 payload 만 닫혀 있을 이유가 없다.

**Decision**
- `/send` 요청: `{ app, endpoint, payload, dedupKey? }`. 최상위 필드 화이트리스트는 이 넷.
- 릴레이 검증: `payload` 는 객체 (`null`·배열·원시값 아님), `Buffer.byteLength(JSON.stringify(payload), 'utf8') ≤ 3072`. 실패 시 `400 payload-invalid` / `400 payload-too-large`. 그 밖의 검사는 없다.
- 발송: `JSON.stringify(payload)` 를 그대로 VAPID 서명해 보낸다.
- 로그: payload 는 찍지 않는다 (FR-44.4).
- **해석은 앱 서비스워커의 몫**: bigsix SW 는 `{ title, body }` 를 읽고, 모양이 틀리면 `title="빅6"`·`body=""` 로 대체, 알 수 없는 필드는 무시 (FR-38.1 개정 C, EC-96). `src/lib/pwa/push-handlers.ts` 에 `parsePayload(unknown): PushPayload` 순수 함수를 더한다.
- **bigsix payload 규약**: `{ title: string ≤ 80, body: string ≤ 200 }`. bigsix cron 의 `payload.ts` 가 만들고 지킨다.

**왜 3072 바이트**: Web Push 레코드 상한은 4096 바이트이고 aes128gcm 암호화 헤더·패딩을 빼면 실질 약 3993. 여유를 두고 3 KiB. 문자 수가 아니라 바이트인 이유는 상한 자체가 바이트이기 때문 (한글 3 바이트).

**Rejected 대안**
- **A. 필드를 지금 미리 늘려두기 (`url`·`tag`·`icon`)** — 다음에 필요한 게 무엇일지 모르는 채 스키마를 넓히는 것. 결국 또 고친다.
- **B. payload 를 문자열로 받기** — 릴레이가 JSON 인지도 모르게 되면 SW 쪽 오류가 늘어난다. 객체 검증 하나는 싸다.
- **C. `title`·`body` 는 필수로 두고 나머지만 불투명** — 「알림이 아닌 push」(데이터만 보내 SW 가 판단) 도 앱 몫으로 남겨두는 편이 일관된다.

**Rationale**
- `meta`(ADR-38) · `dedupKey`(ADR-41) 와 같은 원리 — 릴레이는 담아 나를 뿐 열어보지 않는다.
- 알림 기능이 늘어도 바뀌는 곳이 앱 cron 과 앱 SW 둘로 고정된다.

---

## 데이터 모델 변경 (요약)

### (C.1) `bigsix.push` 봉투 (ADR-36, Phase 5)

ADR-36 의 `PushEnvelope` 그대로. `schemaVersion: 1`.

### (C.2) 서버 `subscriptions.json` (ADR-31 · Phase 2 v1 → Phase 3.5 v3)

- Phase 2·3 완료 시점: ADR-31 원문 스키마 (`version: 1`, `subscriptions[endpoint]`, `programId` 포함).
- **개정 B (Phase 3.5) 최종**: ADR-31 「개정 B」 스키마 (`version: 3`, `subscriptions[${app}|${endpoint}]`, `app`·`keys`·`meta` 만, `title`·`bodyByDay`·`notifyAt`·`tz` 없음, `programId` 없음). 스키마 개정 시 기존 v1·v2 파일은 버린다 (실사용자 없음).
- 파일 위치도 `server/data/` → ~~`server/relay/data/`~~ (ADR-30 개정 B) → **`/var/lib/push-relay/`** (개정 C, ADR-44). 경로는 필수 환경변수 `RELAY_DATA_DIR`.

### (C.3) `src/lib/data/vapid.ts` (Phase 5 신규)

```ts
/** VAPID 공개키 (base64url). server/scripts/vapid-init.mjs 가 표준 출력에 인쇄한 값을
 *  개발자가 이 상수에 붙여넣는다. 비밀키는 저장소에 오지 않는다 (ADR-33, NFR-32). */
export const VAPID_PUBLIC_KEY = 'BXXXXXXXX...';  // Phase 5 커밋 시점에 실제 값 삽입
```

### (C.4) `AppState` · 도메인 무변경

SPEC NFR-34 준수. `src/lib/domain/**` · `src/lib/ui/state/storage.ts` (AppState 봉투 부분) · 스키마 v4 는 이번에 손대지 않는다. `CURRENT_SCHEMA_VERSION === 4` 유지.

---

## 서버 API 상세 (개정 B · 개정 C 보강 · Phase 3.5 이후 유효)

**릴레이가 노출하는 엔드포인트 네 개** — `/subscribe` (POST · DELETE), `/subscriptions` (GET), `/send` (POST). 그 외 없음.
**개정 C**: 공개(nginx 경유) 는 `/subscribe` 뿐. `X-Forwarded-For` 가 붙은 `GET /subscriptions` · `POST /send` 는 `404 not-found` (ADR-43).

- **`POST /api/push/subscribe`** (FR-36.1 개정 B):
  - 요청 파싱 → shape 검증. 필드 화이트리스트: `app`, `endpoint`, `keys.p256dh`, `keys.auth`, `meta`. 예상 밖 필드는 400 `unknown-field:<name>`.
  - `app` 은 `/^[a-z0-9][a-z0-9_-]{0,31}$/`. 서버가 앱 화이트리스트를 두지 않는다 (ADR-38 재작성, ADR-40).
  - `meta`: 객체 (`typeof === 'object'`, `null`·array 아님). `JSON.stringify(meta).length ≤ 1024`. 그 밖의 검증은 없다 — 릴레이는 `meta` 안을 보지 않는다.
  - 요청 body 전체 크기 > 16 KiB 는 스트림 단계에서 컷 (`400 request-too-large`).
  - `subscriptions[${app}|${endpoint}]` 존재 여부로 `201` / `200` 분기.
  - `updatedAt` 갱신, 신규는 `createdAt` 도 설정.
- **`DELETE /api/push/subscribe`** (FR-36.2 유지):
  - `{ app, endpoint }` 받는다. `app` 미포함은 `400 app-missing`.
  - `(app, endpoint)` 가 저장소에 있으면 삭제. 없거나 `app` 이 다르면 저장소 무변경 · `204` (idempotent + 존재 정보 유출 방지, EC-86).
- **`GET /api/push/subscriptions?app=<id>`** (FR-36.6 신규):
  - `app` 파라미터 필수 · 형식 검증 실패 시 `400`.
  - 응답 body: `[{ endpoint, meta, createdAt, updatedAt }, ...]`. **`keys` 는 응답에 포함하지 않는다** — 비밀. `Content-Type: application/json`.
  - 존재하지 않는 `app` → `200 []`.
- **`POST /send`** (FR-36.7 · 개정 C, loopback 전용):
  - 요청 body: `{ app, endpoint, payload, dedupKey? }` (개정 C — ~~`title, body`~~ 는 payload 안으로). 필드 화이트리스트는 이 넷, 예상 밖 필드는 `400 unknown-field:<name>`.
  - 검증: `app` 형식 · `endpoint` 존재 (`(app, endpoint)` 조회), `payload` 객체 · UTF-8 직렬화 ≤ 3072 바이트 (ADR-45), `dedupKey` ≤ 64. 실패 시 400.
  - `(app, endpoint)` 없음 → `404 subscription-not-found` (EC-92).
  - `dedupKey` 있고 `(app, endpoint, dedupKey)` 이미 sentLog 에 있음 → **발송하지 않고** `200 {"status":"suppressed","reason":"dedup"}` (EC-91).
  - 발송: 저장된 `keys` 로 VAPID 서명. push 페이로드는 `JSON.stringify(request.payload)` 그대로 (개정 C). 릴레이는 안을 보지 않는다.
  - 발송 응답:
    - 정상 → sentLog 에 기록 (있는 경우 dedupKey 로). 8일보다 오래된 sentLog 항목 pruning. `200 {"status":"sent"}`.
    - `410 Gone` · `404 Not Found` → `(app, endpoint)` 저장소 삭제. `200 {"status":"sent","deleted":true}` (FR-44.3).
    - 그 외 5xx → `502 {"status":"upstream-error","code":<int>}`.
- 응답 헤더: `Content-Type: application/json` (본문 있을 때) 또는 `text/plain` (오류 문자열).
- CORS 없음. `Access-Control-*` 헤더 미설정.
- 로깅: 각 요청은 `console.log(method, path, app, endpoint-hash, status)` — journald. **`meta`·`payload`·`dedupKey`·전체 endpoint 값을 로그에 찍지 않는다** — endpoint 는 사실상 비밀 토큰, meta/title/body 는 사용자 문자열. endpoint 는 앞 8자만 로그에 남긴다 (디버깅용).

---

## 배포 통합 요약 (Phase 4 · 개정 B)

> **개정 C (2026-09-28)** — 아래 개정 B 요약 중 세 곳이 바뀐다. 실제 계약은 `PHASE_4_PLAN.md` 「개정 C 대응 절」.
> - **nginx**: `location /api/push/` 통째 프록시 → `location = /api/push/subscribe` + `location /api/push/ { return 404; }` (ADR-43).
> - **`push-relay-api.service`**: `WorkingDirectory=/home/ulismoon/apps/push-relay` (별도 체크아웃), `RELAY_DATA_DIR=/var/lib/push-relay`, `RELAY_VAPID_PRIVATE_KEY_PATH=/var/lib/push-relay/vapid.private` (ADR-44).
> - **`remote.sh`**: bigsix full 모드에서 릴레이 install·재시작 제거. 릴레이는 `deploy/relay-deploy.sh <ref>` 로 따로 (ADR-44).

**개정 B 핵심 변경**: systemd unit 이름·개수·역할이 바뀐다. 개정 A 계획대로 이미 작성된 `PHASE_4_PLAN.md` 는 「개정 B 대응 절」 을 새로 얹어 무엇을 고쳐야 하는지 명시한다.

**개정 A → 개정 B 매핑**:
| 개정 A unit | 개정 B unit | 변경 |
|---|---|---|
| `bigsix-api.service` | **`push-relay-api.service`** | rename. 이 서비스는 릴레이 (bigsix 전용 아님). `ExecStart` 도 `server/relay/src/index.ts` 로 |
| `bigsix-scheduler.service` | ~~삭제~~ | 릴레이 안 스케줄러는 사라진다 (ADR-38 재작성) |
| `bigsix-scheduler.timer` | ~~삭제~~ | 동상 |
| — (신설) | **`bigsix-cron.service`** | oneshot. bigsix 앱 cron. `ExecStart=... server/apps/bigsix-cron/src/index.ts` |
| — (신설) | **`bigsix-cron.timer`** | `OnCalendar=*:0/1`, `AccuracySec=15s` (개정 A timer 규약 그대로 이관) |

- **`deploy/nginx/bigsix.conf`**: `/api/push/` 프록시 location 을 `server { listen 443 ssl http2; ... }` 블록 안 `location /` 위에 추가.
  ```
  location /api/push/ {
      client_max_body_size 16k;                          # FR-41.1
      proxy_pass http://127.0.0.1:8791/;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $remote_addr;
  }
  ```
  - **포트 확정: `8791`** — 개정 A 와 동일. `server/relay/src/config.ts` 의 기본값도 8791.
  - `proxy_pass` URL 끝의 `/` 로 `/api/push/subscribe` → `http://127.0.0.1:8791/subscribe` 로 rewrite 됨. 릴레이는 `/subscribe`·`/subscriptions`·`/send` 만 알면 된다.

- **`deploy/systemd/push-relay-api.service`** (개정 B):
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
  - 환경 변수 접두사 `BIGSIX_*` → `RELAY_*` (릴레이는 bigsix 전용이 아니므로 이름도 중립화).

- **`deploy/systemd/bigsix-cron.service`** + **`.timer`** (개정 B 신설):
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

- **`deploy/remote.sh` 변경** (개정 B):
  - `sync_repo` 이후 `pnpm install --frozen-lockfile` 는 그대로.
  - 서버 install: `(cd server/relay && npm install --omit=dev)` **그리고** `(cd server/apps/bigsix-cron && npm install --omit=dev)`. 두 하위 프로젝트가 각자 lockfile 을 가진다. lockfile 도 커밋.
  - 재시작: `sudo systemctl restart push-relay-api.service` **그리고** `sudo systemctl restart bigsix-cron.timer`. sudoers 에 두 유닛 명시.
  - `server-install` CLI 모드는 그대로 두되 두 하위 install 을 모두 실행하도록 조정.

- **`deploy/deploy.sh` 변경**: 개정 A 와 동일 — `/api/push/subscribe` 잘못된 body POST → 400 확인. `/send` 는 검증하지 않는다 (사이드이펙트).

- **`deploy/README.md` 갱신** (개정 B):
  - 「서버 런타임」 절: `push-relay-api` + `bigsix-cron.timer` 두 유닛 · 각 `journalctl -u ...` 명령.
  - 「릴레이는 스케줄을 모른다」 는 사실을 한 줄 명시 — 오해 방지.
  - 「VAPID 키 교체」 절 그대로.
  - 「최초 1회 설정」 에 systemd unit 3개 (`push-relay-api.service`, `bigsix-cron.service`, `bigsix-cron.timer`) 설치 + sudoers 편집.

---

## Phase 목록 (총 8개, 전부 순차 — Phase 3.5 삽입)

병렬 조건 검토:
- **파일 겹침**: Phase 2·3·3.5(서버) 은 `server/` 하위, Phase 5·6(UI) 은 `src/lib/ui/`, Phase 1(SW) 은 `src/pwa-sw.ts` + `vite.config.ts`. 겹치지 않는 파일들은 있으나…
- **런타임 의존**: Phase 5(UI 알림 설정) 가 실제로 subscribe 하려면 서버(Phase 3.5 완료 후)·VAPID 공개키(Phase 4 배포 후) 가 필요. Phase 6(재등록) 은 Phase 5 스토어에 의존. **Phase 4 는 Phase 3.5 완료 후에만 배포한다** — 초안 스키마로 배포하면 Phase 5 앱과 계약이 어긋난다.
- **테스트 자원**: Phase 1 이 injectManifest 전환을 완료해야 Phase 5 의 SW 등록 흐름이 흔들리지 않음. Phase 3.5 는 Phase 2·3 이 이미 세운 tests/server 스위트를 재작성한다 — 파일 단위로 겹치지만 시점이 다르다.
- **결론**: 병렬 불이득. ADR-14 「개발자 1인 순차」 승계. **Phase 3.5 는 Phase 3 뒤 · Phase 4 앞** 자리 (선례: `.dc_workspace/2026_09_18-history-export/PHASE_2.5_PLAN.md`, `2026_09_03-program-session/PHASE_3.5_PLAN.md`). 뒤 번호(Phase 4~7) 는 밀지 않는다.

| # | 이름 | Status | 요지 | SPEC 참조 |
|---|---|---|---|---|
| 1 | injectManifest 전환 + 커스텀 SW | Complete | `vite.config.ts` 를 `injectManifest` 로 · `src/pwa-sw.ts` 신규 · precache/navigate/skipWaiting/clientsClaim 이관 · push/notificationclick 핸들러. 완료 기준에 프리캐시 전수 대조 포함 | FR-31, FR-38, NFR-30, RISK-1 |
| 2 | 서버 뼈대 + subscribe/unsubscribe API | **Complete (Phase 3.5 에서 개정 B 로 재작성)** | `server/` 신설. `node:http` 로 두 엔드포인트. 초안 스키마 (`programId` 포함) 로 완성. Phase 3.5 에서 스키마·엔드포인트 계약이 개정 B 로 뒤집힌다 — 이력 유지 | FR-36 초안, ADR-29~31 |
| 3 | 스케줄러 + VAPID 발송 | **Complete (Phase 3.5 에서 개정 B 로 삭제)** | `web-push` · `Intl.DateTimeFormat` 매칭 · dedup · 만료 정리. progressions.json 로더. CLI 진입점. **개정 B 에서 이 페이즈의 산출물 대부분이 삭제된다** — 스케줄러가 릴레이에서 사라지고, dedup·만료 정리는 `/send` 응답 안으로, progressions 로더는 bigsix cron 으로 이관 | FR-37 초안, ADR-32 |
| **3.5** | **릴레이 재작업 + bigsix cron 신설** (개정 B 로 범위 확대) | **Not Started** | **릴레이 쪽**: `server/src/progressions.ts` · `server/src/scheduler.ts` 삭제. `server/` 재구성 → `server/relay/`. `subscriptions.ts` 스키마 v1→v3 (`meta` 도입). `handlers.ts` 재작성 (POST/DELETE `/subscribe` 갱신 · `GET /subscriptions` · `POST /send` 신설). sentLog dedupKey 기반. **bigsix cron 쪽**: `server/apps/bigsix-cron/` 신설 · progressions 로더 · tick 진입점 · relayClient · payload 순수 함수. **공용 tz 모듈** `server/lib/tz/localNow.ts` 신설. `tests/server/` 총 315 유지 (분배 재조정). **개정 C**: `/send` payload 불투명화 · 내부 경로 잠금 · `RELAY_DATA_DIR` 필수 · SW `parsePayload` | FR-34, FR-36 개정 B·C, FR-38.1 개정 C, FR-40 확장, FR-41 재조정, FR-44, FR-47, FR-48, ADR-38 재작성·ADR-41~45 |
| 4 | 배포 통합 + VAPID 부트스트랩 | Not Started (**개정 B 개정 절 삽입 필요**) | Phase 4 는 개정 A 계획으로 이미 작성 완료. 개정 B 를 위해 unit rename · 추가 install 경로 절만 추가한다. PLAN 문서에 「개정 B 대응」 절을 두어 무엇을 고쳐야 하는지 명시. **개정 C**: nginx 정확 일치 · 릴레이 별도 체크아웃·데이터·`relay-deploy.sh` · 공개 경로 404 검증 | FR-39 개정 B·C, ADR-33, ADR-39, ADR-43, ADR-44 |
| 5 | 알림 설정 UI (About 알림 섹션) | Not Started | `pushSupport.ts` · `push.svelte.ts` · `bigsix.push` 저장 · About 섹션 · `vapid.ts` 공개키 상수 · `reset.ts` 갱신 · data-* 훅. **개정 B**: 앱은 등록 시 `meta` 만 보낸다 (`title`·`bodyByDay` 조립 없음). `pushPayload.ts` 는 앱에서 제거되고 bigsix cron 으로 이동 (Phase 3.5) | FR-32, FR-32.7' (대체), UI-12~16, ADR-34·35·38 재작성 |
| 6 | 재등록 통합 (프로그램·제안·시각 후크) | Not Started | `push.reregister()` 단일 진입점. programs/+page.svelte · +page.svelte · About 시각 변경 후크. EC-80 표시. **개정 B**: 재등록 body 는 `{app, endpoint, keys, meta}` 뿐 (bodyByDay 재계산 없음) | FR-33, ADR-37, ADR-38 재작성 |
| 7 | 문서 갱신 | Not Started | README 알려진 한계 · CHANGELOG 0.3.0 · CLAUDE.md `data-push-*` 훅 · `deploy/README.md` (Phase 4 에서 이미 갱신됨 확인). **README · `deploy/README.md` 에 「릴레이 = 서명 발송기, 스케줄은 앱 cron 이 소유」 명시** (H-17). VAPID 회전 시 전 앱 무효화 (H-16) 도 명시 | H-13, H-16, H-17, H-18, FR-43.2 |

임시 배포는 페이즈에 넣지 않는다 — 사용자가 별도 지시로 `deploy/deploy.sh feature/push-notification` 을 부른다. **Phase 4 완료 후 처음으로 서버가 살아나므로**, Phase 5 UI 는 서버가 서 있을 때 통합 확인 가능.

---

## data-* 훅 목록 (신규)

Phase 5 에서 도입되고 Phase 7 에서 `CLAUDE.md` 훅 목록에 더한다.

- `data-push-permission` — 값: `'default' | 'granted' | 'denied'` (Notification.permission 반영).
- `data-push-status` — 값: `'on' | 'off' | 'blocked' | 'unsupported' | 'ios-not-installed' | 'no-program'`. 섹션 루트에 부착.
- `data-push-notify-at` — 값: `HH:MM` (input.time 의 현재 값). input 자체가 아닌 상위 컨테이너에 부착해 테스트 안정성 확보.
- `data-push-enable` — 알림 켜기 버튼.
- `data-push-disable` — 알림 끄기 버튼.
- `data-push-error` — 값: `'permission-denied' | 'subscribe-failed' | 'server-unreachable'` (lastError 반영). 오류 문구 영역.

---

## 위험 · 트레이드오프

- **RISK-1** (사용자 지시 최대 위험): `generateSW → injectManifest` 전환. Phase 1 완료 기준에 `deploy/deploy.sh` 프리캐시 전수 대조 실행을 명시하지만, 이 대조는 실제 홈서버 배포 후에만 돌릴 수 있다. Phase 1 로컬 검증에서는 `pnpm build` 산출물 `build/sw.js` 를 파싱해 `url:"..."` 목록을 뽑고, `build/` 안의 파일 존재 여부로 대조하는 **로컬 대체 검증**을 병행한다. TEST 문서에 이 검증 항목을 넣는다.

- **RISK-2** (서버 첫 도입): 서버 코드 위치·빌드·시스템 사용자·systemd 세팅이 이 저장소에 처음 등장. Phase 2·3 에서 서버를 만들 때는 홈서버 없이도 검증 가능해야 한다 — `tests/server/` 를 만들어 임시 포트에 http.Server 를 띄우고 실제 요청을 쏴 검증. `tests/deploy/` 방식 답습.

- **RISK-3** (`programId` 접근 규약): FR-33 재등록 트리거가 여러 UI 파일에서 발동될 때 `appState.value.stints[...]` 식 내부 구조를 실수로 만질 수 있다. ADR-21 승계 · ADR-37 단일 진입점 · Phase 5 tests 에서 `push.svelte.ts` 가 `currentStint` 만 부르는지 grep 검사.

- **RISK-4** (VAPID 키 교체 시 사용자 재구독 부담): 교체 시 기존 구독은 무효화된다. 앱은 자동 감지 수단이 없으므로 사용자가 About 을 열어 「알림 켜기」 를 다시 눌러야 한다. 교체는 예외 상황으로 남기고, CHANGELOG · README 에 절차만 문서화.

- **RISK-5** (JSON 파일 동시 쓰기 경합): API 서버 · 스케줄러가 같은 파일을 쓴다. `read → mutate → write-tmp → rename` 은 rename 자체는 원자적이지만 read-mutate 간격에 다른 프로세스의 write 가 끼면 lost update 가능. 단일 사용자·저부하 환경에서 확률이 매우 낮아 감수. 발생 시 다음 스케줄러 실행이 자동 복구(구독 재등록 요청 · dedup 재기록). `flock` 도입은 실측 사고가 있을 때 검토.

- **RISK-6** (UA 파싱 부정확성): `isIos()` 는 UA 정규식 기반. iPadOS 13+ 는 데스크톱 Safari UA 를 흉내 내 오탐 가능. 안전장치: `!isPushSupported()` 이면 `'ios-not-installed'` 또는 `'unsupported'` 로 갈리므로, iPadOS 가 실제로 `PushManager` 를 지원하는 상황(설치 PWA)에서는 UA 오탐이 아무 영향을 주지 않는다. 미지원 iPadOS Safari 탭에서는 문구가 「지원하지 않는 브라우저」 로 뜰 수 있으나 사용자 경험상 큰 차이 없음.

- **RISK-7** (systemd timer 정확도): `OnCalendar=*:0/1` + `AccuracySec=15s` 조합으로 이론상 최대 15초 지연. 사용자 「오후 7시」 지정 시 실제 발송은 7:00~7:00:15 사이. UX 상 허용 범위.

- **RISK-8** (Phase 3.5 재작업 — 개정 B 로 범위 확대): Phase 2·3 이 이미 Complete 인 상태에서 스키마·API 계약을 두 번째로 뒤집는다. 회귀 위험이 크다. 대응:
  (1) Phase 3.5 는 **Phase 4 배포 앞**에 완료되어야 한다 — 개정 A 계약으로 nginx·systemd 를 세우면 개정 B 앱과 어긋난다.
  (2) 서버 tests 총 개수 315 를 유지 — 개정 B 에서 도메인 테스트가 릴레이 스위트에서 빠지고 bigsix cron 스위트로 이동. 계약 검증 · dedupKey · `/send` 흐름 · tz 모듈 유닛 테스트로 채운다.
  (3) 스키마 v1·v2 파일은 마이그레이션 없이 v3 로 초기화. 릴레이가 아직 설치된 적이 없어 운영 데이터가 존재하지 않는다 (사용자 확정 사항이 아니라 사실 판단).
  (4) 커밋 경계를 (a) 릴레이 재작성 · (b) bigsix cron 신설 · (c) 청소 로 명확히 나눈다. 각 커밋 후 `bash tests/server/run.sh` 통과.

- **RISK-10** (개정 C — 두 체크아웃의 버전 어긋남): 릴레이와 bigsix cron 이 서로 다른 커밋에서 돈다. 릴레이 계약이 바뀌는 커밋을 bigsix 만 배포하면 cron 이 옛 릴레이에 새 형식을 보낸다. 대응: 배포 순서 규약(릴레이 먼저) 을 `deploy/README.md` 에 적고, 릴레이는 모르는 필드를 `400 unknown-field` 로 거절해 조용히 틀리지 않게 한다. cron 은 400 을 journal 에 남긴다.

- **RISK-11** (개정 C — `X-Forwarded-For` 의존): 릴레이 쪽 잠금은 nginx 가 이 헤더를 붙인다는 전제다. 헤더 없이 프록시하는 설정으로 바뀌면 잠금 2 가 풀린다. 대응: nginx 정확 일치(잠금 1)가 일차 방어이고, 배포 검증이 공개 경로 404 를 매번 확인한다. `tests/deploy/` 에 nginx 파일의 `proxy_set_header X-Forwarded-For` 존재를 grep 으로 고정.

- **RISK-9** (릴레이 경계 침범): 향후 「간단한 스케줄 규칙 하나만 릴레이에」 라는 유혹이 올 수 있다. 이 규약을 어기면 개정 A 로 되돌아간다. 대응: 구조 테스트로 강제 — `server/relay/**` 에서 `Intl.DateTimeFormat` · `progressions` · `server/lib/tz` 사용을 grep 으로 잡아 실패 처리 (Phase 3.5).

---

## SPEC 지적 / 확인 사항

- **SPEC FR-31.1 직접 수정 완료**: SPEC 이 「세 값의 동작을 보존하는 것」으로 갱신되었다. `ignoreURLParametersMatching` · `navigateFallback` 을 SW 코드로 이관하는 방식은 GLOBAL ADR-35 에서 확정.

- ~~**SPEC H-9 「서버가 progressions.json 사본을 갖는다」 해석**: 물리적 파일 사본이 아니라 「서버가 읽어서 in-memory 캐시로 갖는다」 로 확정 (ADR-30).~~ **개정 A 로 폐기 · 개정 B 로 재확정 (2026-09-26)** — 릴레이는 이 파일을 참조하지 않는다. bigsix cron 이 상대 경로로 그대로 로드한다 (ADR-42). H-9 는 「나가는 데이터의 민감도」 취지로 남고, 릴레이 저장 필드는 `{app, endpoint, keys, meta, 타임스탬프}` 뿐 (H-17, ADR-38 재작성).

- **SPEC FR-33.3 재등록 트리거 확정 (4개로 업데이트)**:
  - SPEC 이 (a) selectProgram · (b) switchProgram(신규 추가) · (c) acceptProposal · (d) 시각 변경 으로 갱신되었다.
  - `routes/programs/+page.svelte:27` (`selectProgram`, 미선택 브랜치) 와 `:39` (`switchProgram`, `confirmSwitch`) 두 자리 모두에 후크 필요.
  - `routes/+page.svelte:62` (`acceptProposal`) 은 정확 — SPEC (c) 에 해당.
  - ADR-37 에서 단일 진입점 `push.reregister()` 로 세 UI 자리 모두 처리.

- **테스트 기준선**: `pnpm test` 실측 (main 브랜치 dc84f1e) — **797 tests / 38 files** (사용자 지시). 각 페이즈에서 이 이상 유지. Phase 5·6 에서 pushSupport · push 스토어 tests 로 늘어난다.

- **FR-39.3 `deploy/remote.sh` 「API 서버 시작/재시작 단계」의 의미**: 서버 코드 install + systemd 서비스 재시작. sudoers 편집이 최초 1회 필요 — `deploy/README.md` 에 명시.

---

## Conflicts / Constraints 요약

- SPEC C-1 ~ C-5 그대로 승계 (알림 첫 서버 · deploy 3파일 · iOS 조건 · 사용자 제스처 · notify.ts 별개 · About 안 배치).
- `CLAUDE.md` 훅 목록은 Phase 7 에서 `data-push-*` 를 추가한다. 기존 규약(색 · 아이콘+라벨 · 44px · 접기는 CSS) 은 그대로 지킨다.
- 도메인 계층 · AppState 봉투 · 스키마 v4 는 이번에 손대지 않는다 (NFR-34, ADR-36).
- 서버 코드 표기 규약: `server/` 하위는 `src/` 규약과 분리. TypeScript · plain Node 실행. import 는 `.ts` 확장자 유지 (도메인과 같은 방식, ADR-27 예외 원칙 답습).
