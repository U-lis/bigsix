# bigsix 운동일 푸시 알림 — Specification (SPEC4)

**Target Version**: 0.3.0
**Work Type**: feature
**Source Issue**: https://github.com/U-lis/bigsix/issues/6
**Base Branch**: `main` (`dc84f1e`)
**Working Branch**: `feature/push-notification`
**Worktree**: `/home/ulismoon/Documents/bigsix-feature-push-notification`
**선행 SPEC**:
- `.dc_workspace/2026_09_04-ui/SPEC.md` (D-1~D-19)
- `.dc_workspace/2026_09_05-ui-2/SPEC.md` (E-1~E-15)
- `.dc_workspace/2026_09_18-history-export/SPEC.md` (FR-23~30, EC-59~73, OQ-18~19)

이 문서는 셋을 **대체하지 않고 잇는다.** D-1~D-19, E-1~E-15, FR-23~30, NFR, 알려진 한계는 전부 유효하다.

---

## Overview

**Purpose**
오늘이 운동일인지 알려면 앱을 열어봐야 한다. 열어볼 계기가 없어서 까먹는다.
사용자가 시각 하나를 설정해두면, 운동일에 그 시각에 푸시 알림이 온다.

**Problem**
앱이 닫힌 상태에서 정해진 시각에 코드를 실행할 방법이 웹에 없다.
`setTimeout`, Service Worker 타이머, Periodic Background Sync, `TimestampTrigger` 는
각각 스로틀·종료·간격 미보장·개발 중단 이유로 "오후 7시 정각" 을 맞출 수 없다.
따라서 앱을 깨워줄 외부 주체가 필요하고, 실질적으로 **Web Push** 뿐이다.

**Solution**
홈서버에 Web Push 발송 서버를 추가한다. 앱은 `{ programId, 시각, 타임존 }` 을 서버에 등록하고,
서버가 운동일 해당 시각에 구독자에게 발송한다. Firebase/FCM 은 불필요하다 — VAPID 만으로 Chrome ·
Firefox · Safari 전부 동작한다 (iOS 16.4+ 포함). 이 저장소의 **첫 서버 런타임**이다.

---

## 확정 사항 (사용자 결정, 2026-09-25)

| # | 항목 | 결정 |
|---|---|---|
| H-9 | 서버 보관 데이터 | 앱은 `{ programId, 시각, 타임존 }` 만 보낸다. 서버가 `progressions.json` 사본을 갖고 그날 요일로 종목명을 계산해 알림 본문을 만든다. 요일 집합도 종목표도 따로 보내지 않는다 — `programId` 하나로 파생된다 |
| H-10 | 알림 본문 | 「빅6 / 모범수 · 푸시업, 레그 레이즈」 형식. 단계 번호는 서버가 모르므로 포함하지 않는다 |
| H-11 | 타임존 | 기기 타임존을 등록 시 함께 보낸다 (`Intl.DateTimeFormat().resolvedOptions().timeZone`). 서버가 변환한다. 해외 이동해도 현지 시각 기준 |
| H-12 | 이미 운동을 마친 날 | 알림을 그냥 보낸다. 서버는 수행 여부를 모른다. 건너뛰려면 기록 일부를 서버에 올려야 하므로 하지 않는다 |
| H-13 | 홈서버 의존 | 감수한다. 서버가 꺼져 있으면 알림이 오지 않는다. README·CHANGELOG 에 알려진 한계로 명시한다 |

---

## Functional Requirements

### FR-31: 서비스워커 injectManifest 전환

현재 `vite.config.ts:25`의 `SvelteKitPWA` 는 `generateSW` 모드로 동작한다(명시적 `strategies` 없이
`workbox:` 키만 있으면 `generateSW` 가 기본이다). 이 모드에서는 커스텀 `push` · `notificationclick`
핸들러를 넣을 수 없다. `injectManifest` 모드로 전환한다.

