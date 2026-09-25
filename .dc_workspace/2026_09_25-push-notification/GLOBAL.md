# bigsix SPEC4 — Global Documentation (운동일 푸시 알림)

**Target Version**: 0.3.0
**Work Type**: feature
**Source Issue**: https://github.com/U-lis/bigsix/issues/6
**Base Branch**: `main` (`dc84f1e`)
**Working Branch**: `feature/push-notification` (HEAD `2f97f2f`)
**Worktree**: `/home/ulismoon/Documents/bigsix-feature-push-notification`
**SOT**: 같은 디렉터리의 `SPEC.md` (SPEC4) — 본 문서와 어긋나면 SPEC 이 이긴다.
**선행 SPEC/GLOBAL 승계**:
- `.dc_workspace/2026_09_03-program-session/GLOBAL.md` — 엔진 ADR-1~7
- `.dc_workspace/2026_09_04-ui/GLOBAL.md` — UI 1차 ADR-8~14
- `.dc_workspace/2026_09_05-ui-2/GLOBAL.md` — UI 2차 ADR-15~19
- `.dc_workspace/2026_09_18-history-export/GLOBAL.md` — SPEC3 ADR-20~28
- 이번은 **ADR-29 부터** 잇는다.

---

## Feature Overview

SPEC4 「Overview」 그대로 잇는다.

1. **볼 계기가 없다** — 앱을 열지 않으면 오늘 운동일인지 모른다.
2. **웹은 앱이 닫혀 있는 상태에서 정해진 시각에 실행할 방법이 없다** — `setTimeout`, SW 타이머, Periodic Background Sync, `TimestampTrigger` 는 각각 스로틀·종료·간격 미보장·개발 중단 이유로 부적합.
3. **외부에서 깨워야 한다** — 실질적으로 Web Push 뿐. Firebase/FCM 불필요, VAPID 만으로 Chrome · Firefox · Safari(iOS 16.4+) 전부 동작.

**Solution 요지**
- **Phase 1** `generateSW` → `injectManifest` 전환. 커스텀 서비스워커 파일을 `src/pwa-sw.ts` 로 두고 프리캐시·SPA 라우팅을 코드로 재구성, 이 자리에 `push` · `notificationclick` 핸들러를 얹는다 (FR-31 · FR-38).
- **Phase 2** 서버 런타임 뼈대. Node.js 24 + native `http`. `POST /api/push/subscribe` · `DELETE /api/push/subscribe` 두 엔드포인트 (FR-36). 구독은 JSON 파일에 저장.
- **Phase 3** 발송 스케줄러. `web-push` 로 VAPID 서명 발송. 요일·시각·타임존 매칭, `(endpoint, 로컬날짜)` 중복 방지, 410/404 정리 (FR-37 · FR-38).
- **Phase 4** 배포 통합. `nginx` 프록시 · systemd 서비스·타이머 · `deploy/*.sh` 갱신 · VAPID 부트스트랩 (FR-39).
- **Phase 5** 앱 알림 설정 UI. About 모달 알림 섹션. 감지 유틸·룬 스토어·`bigsix.push` 저장 (FR-32 · UI-12~16).
- **Phase 6** 재등록 통합. 프로그램 선택 · 제안 승인 · 시각 변경의 단일 진입점 (`push.reregister`), EC-80 실패 표시 (FR-33).
- **Phase 7** 문서 갱신. README · CHANGELOG 0.3.0 · CLAUDE.md 훅 목록 · `deploy/README.md`.

---

## Architecture Decisions

1~4차의 ADR-1~28 을 승계하고, 이번 개정에서 새로 결정한 사항을 **ADR-29~37** 로 잇는다.

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

### ADR-31 — 구독 저장은 JSON 파일 하나 (`server/data/subscriptions.json`). SQLite 도입하지 않는다. (OQ-21)

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

## 데이터 모델 변경 (요약)

### (C.1) `bigsix.push` 봉투 (ADR-36, Phase 5)

ADR-36 의 `PushEnvelope` 그대로. `schemaVersion: 1`.

### (C.2) 서버 `subscriptions.json` (ADR-31, Phase 2)

ADR-31 의 스키마 그대로. `version: 1`.

### (C.3) `src/lib/data/vapid.ts` (Phase 5 신규)

```ts
/** VAPID 공개키 (base64url). server/scripts/vapid-init.mjs 가 표준 출력에 인쇄한 값을
 *  개발자가 이 상수에 붙여넣는다. 비밀키는 저장소에 오지 않는다 (ADR-33, NFR-32). */
export const VAPID_PUBLIC_KEY = 'BXXXXXXXX...';  // Phase 5 커밋 시점에 실제 값 삽입
```

### (C.4) `AppState` · 도메인 무변경