- [ ] FR-31.1: `vite.config.ts` 의 `SvelteKitPWA` 설정을 `strategies: 'injectManifest'` 로 바꾼다.
      `workbox:` 키를 `injectManifest:` 로 교체한다. `globPatterns`, `ignoreURLParametersMatching`,
      `navigateFallback` 세 값은 그대로 유지한다 (`vite.config.ts:50-55` 현재 값).
- [ ] FR-31.2: 커스텀 서비스워커 파일을 새로 만든다. 파일 경로는 설계에서 정한다(OQ-25).
      이 파일은 다음 두 역할을 한다.
      (a) **기존 역할 보존** — `precacheAndRoute`, `cleanupOutdatedCaches`, `navigateFallback` 을
          workbox API 로 직접 호출해 현재 `generateSW` 가 생성하던 것과 같은 프리캐시·자동 갱신
          동작을 유지한다.
      (b) **새 역할** — `push` 이벤트 핸들러 (FR-38.1), `notificationclick` 이벤트 핸들러 (FR-38.2).
- [ ] FR-31.3: `sw.svelte.ts:41` 의 `controllerchange` 새로고침 동작이 전환 후에도 그대로여야 한다.
      `autoUpdate` (skipWaiting + clientsClaim) 방식은 바뀌지 않는다.
- [ ] FR-31.4: `pnpm check` 오류·경고 0, `pnpm test` 전부 통과, 배포 후 프리캐시 전수 대조가 통과해야 한다.

### FR-32: 알림 설정 (About 모달)

**배치 근거**: About 모달(`src/lib/ui/shell/About.svelte`)은 앱 수준 설정(업데이트 확인 · 전체 초기화)이
이미 모인 곳이다. 알림 켜기/끄기는 같은 성격의 앱 수준 설정이다. 기록 탭에 두면 맥락 불일치,
새 탭(5번째) 추가는 기능 하나를 위해 무겁다. 기존 `dialog` 진입점이 상단 바에 있어 접근성도 충분하다.

- [ ] FR-32.1: About 모달에 **「알림」 섹션**을 추가한다. 섹션 순서는 앱 정보 → 업데이트 확인 → **알림** → 초기화.
- [ ] FR-32.2: 알림 섹션에는 다음을 표시한다.
      (a) **현재 권한 상태** — `Notification.permission` 값을 문구로 표시: `default` → "아직 허용 안 함",
          `granted` → "허용됨", `denied` → "거부됨 (브라우저 설정에서 변경)".
      (b) **구독 상태** — 서버 등록 여부: "알림 켜져 있음" / "알림 꺼져 있음".
      (c) **알림 시각 선택** — `<input type="time">`. 분 단위. 구독 중일 때만 활성화.
      (d) **알림 켜기 버튼** 또는 **알림 끄기 버튼** (구독 상태에 따라 하나만 보인다).
- [ ] FR-32.3: 알림 켜기를 눌렀을 때 동작.
      (a) 권한이 `default` 면 `Notification.requestPermission()` 을 부른다. **앱 진입 시 자동으로 묻지 않는다** — 사용자 제스처에서만 요청한다.
      (b) 권한이 `granted` 면 곧바로 구독 등록을 진행한다 (FR-33.1).
      (c) 권한이 `denied` 면 버튼을 비활성화하고 브라우저 설정 안내 문구를 보여준다.
- [ ] FR-32.4: 브라우저가 `PushManager` 를 지원하지 않거나(EC-76), iOS 에서 홈 화면에 설치하지 않은 상태(EC-77)이면
      알림 섹션에 그 사실을 문구로 표시하고 켜기 버튼을 보이지 않는다. 빈 UI 를 두지 않는다.
- [ ] FR-32.5: 프로그램이 미선택 상태(EC-79)이면 켜기 버튼을 비활성화하고 "프로그램을 먼저 선택하세요" 를 표시한다.
- [ ] FR-32.6: 알림 설정 상태 (구독 등록 여부, 선택한 시각)는 `localStorage` 에 별도 키(`bigsix.push`)로 저장한다.
      `bigsix.state` (AppState) 에는 넣지 않는다 — 알림은 도메인 로직과 무관하다.

### FR-33: 구독 등록 · 해지 · 재등록

- [ ] FR-33.1: 구독 등록 흐름.
      (a) `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })` 를 부른다.
      (b) 반환된 `PushSubscription` 의 `endpoint`, `keys.p256dh`, `keys.auth` 와 함께
          `{ programId, notifyAt, tz }` 를 `POST /api/push/subscribe` 로 보낸다 (FR-36.1 요청 형식).
      (c) 서버 응답 201이면 성공. `bigsix.push` 에 구독 상태와 시각을 저장한다.
- [ ] FR-33.2: 구독 해지 흐름.
      (a) `DELETE /api/push/subscribe` 를 `{ endpoint }` 와 함께 보낸다 (FR-36.2 요청 형식).
      (b) 브라우저의 `PushSubscription.unsubscribe()` 를 부른다.
      (c) `bigsix.push` 를 초기화한다.
- [ ] FR-33.3: 재등록이 필요한 트리거. 다음 이벤트가 발생하면 구독이 켜져 있는 경우에 한해 자동으로 재등록한다.
      **기존 구독을 먼저 해지한 뒤 새 구독을 등록한다** — 서버에 같은 기기의 구독이 중복되지 않도록.
      (a) **프로그램 선택** — `routes/programs/+page.svelte:27` 의 `selectProgram` 호출 후.
          `programId` 가 바뀌면 서버의 종목 계산 결과가 달라지므로 재등록이 필요하다.
      (b) **전환 제안 승인** — `routes/+page.svelte:62` 의 `acceptProposal` 호출 후.
          `acceptProposal` 은 `switchProgram` 을 부르므로 `programId` 가 바뀐다.
      (c) **알림 시각 변경** — About 모달의 시각 선택기에서 `change` 이벤트가 발생할 때 즉시 `bigsix.push` 에 저장하고 재등록을 수행한다.
          모달을 닫기만 하면 저장되지 않는다 (EC-84). 별도 저장 버튼은 두지 않는다.
- [ ] FR-33.4: 재등록 실패(EC-80) 시 알림이 꺼진 상태로 되돌아가고 실패 사실을 About 모달에 표시한다.
      서버에 이미 보낸 이전 구독은 남아 있을 수 있다 — **다음 410/404 응답 때 서버가 정리한다** (FR-37.4).

### FR-34: 알림 본문 형식

서버가 생성한다. 앱이 본문 문자열을 직접 만들지 않는다.

- [ ] FR-34.1: **제목(title)**: `빅6`
- [ ] FR-34.2: **본문(body)**: `{프로그램 한국어명} · {그날 종목 한국어명 쉼표 구분}`.
      예: `모범수 · 푸시업, 레그 레이즈` (월요일 `good_behavior`).
      서버는 `progressions.json` 사본과 `programId`, 발송 시각의 요일(타임존 변환 후)로 계산한다.
      단계 번호·진행 상황은 포함하지 않는다.
- [ ] FR-34.3: **아이콘**: `/icon-192.png` (기존 PWA 아이콘을 재사용).
- [ ] FR-34.4: 발송 대상이 되는 요일 판정: `progressions.json` 의 `programs[].schedule` 에서
      해당 요일 배열이 비어 있지 않은 날만 발송한다. 빈 날(휴식일)에는 발송하지 않는다.

### FR-35: 알림 탭 동작

- [ ] FR-35.1: 알림을 탭하면 앱의 루트(`/`)를 열거나, 이미 열려 있으면 포커스한다.
- [ ] FR-35.2: 탭 시 앱이 닫혀 있으면 서비스워커가 `clients.openWindow('/')` 를 부른다.

### FR-36: 서버 API

**경로 접두사**: `/api/push/`
서버는 nginx 뒤에서 돌며, nginx 가 `/api/push/` 를 프록시한다 (FR-39.2).