SPEC NFR-34 준수. `src/lib/domain/**` · `src/lib/ui/state/storage.ts` (AppState 봉투 부분) · 스키마 v4 는 이번에 손대지 않는다. `CURRENT_SCHEMA_VERSION === 4` 유지.

---

## 서버 API 상세 (Phase 2 · 3)

- **`POST /api/push/subscribe`** (FR-36.1):
  - 요청 파싱 → shape 검증 (`endpoint`, `keys.p256dh`, `keys.auth`, `programId`, `notifyAt`, `tz` 모두 string, `notifyAt` 은 `/^\d{2}:\d{2}$/`).
  - `programId` 는 `src/lib/data/progressions.json` 에 존재하는 id 만 허용 (아니면 400).
  - `tz` 는 `Intl.DateTimeFormat` 이 파싱 가능한지 검사 (아니면 400).
  - `subscriptions[endpoint]` 존재 여부로 `201` / `200` 분기.
  - `updatedAt` 갱신, 신규는 `createdAt` 도 설정.
- **`DELETE /api/push/subscribe`** (FR-36.2):
  - `endpoint` 만 받는다. 없어도 `204` (idempotent).
- 응답 헤더: `Content-Type: text/plain; charset=utf-8` (본문 없거나 오류 문자열).
- CORS 없음. `Access-Control-*` 헤더 미설정.
- 로깅: 각 요청은 `console.log(method, path, status)` — journald.

---

## 배포 통합 요약 (Phase 4)

- **`deploy/nginx/bigsix.conf`**: `/api/push/` 프록시 location 을 `server { listen 443 ssl http2; ... }` 블록 안 `location /` 위에 추가.
  ```
  location /api/push/ {
      proxy_pass http://127.0.0.1:8791/;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $remote_addr;
  }
  ```
  - **포트 확정: `8791`** — 홈서버에서 안 쓰이는 4자리 대. `8791` 은 `bigsix.siot-ieung.duckdns.org` 의 이니셜 유래 임의값. `server/src/config.ts` 의 기본값도 8791.
  - `proxy_pass` URL 끝의 `/` 로 `/api/push/subscribe` → `http://127.0.0.1:8791/subscribe` 로 rewrite 됨. 서버는 `/subscribe` 만 알면 된다.

- **`deploy/systemd/bigsix-api.service`** (Phase 4 신규, root 최초 1회 설치):
  ```
  [Unit]
  Description=bigsix push API
  After=network.target

  [Service]
  Type=simple
  User=ulismoon
  WorkingDirectory=/home/ulismoon/apps/bigsix
  ExecStart=/home/ulismoon/.nvm/versions/node/v24.x.x/bin/node --experimental-strip-types server/src/index.ts
  Restart=on-failure
  Environment=BIGSIX_PORT=8791
  Environment=BIGSIX_DATA_DIR=/home/ulismoon/apps/bigsix/server/data

  [Install]
  WantedBy=multi-user.target
  ```
  - Node 절대 경로는 배포 최초 1회 절차에서 `readlink -f $(which node)` 로 잡아 unit 파일을 채운다 (`deploy/README.md` 갱신).

- **`deploy/systemd/bigsix-scheduler.service` + `.timer`**:
  ```
  # bigsix-scheduler.service
  [Unit]
  Description=bigsix push scheduler tick

  [Service]
  Type=oneshot
  User=ulismoon
  WorkingDirectory=/home/ulismoon/apps/bigsix
  ExecStart=/home/ulismoon/.nvm/versions/node/v24.x.x/bin/node --experimental-strip-types server/src/scheduler.ts

  # bigsix-scheduler.timer
  [Unit]
  Description=bigsix push scheduler every minute

  [Timer]
  OnCalendar=*:0/1
  AccuracySec=15s
  Persistent=false

  [Install]
  WantedBy=timers.target
  ```

- **`deploy/remote.sh` 변경** (Phase 4):
  - `sync_repo` 이후 `pnpm install --frozen-lockfile` 는 그대로.
  - 추가: `server/` 하위의 `web-push` 설치 — `(cd server && npm install --omit=dev)` 를 서버에서 실행. `pnpm` 을 안 쓰는 이유는 `server/` 의 lockfile 도 pnpm 이면 workspace 취급되어 앱 빌드에 섞인다 — 분리 유지 목적. `server/package-lock.json` 는 커밋한다.
  - 추가: 빌드 후 `systemctl --user` 가 아니라 `sudo systemctl restart bigsix-api.service` — 하지만 sudo 를 필요하므로 최초 1회 세팅 시 `/etc/sudoers.d/bigsix-restart` 에 `ulismoon ALL=(root) NOPASSWD: /usr/bin/systemctl restart bigsix-api.service, /usr/bin/systemctl restart bigsix-scheduler.timer` 추가.
  - 새 CLI 모드: `REF=... REPO=... bash remote.sh server-install` — 서버 코드 install + systemd restart만 별도로 돌릴 수 있게. `tests/deploy/` 스타일에서 가짜 저장소로 이 흐름을 검증.