- [ ] FR-36.1: `POST /api/push/subscribe` — 구독 등록/갱신.
  - **요청 Content-Type**: `application/json`
  - **요청 Body**:
    ```
    {
      "endpoint": "<PushSubscription endpoint URL>",
      "keys": {
        "p256dh": "<base64url>",
        "auth":   "<base64url>"
      },
      "programId":  "<string>",
      "notifyAt":   "<HH:MM>",
      "tz":         "<IANA timezone string>"
    }
    ```
  - **응답**: `201 Created` (신규) / `200 OK` (갱신). Body 없음.
  - **동작**: `endpoint` 가 이미 있으면 `programId · notifyAt · tz` 를 업데이트한다 (upsert).
- [ ] FR-36.2: `DELETE /api/push/subscribe` — 구독 해지.
  - **요청 Body**:
    ```
    { "endpoint": "<PushSubscription endpoint URL>" }
    ```
  - **응답**: `204 No Content`. `endpoint` 가 없어도 `204` 로 응답한다 (idempotent).
- [ ] FR-36.3: API 는 CORS 를 열지 않는다. 같은 origin(`bigsix.siot-ieung.duckdns.org`) 에서만 요청이 온다.
- [ ] FR-36.4: 요청 형태가 올바르지 않으면 `400 Bad Request` + 이유 문자열을 반환한다.

### FR-37: 발송 스케줄러

서버 내부 컴포넌트. 주기적으로 실행하며 조건에 맞는 구독에 푸시를 발송한다.

- [ ] FR-37.1: **실행 주기**: systemd timer 로 1분마다 실행한다.
- [ ] FR-37.2: **발송 조건**: `지금 요일 ∈ programId 의 운동 요일 && 지금 시각(타임존 변환 후) == notifyAt`.
      시각 비교는 분 단위(HH:MM)로 한다.
- [ ] FR-37.3: **중복 발송 방지**: 같은 `(endpoint, 날짜)` 에 대해 하루 한 번만 발송한다.
      발송 성공 시 `(endpoint, date)` 를 기록한다. 스케줄러가 같은 분에 두 번 실행돼도 두 번째는 건너뛴다.
      중복 방지 기록의 보존 기간은 설계에서 정한다 (OQ-22).
- [ ] FR-37.4: **만료 구독 정리**: push 발송 후 응답이 `410 Gone` 또는 `404 Not Found` 이면 해당 구독을
      저장소에서 즉시 삭제한다.
- [ ] FR-37.5: 발송에 사용하는 VAPID 비밀키는 환경 변수 또는 서버 로컬 파일로 공급한다.
      **저장소에 커밋하지 않는다.**

### FR-38: 서비스워커 push · notificationclick 핸들러

커스텀 서비스워커 파일에 추가한다 (FR-31.2).

- [ ] FR-38.1: `push` 이벤트 핸들러.
      (a) `event.data.json()` 으로 `{ title, body, icon }` 을 읽는다.
      (b) `self.registration.showNotification(title, { body, icon })` 을 부른다.
      (c) `waitUntil` 로 Promise 를 감싼다 — 알림이 표시되기 전 워커가 종료되지 않도록.
- [ ] FR-38.2: `notificationclick` 이벤트 핸들러.
      (a) `event.notification.close()` 를 먼저 부른다.
      (b) `clients.matchAll({ type: 'window', includeUncontrolled: true })` 로 열려 있는 창을 찾는다.
      (c) 같은 origin 의 창이 있으면 `focus()`, 없으면 `clients.openWindow('/')`.

### FR-39: 배포 변경

- [ ] FR-39.1: `deploy/README.md` 의 "정적 파일뿐이라 서버 런타임은 없다" 문장을 수정한다.
      새 서버 런타임의 시작·중지·로그 확인 방법을 추가한다.
- [ ] FR-39.2: `deploy/nginx/bigsix.conf` 에 `/api/push/` 프록시 location 을 추가한다.
      서버 포트는 설계에서 정한다 (OQ-20).
      ```
      location /api/push/ {
          proxy_pass http://127.0.0.1:<PORT>/;
          proxy_set_header Host $host;
      }
      ```
- [ ] FR-39.3: `deploy/remote.sh` 에 API 서버 시작/재시작 단계를 추가한다.
- [ ] FR-39.4: `deploy/deploy.sh` 의 배포 후 검증에 `/api/push/subscribe` OPTIONS 또는 HEAD 로
      API 서버가 응답하는지 확인하는 단계를 추가한다.
- [ ] FR-39.5: VAPID 키 쌍 생성 절차를 `deploy/README.md` 에 기록한다. 공개키는 앱 빌드 시
      환경 변수 또는 `vite.config.ts` 상수로 주입하고, 비밀키는 서버 환경 변수로만 공급한다.

---

## Non-Functional Requirements

- [ ] NFR-29: 1~3차 NFR 전부 유효. 특히 **NFR-2 표시 원칙** (사실만, 백분율·격려 금지),
      **NFR-3 도메인 순수성** (알림 설정은 도메인에 들어가지 않는다), **NFR-4 단방향 의존**.
- [ ] NFR-30: **generateSW → injectManifest 전환 시 기존 동작 보존**. 전환 후에도 다음이 그대로여야 한다.
      (a) `globPatterns` 에 `json` 포함 → 오프라인에서 progressions.json 로드 가능.
      (b) `ignoreURLParametersMatching: [/.*/]` → 쿼리 파라미터 있는 URL 도 프리캐시 히트.
      (c) `navigateFallback: '/'` → SPA 라우팅에서 404 미발생.
      (d) `controllerchange` 새로고침 (`sw.svelte.ts:41`) → 자동 갱신 시 화면이 새로고침됨.
      **이 전환이 이번 작업에서 회귀 위험이 가장 큰 지점이다.** 배포 후 프리캐시 전수 대조(`deploy/deploy.sh`)가 반드시 통과해야 한다.
- [ ] NFR-31: **서버로 나가는 데이터는 `{ programId, notifyAt, tz }` 와 브라우저 발급 구독 정보뿐이다.**
      운동 기록·AppState 는 기기에 남는다.
- [ ] NFR-32: VAPID 비밀키는 저장소에 커밋하지 않는다. `.gitignore` 또는 서버 전용 파일로 관리한다.
- [ ] NFR-33: `pnpm check` 오류·경고 0, `pnpm test` 전부 통과를 각 커밋에서 유지.
      기준선: SPEC3 기준 657개 (이번에 추가되는 알림 관련 테스트 포함).
- [ ] NFR-34 (도메인 순수성 유지): `src/lib/domain/**` 은 이번 작업에서 수정하지 않는다.
      알림 로직은 `src/lib/ui/` 아래 새 파일(설계에서 경로 정함)에 둔다.

---

## Constraints

- 이 저장소의 **첫 서버 런타임**이다. `deploy/README.md:3` 의 "정적 파일뿐이라 서버 런타임은 없다"
  전제가 이번 작업에서 바뀐다.
- `deploy/deploy.sh`, `deploy/remote.sh`, `deploy/nginx/bigsix.conf` 가 함께 바뀐다.
- iOS 는 **홈 화면에 설치된 PWA 여야 동작한다** (iOS 16.4+). Safari 탭에서는 `PushManager` 에
  접근 불가. 미설치 상태를 감지해 안내 문구를 보여야 한다.
- **알림 권한은 사용자 제스처에서만 요청한다.** 앱 진입 즉시 묻지 않는다.
- 기존 `src/lib/ui/session/notify.ts` 는 세션 중 타이머용(소리·진동·점멸)이다.
  이 기능과 **별개**다. 혼동하거나 합치지 않는다.