- **`deploy/deploy.sh` 변경**:
  - 배포 후 검증 단계 「응답 확인」에 `/api/push/subscribe` 도 추가. `OPTIONS` 는 서버가 구현하지 않으므로 잘못된 body 로 `POST` 를 보내 `400` 이 돌아오는 것을 확인 (200 이 아닌 4xx 이면 서버가 살아 있다는 뜻).
  - 프리캐시 대조는 그대로.

- **`deploy/README.md` 갱신**:
  - 「정적 파일뿐이라 서버 런타임은 없다」 문장 제거·재작성 (FR-39.1).
  - 「서버 런타임」 절 신설: 시작·중지·로그 확인 (`journalctl -u bigsix-api -f`).
  - 「VAPID 키 교체」 절 신설 (ADR-33).
  - 「최초 1회 설정」 에 systemd unit 3개 설치 + sudoers 편집 추가.

---

## Phase 목록 (총 7개, 전부 순차)

병렬 조건 검토:
- **파일 겹침**: Phase 2·3(서버) 은 `server/` 하위, Phase 5·6(UI) 은 `src/lib/ui/`, Phase 1(SW) 은 `src/pwa-sw.ts` + `vite.config.ts`. 겹치지 않는 파일들은 있으나…
- **런타임 의존**: Phase 5(UI 알림 설정) 가 실제로 subscribe 하려면 서버(Phase 2)·VAPID 공개키(Phase 4 배포 후) 가 필요. Phase 6(재등록) 은 Phase 5 스토어에 의존.
- **테스트 자원**: Phase 1 이 injectManifest 전환을 완료해야 Phase 5 의 SW 등록 흐름이 흔들리지 않음. 회귀 위험이 큰 Phase 1 을 먼저 마무리해야 이후 페이즈가 안심하고 SW 를 만진다.
- **결론**: 병렬 불이득. ADR-14 「개발자 1인 순차」 승계.

| # | 이름 | Status | 요지 | SPEC 참조 |
|---|---|---|---|---|
| 1 | injectManifest 전환 + 커스텀 SW | Complete | `vite.config.ts` 를 `injectManifest` 로 · `src/pwa-sw.ts` 신규 · precache/navigate/skipWaiting/clientsClaim 이관 · push/notificationclick 핸들러. 완료 기준에 프리캐시 전수 대조 포함 | FR-31, FR-38, NFR-30, RISK-1 |
| 2 | 서버 뼈대 + subscribe/unsubscribe API | Complete | `server/` 신설. `node:http` 로 두 엔드포인트. `subscriptions.json` 저장소. `tests/server/` 신설 | FR-36, ADR-29~31 |
| 3 | 스케줄러 + VAPID 발송 | Complete | `web-push` · `Intl.DateTimeFormat` 매칭 · dedup · 만료 정리. progressions.json 로더. CLI 진입점 | FR-37, ADR-32 |
| 4 | 배포 통합 + VAPID 부트스트랩 | Not Started | nginx location · systemd unit 3개 · `remote.sh`·`deploy.sh` 갱신 · `vapid-init.mjs` · `deploy/README.md` 갱신. `tests/deploy/` 서버-install 케이스 | FR-39, ADR-33 |
| 5 | 알림 설정 UI (About 알림 섹션) | Not Started | `pushSupport.ts` · `push.svelte.ts` · `bigsix.push` 저장 · About 섹션 · `vapid.ts` 공개키 상수 · `reset.ts` 갱신 · data-* 훅 | FR-32, UI-12~16, ADR-34·35 |
| 6 | 재등록 통합 (프로그램·제안·시각 후크) | Not Started | `push.reregister()` 단일 진입점. programs/+page.svelte · +page.svelte · About 시각 변경 후크. EC-80 표시 | FR-33, ADR-37 |
| 7 | 문서 갱신 | Not Started | README 알려진 한계 · CHANGELOG 0.3.0 · CLAUDE.md `data-push-*` 훅 · `deploy/README.md` (Phase 4 에서 이미 갱신됨 확인) | H-13 알려진 한계 |

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

---

## SPEC 지적 / 확인 사항

- **SPEC FR-31.1 직접 수정 완료**: SPEC 이 「세 값의 동작을 보존하는 것」으로 갱신되었다. `ignoreURLParametersMatching` · `navigateFallback` 을 SW 코드로 이관하는 방식은 GLOBAL ADR-35 에서 확정.

- **SPEC H-9 「서버가 progressions.json 사본을 갖는다」 해석**: 물리적 파일 사본이 아니라 「서버가 읽어서 in-memory 캐시로 갖는다」 로 확정 (ADR-30). 앱과 서버가 같은 소스 파일을 참조하므로 데이터 동기화 사고가 없다.

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