- 새 탭을 추가하지 않는다. About 모달 안에 알림 설정을 둔다.
- SvelteKit 2 + Svelte 5 룬 + adapter-static. 알림 관련 npm 의존성은 `web-push` (서버만).
  클라이언트는 브라우저 내장 `PushManager` API 를 쓴다.

---

## 화면 설계

cube-study CONVENTIONS 준용 (CLAUDE.md 「화면을 만들거나 고칠 때」).

- [ ] UI-12 About 모달의 알림 섹션은 기존 `<dl>` · `<button>` 패턴을 따른다 (About.svelte 기존 구조).
      권한 상태는 `<dt>권한</dt><dd data-push-permission={permission}>{문구}</dd>` 형식.
- [ ] UI-13 알림 켜기/끄기 버튼은 글자 라벨이 함께 선다. 아이콘만 있는 버튼은 두지 않는다 (CLAUDE.md).
- [ ] UI-14 시각 선택기(`<input type="time">`)는 구독 중일 때만 활성화한다. 비활성 상태임을 시각적으로 구분한다.
- [ ] UI-15 `data-*` 훅: `data-push-permission`, `data-push-status`, `data-push-notify-at`,
      `data-push-enable`, `data-push-disable` 등 `data-push-{역할}` 규약으로 추가하고 `CLAUDE.md` 의 훅 목록에 더한다.
- [ ] UI-16 iOS 미설치 안내 (EC-77): "홈 화면에 추가 후 이 기능을 쓸 수 있습니다" 한 줄. 설치 방법으로
      가는 링크나 `src/lib/ui/shell/install.svelte.ts` 의 설치 안내 연동을 설계에서 결정한다 (OQ-24).

---

## Analysis Results

### Related Code

| 무엇 | 위치 | 쓰임 |
|---|---|---|
| PWA 설정 (현재 generateSW) | `vite.config.ts:25-57` | FR-31 전환 대상 |
| 서비스워커 등록·갱신 | `src/lib/ui/shell/sw.svelte.ts:36-102` | FR-31.3 보존 대상. `controllerchange` 새로고침: `:41`. 직접 등록: `:54` |
| About 모달 | `src/lib/ui/shell/About.svelte` | FR-32 섹션 추가 위치 |
| layout About 열기 | `src/routes/+layout.svelte:64` | 알림 설정 진입점. 별도 버튼 추가 불필요 |
| 프로그램 선택 | `src/routes/programs/+page.svelte:27` | FR-33.3(a) 재등록 트리거 |
| 제안 승인 | `src/routes/+page.svelte:62` | FR-33.3(b) 재등록 트리거 |
| 프로그램 스케줄 | `src/lib/data/progressions.json:1703,1738,1782,1829,1920` | FR-34.2 서버 사본 근거 |
| nginx 설정 | `deploy/nginx/bigsix.conf` | FR-39.2 프록시 location 추가 |
| 배포 스크립트 | `deploy/deploy.sh`, `deploy/remote.sh` | FR-39.3~39.4 |
| deploy README | `deploy/README.md:3` | FR-39.1 수정 대상 |
| 세션 알림(별개) | `src/lib/ui/session/notify.ts` | 이번 작업과 무관. 혼동 주의 |
| iOS 설치 안내 (별개) | `src/lib/ui/shell/install.svelte.ts` | `beforeinstallprompt` 기반 Chrome/Android 전용. iOS standalone 감지 불가 — UI-16 의 iOS 안내와 직접 연동 여부는 설계에서 정함 (OQ-24) |

### programId 값 (progressions.json:1695 이후)

| programId | 한국어명 | 운동 요일 |
|---|---|---|
| `new_blood` | 신참 | 월 · 목 |
| `good_behavior` | 모범수 | 월 · 수 · 금 |
| `veterano` | 베테랑 | 월 · 화 · 수 · 목 · 금 · 토 |
| `solitary_confinement` | 독방 감금 | 월 · 화 · 수 · 목 · 금 · 토 |
| `supermax` | 슈퍼맥스 | 월 · 화 · 수 · 목 · 금 · 토 |

(일요일 배열이 모든 프로그램에서 비어 있다)

### iOS PushManager 감지 방법

Safari 탭과 설치된 PWA 를 구분하는 직접적인 API 는 없다. 실용적 판정:
- `navigator.standalone === true` (iOS Safari 전용) → 설치된 PWA
- `window.matchMedia('(display-mode: standalone)').matches` → 설치된 PWA (크로스 플랫폼)
- 두 조건 모두 false + iOS 로 판단 → 설치 안 된 상태

iOS 판정은 UA 파싱에 의존하므로 완벽하지 않다. **안전하게**: `'PushManager' in window` 가 false 이면
브라우저 미지원·iOS 미설치 중 하나임을 안내하고 두 경우를 구분할 수 있으면 더 구체적으로 표시한다.

---

## Edge Cases

| # | 상황 | 요구되는 동작 |
|---|---|---|
| EC-74 | 알림 권한 거부 (`Notification.permission === 'denied'`) | 켜기 버튼을 비활성화. "브라우저 설정에서 변경하세요" 문구 표시. 다시 묻지 않는다 |
| EC-75 | 구독 중에 사용자가 브라우저 설정에서 권한을 철회 | 다음에 About 모달을 열 때 권한 상태를 다시 읽어 표시한다. 기존 구독 데이터는 `bigsix.push` 에 남지만 알림이 전달되지 않는다. 권한 상태에 따라 UI 가 "거부됨" 으로 갱신된다 |
| EC-76 | 브라우저가 `PushManager` 를 지원하지 않음 | `'PushManager' in window` 가 false. 알림 섹션에 "이 브라우저는 푸시 알림을 지원하지 않습니다" 표시. 켜기 버튼 없음 |
| EC-77 | iOS 에서 Safari 탭(홈 화면 미설치) 상태 | `PushManager` 접근 불가. "홈 화면에 추가 후 이 기능을 쓸 수 있습니다" 안내. 켜기 버튼 없음 |
| EC-78 | push 발송 후 서버가 `410 Gone` 또는 `404 Not Found` 응답을 받음 | 스케줄러가 해당 구독을 저장소에서 즉시 삭제 (FR-37.4). 다음 발송 목록에서 빠진다 |
| EC-79 | 프로그램 미선택 상태에서 알림 켜기 시도 | 켜기 버튼 비활성화. "프로그램을 먼저 선택하세요" 표시 (FR-32.5). `programId` 없이 서버에 등록하지 않는다 |
| EC-80 | 프로그램 전환 후 재등록 실패 (서버 도달 불가 등) | 알림이 꺼진 상태로 돌아간다. About 모달에 실패 사실 표시 (FR-33.4) |
| EC-81 | 서버 도달 불가 (홈서버 꺼짐, 네트워크 단절) | 구독 등록·해지 요청 실패 → EC-80 흐름. 이미 등록된 구독에서는 서버가 꺼진 동안 알림이 오지 않는다. 알려진 한계 (H-13) |
| EC-82 | 같은 기기에서 구독 등록을 두 번 시도 | 브라우저 `PushSubscription` 의 `endpoint` 가 같으므로 서버가 upsert 처리한다 (FR-36.1). 중복 구독이 생기지 않는다 |
| EC-83 | 휴식일(일요일 등 schedule 배열이 빈 날) | 스케줄러가 발송 조건 `운동 요일 판정` 에서 걸러낸다 (FR-37.2). 발송하지 않는다 |
| EC-84 | 알림 시각을 변경하는 도중 About 모달을 닫음 | 저장되지 않은 시각 변경은 버린다. 마지막으로 저장된 시각이 유효하다 |
| EC-85 | 앱 삭제·재설치 후 새 구독 등록 | 브라우저가 새 `PushSubscription` (새 endpoint)을 발급한다. 이전 endpoint 는 서버에 남아 있다. 서버가 이전 endpoint 에 발송 시도 → `410` → 정리 (FR-37.4). 새 구독으로 발송이 이어진다 |

---

## Out of Scope

이슈 #6 에 명시된 것:
- 알림에서 바로 기록하기 (Notification Action)
- 여러 알림 시각
- 종목별 개별 알림
- 미수행일 사후 알림 ("어제 빠졌습니다")
- 알림 기록·통계

추가:
- 서버 푸시 외 채널 (이메일, 카카오 등)
- 다른 사용자를 위한 멀티 유저 지원
- 알림 내용 커스터마이징 (메시지 직접 입력)

---

## Open Questions

| # | 질문 | 메모 | 상태 |
|---|---|---|---|
| OQ-20 | 서버 런타임 언어/프레임워크 | Node.js(`web-push` npm), Deno, Python(FastAPI), Go 중 선택. `web-push` 라이브러리 생태계 성숙도와 기존 서버(Node nvm 24)의 런타임 재사용을 고려하면 Node.js 가 자연스럽다. | 설계에서 결정 |
| OQ-21 | 구독 저장 형식 | SQLite (better-sqlite3) vs JSON 파일. 구독 수가 단일 사용자(기기 1~3개) 규모면 JSON 파일로 충분하다. 스케줄러의 중복 방지 기록도 같은 저장소를 공유한다. | 설계에서 결정 |
| OQ-22 | 스케줄러 중복 방지 구현 | `(endpoint, date)` 발송 기록을 저장소에 남기는 방법과 보존 기간(예: 7일 후 자동 삭제). systemd timer 재실행 간격(1분)에서 타임존 경계(자정 직후) 처리. | 설계에서 결정 |
| OQ-23 | VAPID 키 배포 방법 | 비밀키는 서버 로컬 파일 또는 환경 변수. `deploy/remote.sh` 에서 최초 1회 생성 후 서버에 남기는 방식이 단순하다. 공개키는 `vite.config.ts` 에 상수로 박는다(저장소 커밋 가능). 키 교체 절차도 문서화 필요. | 설계에서 결정 |
| OQ-24 | iOS 미설치 안내와 install.svelte.ts 연동 | `src/lib/ui/shell/install.svelte.ts` 가 이미 설치 상태를 추적한다. 알림 섹션에서 이 상태를 읽어 "홈 화면에 추가하세요" 안내에 연결할 수 있다. | 설계에서 결정 |
| OQ-25 | 커스텀 서비스워커 파일 경로 | `src/service-worker.ts` (vite-pwa/sveltekit 기본) vs `src/sw.ts` 등. SvelteKit + vite-pwa 의 `injectManifest` 에서 권장하는 위치와 `srcDir`·`filename` 설정값. | 설계에서 결정 |

---

## References

- `.dc_workspace/2026_09_04-ui/SPEC.md` · `GLOBAL.md` — 1차
- `.dc_workspace/2026_09_05-ui-2/SPEC.md` · `GLOBAL.md` — 2차
- `.dc_workspace/2026_09_18-history-export/SPEC.md` · `GLOBAL.md` — 3차
- `deploy/README.md` — 홈서버 배포 절차
- `deploy/nginx/bigsix.conf` — nginx 설정
- `vite.config.ts:25-57` — 현재 PWA 설정 (generateSW)
- `src/lib/ui/shell/sw.svelte.ts` — 서비스워커 등록·갱신
- `src/lib/ui/shell/About.svelte` — About 모달 (알림 섹션 추가 위치)
- `src/lib/data/progressions.json:1695` — programs[].schedule
- GitHub 이슈 #6 — 배경·대안 검토·기술 근거
- [Chrome for Developers — Web Push Interoperability Wins](https://developer.chrome.com/blog/web-push-interop-wins)
- [MDN — PushManager](https://developer.mozilla.org/en-US/docs/Web/API/PushManager)
- [web-push (npm)](https://www.npmjs.com/package/web-push)
- RFC 8030 (Web Push Protocol) · RFC 8291 (암호화) · RFC 8292 (VAPID)
