# bigsix 운동일 푸시 알림 — Specification (SPEC4)

**Target Version**: 0.3.0
**Work Type**: feature
**Source Issue**: https://github.com/U-lis/bigsix/issues/6
**Base Branch**: `main` (`dc84f1e`)
**Working Branch**: `feature/push-notification` (HEAD `cb56ef1`)
**Worktree**: `/home/ulismoon/Documents/bigsix-feature-push-notification`
**개정 이력**:
- 2026-09-25 초안 (bigsix 전용 · `programId` 계약)
- 2026-09-26 개정 A — 서버를 **범용 릴레이**로 전환. 앱은 데이터, 플랫폼 코드는 하나. `programId` · `progressions.json` 참조 제거, `app` · `title` · `bodyByDay` 도입. 재작업은 **Phase 3.5** 로 처리. H-14~H-16, GLOBAL ADR-38~40.
- **2026-09-26 개정 B** — 릴레이 경계를 한 번 더 조인다. 릴레이는 **구독 보관소 + 서명 발송기** 뿐이다 — 스케줄을 모른다, cron 도 타이머도 없다. 「언제·무엇을」은 각 앱의 cron 몫. 새 API 셋: `POST /subscribe`(meta 를 불투명 JSON 으로 받아 저장), `DELETE /subscribe`, `GET /subscriptions?app=X`, `POST /send`(dedupKey 로 중복 억제). `bodyByDay` 는 사라지고 bigsix cron 이 시점 계산·본문 조립·발송을 담당한다. 릴레이 코드는 일단 이 저장소 안에 두되 범용 형태를 유지한다. H-17~H-18, FR-44~48, EC-91~93, GLOBAL ADR-38 재작성 · ADR-41~42 신규.
- **2026-09-28 개정 C** — 릴레이를 나중에 떼어내기 좋게 경계 세 곳을 더 조인다. (1) **공개 표면 축소**: 인터넷에 여는 것은 `/subscribe` 뿐이고, `/subscriptions`·`/send` 는 loopback 전용이다. 개정 B 는 인증 없이 이 둘을 공개 vhost 로 프록시해 「누구나 구독 목록을 읽고 임의 알림을 보낼 수 있는」 상태였다. (2) **릴레이 수명 분리**: 릴레이는 자기 체크아웃(`~/apps/push-relay`)·자기 데이터 디렉터리(`/var/lib/push-relay`)·자기 배포 명령을 갖는다. bigsix 배포가 릴레이를 재시작하지 않는다. (3) **불투명 payload**: `/send` 는 `title`·`body` 대신 앱이 정하는 `payload` JSON 을 받아 해석 없이 서명·발송한다. 알림 필드가 늘어도 릴레이를 고치지 않는다. H-19~H-21, FR-36.7·36.8, FR-39.2·39.3·39.7, FR-41.2, EC-94~96, GLOBAL ADR-43~45 신규.

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
홈서버에 Web Push **범용 릴레이 서버**를 추가한다. 이 릴레이의 책무는 두 가지뿐이다: (1) 앱이 넘긴 구독을 보관하고, (2) 앱이 「지금 이 endpoint 로 이 문자열을 보내라」고 부를 때 VAPID 서명해 발송한다. **릴레이는 스케줄을 모른다.** cron 도 타이머도 없다. 「언제 · 무엇을」은 각 앱의 cron 이 결정한다 (H-17). bigsix cron 은 systemd timer 로 1분 간격으로 돌며 `GET /api/push/subscriptions?app=bigsix` 로 구독 목록을 받아 각 기기의 로컬 `notifyAt` 이 지금인지 판정하고, 맞으면 `progressions.json` 으로 본문을 만들어 `POST /api/push/send` 를 부른다. 릴레이는 같은 홈서버의 여러 앱이 공유한다 (`cube.siot-ieung.duckdns.org` 등). Firebase/FCM 은 불필요 — VAPID 만으로 Chrome · Firefox · Safari(iOS 16.4+) 전부 동작. 이 저장소의 **첫 서버 런타임**이며, 새 앱이 늘어도 릴레이 코드에는 손대지 않는다 — 앱은 데이터, 스케줄은 앱 cron. 릴레이 코드는 일단 이 저장소 안에 살지만 범용 모양을 유지한다 (GLOBAL ADR-38 재작성).

---

## 확정 사항 (사용자 결정, 2026-09-25 초안 · 2026-09-26 개정)

| # | 항목 | 결정 |
|---|---|---|
| ~~H-9 (2026-09-25)~~ | 서버 보관 데이터 (구) | ~~앱은 `{ programId, 시각, 타임존 }` 만 보낸다. 서버가 `progressions.json` 사본을 갖고 그날 요일로 종목명을 계산해 알림 본문을 만든다.~~ **H-14 로 대체 (2026-09-26)** — 서버는 앱 도메인을 몰라야 하므로 `programId` · `progressions.json` 을 서버에서 뺀다. |
| H-9 (개정, 2026-09-26 B) | 서버로 나가는 데이터의 민감도 | **릴레이가 저장하는 것**: `app`, `endpoint`, `keys(p256dh·auth)`, `meta`(불투명 JSON — bigsix 의 경우 `{tz, notifyAt, programId}`), 타임스탬프. **릴레이가 발송 시 흘려 보내는 것**: 앱 cron 이 `/send` 로 넘긴 `title`·`body` 문자열 (VAPID 서명 후 브라우저 push 서비스로). 기록·단계·수행 여부는 여전히 서버에 가지 않는다. `programId` 가 `meta` 안에 들어가지만 릴레이는 이 값을 해석하지 않는다 — 앱 cron 이 자기가 읽으려고 얹은 라벨일 뿐이다. **바뀐 것**: 개정 A 에서 요구했던 「서버가 요일 판정한다」 를 폐기. 릴레이는 이제 요일도, 시각도, 타임존도 계산에 사용하지 않는다 (H-17). |
| H-10 | 알림 본문 형식 | 「(사용자 정의 제목) · (그날 종목 목록)」 형식. **단계 번호는 여전히 넣지 않는다** — 개정 B 에서 조립 시점이 「구독 등록」 에서 「cron 발송」 으로 옮겨졌지만 「본문에 단계 번호 없음」 은 그대로 유지 (bigsix cron `payload.buildBody` 가 지킨다). |
| H-11 | 타임존 | 기기 타임존을 등록 시 함께 보낸다 (`Intl.DateTimeFormat().resolvedOptions().timeZone`). 서버가 변환한다. 해외 이동해도 현지 시각 기준. |
| H-12 | 이미 운동을 마친 날 | 알림을 그냥 보낸다. **서버는 수행 여부를 모른다** (개정 후에도 유지). 건너뛰려면 기록 일부를 서버에 올려야 하므로 하지 않는다. |
| H-13 | 홈서버 의존 | 감수한다. 서버가 꺼져 있으면 알림이 오지 않는다. README·CHANGELOG 에 알려진 한계로 명시한다. |
| ~~H-14 (2026-09-26 A)~~ | ~~범용 릴레이로 전환 — 서버가 tz 로 로컬 요일·시각 판정, dedup, 410/404 정리, 앱이 준 `bodyByDay` 를 그날 요일에 발송~~ | **H-17 로 대체 (2026-09-26 B)** — 릴레이가 「언제」를 아는 부분(요일·시각 판정 · 매 분 스케줄러) 이 사라진다. 「받아서 서명해 보낸다」만 남긴다. 매 분 판정은 앱 cron 몫. `bodyByDay` 개념도 없어진다 (앱이 발송 시점에 본문을 만든다). |
| **H-17** (2026-09-26 B) | **릴레이 = 구독 보관소 + 서명 발송기.** | 스케줄을 모른다. cron 도 타이머도 없다. **릴레이가 하는 일**: (1) `/subscribe` 로 받은 구독을 `(app, endpoint)` 키로 저장, `meta` 는 앱이 정하는 불투명 JSON 으로 그대로 보관, (2) `/send` 요청이 오면 저장된 keys 로 VAPID 서명해 발송, (3) 응답 410/404 이면 해당 구독을 지우고 그 사실을 응답에 담아 앱 cron 에 알린다, (4) `(app, endpoint, dedupKey)` 로 중복 억제 (dedupKey 문자열은 릴레이가 해석하지 않는다). **릴레이가 절대 하지 않는 일**: 시각·요일·타임존 판정 · 본문 조립 · 앱 도메인 지식. **「언제·무엇을」은 각 앱의 cron 이 정한다.** bigsix cron 은 신설(FR-47). 상세는 GLOBAL ADR-38 재작성. |
| **H-18** (2026-09-26 B) | **단일 운영자 전제.** | `app` 필드는 자기 신고 값이다. 서버는 화이트리스트를 두지 않고 형식만 검증한다 (FR-40). 이 릴레이는 **한 운영자가 자기 앱 여러 개를 굴리는 전제**로 설계됐지 멀티테넌트가 아니다. 남의 앱을 이 릴레이에 받으려면 별도 인증(앱별 토큰) 이 필요해진다 — 그 조건이 생기기 전까지는 배포하지 않는다. README·`deploy/README.md` 에 이 전제를 명시한다. |
| **H-15** (2026-09-26) | **앱 식별 (`app` 필드)** (유지) | 구독 body 에 `app: string` (짧은 식별자, 예 `"bigsix"`) 을 추가한다. `DELETE /subscribe` 는 `{ app, endpoint }` 를 함께 받아 한 앱이 다른 앱의 구독을 지우지 못하게 한다. `app` 은 저장·조회의 스코프이며 GET · /send 요청에도 필수. 형식은 자기 신고 (H-18). 상세 결정은 GLOBAL ADR-40. |
| **H-16** (2026-09-26) | **VAPID 는 앱 공유 키쌍 하나** (유지) | 홈서버 단일 운영자 · 세팅 원샷. 모든 앱이 같은 공개키·비밀키를 쓴다. **트레이드오프**: 이 키쌍을 회전(rotate)하면 **모든 앱의 기존 구독이 한꺼번에 무효화된다.** 각 앱의 사용자가 「알림 켜기」 를 다시 눌러 재구독해야 한다. README·`deploy/README.md` 에 이 사실을 명시한다. `app` 필드가 이미 있으므로 나중에 앱별 키로 바꿀 때 스키마 변경은 필요 없다 — VAPID 만 앱 스코프로 재구성하면 된다. 상세 결정은 GLOBAL ADR-39. |
| **H-19** (2026-09-28 C) | **공개 표면은 `/subscribe` 하나.** | 브라우저가 부르는 것은 `POST`·`DELETE /subscribe` 뿐이다. `GET /subscriptions` 와 `POST /send` 는 앱 cron 만 부르므로 **loopback 전용**으로 둔다. nginx 는 `/api/push/subscribe` 만 프록시하고 나머지 `/api/push/*` 는 404. 릴레이도 프록시를 거쳐 온 요청(`X-Forwarded-For` 있음)이 이 둘을 부르면 404 로 거절한다 — nginx 설정 실수에 대한 이중 잠금. 개정 B 의 「vhost 프록시가 유일한 경계」(FR-47.7) 는 그 vhost 가 공개라 경계가 아니었다. 상세 GLOBAL ADR-43. |
| **H-20** (2026-09-28 C) | **릴레이 수명은 bigsix 와 따로 간다.** | 코드는 이 저장소에 있지만 **실행은 별도 체크아웃** `~/apps/push-relay` 에서 하고, 데이터는 저장소 밖 `/var/lib/push-relay` 에 둔다. `deploy/deploy.sh` (bigsix) 는 릴레이를 재시작하지 않는다 — 릴레이 배포는 `deploy/relay-deploy.sh <ref>` 로 따로 한다. 앱이 늘어도 bigsix 배포가 다른 앱 알림을 끊지 않고, 나중에 별 저장소로 뽑을 때 체크아웃의 clone URL 만 바뀐다 (데이터 이전 없음). 상세 GLOBAL ADR-44. |
| **H-21** (2026-09-28 C) | **push payload 는 앱이 정하는 불투명 JSON.** | `/send` 는 `{ app, endpoint, payload, dedupKey? }` 를 받는다. 릴레이는 `payload` 가 JSON 객체이고 직렬화 크기가 상한 안인지만 보고, 그대로 서명·발송한다. 필드 해석은 각 앱의 서비스워커 몫이다. 누를 때 열 URL · `tag` · 아이콘 같은 필드가 필요해져도 앱 cron 과 앱 서비스워커만 바뀐다. `meta` 와 같은 원리. 상세 GLOBAL ADR-45. |

---

## Functional Requirements

### FR-31: 서비스워커 injectManifest 전환

현재 `vite.config.ts:25`의 `SvelteKitPWA` 는 `generateSW` 모드로 동작한다(명시적 `strategies` 없이
`workbox:` 키만 있으면 `generateSW` 가 기본이다). 이 모드에서는 커스텀 `push` · `notificationclick`
핸들러를 넣을 수 없다. `injectManifest` 모드로 전환한다.

- [ ] FR-31.1: `vite.config.ts` 의 `SvelteKitPWA` 설정을 `strategies: 'injectManifest'` 로 바꾼다.
      `workbox:` 키를 `injectManifest:` 로 교체한다. 요구는 **세 값의 동작을 보존하는 것**이지
      옵션 키를 그대로 두는 것이 아니다 — `injectManifest` 의 build-time 옵션은 `globPatterns`
      뿐이고, `ignoreURLParametersMatching` 과 `navigateFallback` 은 빌드 설정으로 받지 않는다.
      앞의 둘은 서비스워커 코드에서 workbox API 인자로 옮겨 **같은 행위**를 내야 한다 (FR-31.2).
      등가성은 프리캐시 전수 대조로 확인한다 (FR-31.4). 현재 값은 `vite.config.ts:50-55`.
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
- [ ] ~~FR-32.7 (2026-09-26 A)~~: ~~앱이 알림 본문을 조립한다. 서버는 도메인을 모르므로, 앱이 등록 시점에 `title` 과 `bodyByDay` 를 계산해 함께 보낸다.~~ **FR-47 로 대체 (2026-09-26 B)** — 본문 조립 시점이 「구독 등록 시」 가 아니라 「발송 시」 로 옮겨진다. 앱은 등록 시 **`meta` 만** 넘긴다 (`{ tz, notifyAt, programId }`). 그날의 요일·종목명 계산은 bigsix cron (FR-47) 이 발송 시점에 수행한다. 재등록 시 `bodyByDay` 를 다시 만들 필요도 없다 (매 발송이 최신 `progressions.json` · 최신 `programId` 를 다시 읽는다).
- [ ] **FR-32.7'** (2026-09-26 B, 대체): **앱이 서버에 보내는 것은 `meta` 뿐이다.** bigsix 는 `meta = { tz: "<IANA>", notifyAt: "<HH:MM>", programId: "<current>" }` 를 만들어 `POST /api/push/subscribe` body 에 넣는다. `meta` 는 릴레이에게 불투명하며, bigsix cron 이 `GET /api/push/subscriptions?app=bigsix` 로 이 값을 읽어 발송 시점 판정에 쓴다. 크기 상한은 FR-41. `meta` 스키마는 앱 몫이므로 이 SPEC 이 강제하지 않는다 — bigsix 형식은 GLOBAL ADR-38 재작성에 실어둔다.

### FR-33: 구독 등록 · 해지 · 재등록

- [ ] FR-33.1 (개정 2026-09-26 B): 구독 등록 흐름.
      (a) `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })` 를 부른다.
      (b) 반환된 `PushSubscription` 의 `endpoint`, `keys.p256dh`, `keys.auth` 와 함께
          `{ app: "bigsix", meta: { tz, notifyAt, programId } }` 를 `POST /api/push/subscribe` 로 보낸다 (FR-36.1 개정 요청 형식). ~~`{ notifyAt, tz, title, bodyByDay }`~~ 는 개정 A 계약이었다 — 이제는 `title`·`bodyByDay` 를 등록 시 넘기지 않는다 (FR-47 이 발송 시점에 만든다).
      (c) 서버 응답 201/200 이면 성공. `bigsix.push` 에 구독 상태와 시각을 저장한다.
- [ ] FR-33.2: 구독 해지 흐름.
      (a) `DELETE /api/push/subscribe` 를 `{ app, endpoint }` 와 함께 보낸다 (FR-36.2 요청 형식, FR-40 앱 스코프).
      (b) 브라우저의 `PushSubscription.unsubscribe()` 를 부른다.
      (c) `bigsix.push` 를 초기화한다.
- [ ] FR-33.3 (개정 2026-09-26 B): 재등록이 필요한 트리거. 다음 이벤트가 발생하면 구독이 켜져 있는 경우에 한해 자동으로 재등록한다.
      **기존 구독을 먼저 해지한 뒤 새 구독을 등록한다** — 서버에 같은 기기의 구독이 중복되지 않도록.
      (a) **프로그램 선택** — `routes/programs/+page.svelte:27` 의 `selectProgram` 호출 후. `meta.programId` 가 바뀌므로 재등록.
      (b) **프로그램 수동 전환** — `routes/programs/+page.svelte:39` 의 `switchProgram` 호출 후. (a) 와 별개의 자리이고 같은 파일 안에 있으므로 빠뜨리기 쉽다.
      (c) **전환 제안 승인** — `routes/+page.svelte:62` 의 `acceptProposal` 호출 후. `acceptProposal` 은 `switchProgram` 을 부르므로 `programId` 가 바뀐다.
      (d) **알림 시각 변경** — About 모달의 시각 선택기에서 `change` 이벤트가 발생할 때 즉시 `bigsix.push` 에 저장하고 재등록을 수행한다. 모달을 닫기만 하면 저장되지 않는다 (EC-84). 별도 저장 버튼은 두지 않는다.
      (e) ~~`bodyByDay` 값이 바뀌었을 때~~ → **개정 B 에서 해당 없음.** 본문 조립은 발송 시점에 cron 이 매번 다시 하므로 (FR-47), `progressions.json` 이 앱 배포로 바뀌기만 하면 다음 발송부터 반영된다. 재등록 사유가 아니다.
- [ ] FR-33.4: 재등록 실패(EC-80) 시 알림이 꺼진 상태로 되돌아가고 실패 사실을 About 모달에 표시한다.
      서버에 이미 보낸 이전 구독은 남아 있을 수 있다 — **다음 발송에서 릴레이가 410/404 를 받아 정리한다** (FR-44.3, 개정 B).

### FR-34: 알림 본문 형식 (개정 2026-09-26 B)

**개정 A** (폐기): 초안은 서버가 `progressions.json` 을 읽어 본문을 만들었다. 개정 A 는 앱이 구독 시 `bodyByDay` 를 만들어 보내면 서버가 그날 요일에 발송했다.
**개정 B**: 본문 조립은 **발송 시점에** 앱 cron(FR-47) 이 수행한다. cron 은 그 순간 `progressions.json` 을 읽어 title·body 를 만들고 `POST /api/push/send` 에 얹어 릴레이에 넘긴다. 릴레이는 이 두 문자열을 파싱·가공·저장하지 않는다 — 서명해 발송할 뿐.

**개정 C (2026-09-28)**: `title`·`body` 는 릴레이 계약이 아니라 **bigsix payload 의 필드**다. bigsix cron 이 `payload = { title, body }` 를 만들어 `/send` 에 넘기고, 릴레이는 이 객체를 해석하지 않는다 (H-21). 아래 FR-34.1·34.2 는 bigsix payload 규약으로 읽는다.

- [ ] FR-34.1 (유지): **제목(title)**: bigsix cron 이 `"빅6"` 로 만든다.
- [ ] FR-34.2 (개정 B): **본문(body)**: bigsix cron 이 `{ 프로그램 한국어명 } · { 종목1, 종목2, ... }` 형태로 만든다 (예: `모범수 · 푸시업, 레그 레이즈`). 계산은 앱 cron 안의 순수 함수(설계에서 위치 확정) 가 `progressions.json` + `meta.programId` + 로컬 요일로 수행. 단계 번호·진행 상황은 포함하지 않는다 (H-10).
- [ ] FR-34.3 (유지): **아이콘**: `/icon-192.png` (기존 PWA 아이콘 재사용). 서비스워커의 `push` 핸들러가 하드코딩한다 (FR-38.1) — 릴레이나 cron 이 아이콘을 넣지 않는다. 아이콘은 앱 자산이므로 앱마다 자기 서비스워커에서 정한다.
- [ ] ~~FR-34.4~~: ~~서버는 `sub.bodyByDay` 에 그 요일 키가 존재하는 요일만 발송한다.~~ **개정 B 에서 무효.** 요일 판정은 릴레이가 하지 않는다. bigsix cron 이 `sub.meta.programId` 로 `progressions.json` 을 조회하여 오늘 요일에 종목이 있는지 판정하고, 없으면 `/send` 를 부르지 않는다 (FR-47.3, EC-83).
- [ ] ~~FR-34.5 (개정 B): `POST /api/push/send` 요청 body 가 `{ app, endpoint, title, body, dedupKey? }`. 릴레이는 이 요청을 받아 `{ "title": "<request.title>", "body": "<request.body>" }` (두 필드) 를 push 페이로드로 만들어 발송한다.~~ **개정 C 로 대체.**
- [ ] **FR-34.5'** (개정 C): `POST /api/push/send` 요청 body 는 `{ app, endpoint, payload, dedupKey? }`. 릴레이는 `JSON.stringify(payload)` 를 그대로 push 페이로드로 서명·발송한다. bigsix 의 `payload` 는 `{ title, body }` 이고 크기는 bigsix cron 이 지킨다 (`title` ≤ 80자 · `body` ≤ 200자 — 알림 UI 실질 최대치). 서비스워커가 아이콘을 붙인다 (FR-38.1).

### FR-35: 알림 탭 동작

- [ ] FR-35.1: 알림을 탭하면 앱의 루트(`/`)를 열거나, 이미 열려 있으면 포커스한다.
- [ ] FR-35.2: 탭 시 앱이 닫혀 있으면 서비스워커가 `clients.openWindow('/')` 를 부른다.

### FR-36: 서버 API (개정 2026-09-26 B — 릴레이 계약 확정)

**경로 접두사**: `/api/push/`
서버는 nginx 뒤에서 돌며, nginx 가 `/api/push/` 를 프록시한다 (FR-39.2).
**릴레이는 네 개의 엔드포인트만 노출한다**: `/subscribe` (POST · DELETE), `/subscriptions` (GET), `/send` (POST). 스케줄러 엔드포인트 · 관리자 UI · 헬스체크는 없다 (있으면 나중에 별도 결정).
**개정 C**: 이 중 **공개(인터넷) 표면은 `/subscribe` 하나**다. `/subscriptions`·`/send` 는 loopback 전용이다 (H-19, FR-36.8). 아래 경로 표기 `/api/push/...` 는 공개 경로일 때의 이름이고, loopback 호출자는 접두사 없이 `http://127.0.0.1:8791/subscriptions` 처럼 부른다.

- [ ] FR-36.1 (개정 B): `POST /api/push/subscribe` — 구독 등록/갱신.
  - **요청 Body**:
    ```
    {
      "app":      "<short app id, 예: bigsix>",
      "endpoint": "<PushSubscription endpoint URL>",
      "keys":     { "p256dh": "<base64url>", "auth": "<base64url>" },
      "meta":     { ... 앱이 정하는 불투명 JSON ... }
    }
    ```
  - **응답**: `201 Created` (신규) / `200 OK` (갱신). Body 없음.
  - **동작**: `(app, endpoint)` 쌍이 이미 있으면 `keys · meta` 를 업데이트하고 `updatedAt` 갱신 (upsert). `endpoint` 만 같고 `app` 이 다르면 별개의 구독으로 취급.
  - **릴레이는 `meta` 를 파싱하지 않는다.** JSON 이라는 사실만 검증한다. 각 필드 크기 상한은 FR-41.
  - ~~`title`·`bodyByDay`·`notifyAt`·`tz` 는 이제 받지 않는다.~~ 개정 A 계약에 있던 필드들. bigsix 는 이 중 `tz`·`notifyAt`·`programId` 를 `meta` 에 얹어 보낸다. `title`·`bodyByDay` 는 발송 시점의 `/send` 요청 안으로 옮겨졌다 (FR-44).

- [ ] FR-36.2 (유지, 참고 갱신): `DELETE /api/push/subscribe` — 구독 해지.
  - **요청 Body**: `{ "app": "<short app id>", "endpoint": "<...>" }`.
  - **응답**: `204 No Content`. `(app, endpoint)` 쌍이 없어도 `204` (idempotent). `app` 이 다른 앱의 endpoint 를 삭제하려는 시도는 **저장소를 건드리지 않고 `204`** — 존재 정보 유출 방지 (EC-86, FR-40).

- [ ] **FR-36.6** (신규 2026-09-26 B): `GET /api/push/subscriptions?app=<id>` — 앱 스코프 구독 목록.
  - **응답**: `200 OK`, Content-Type `application/json`, body:
    ```
    [
      { "endpoint": "...", "meta": {...}, "createdAt": "...", "updatedAt": "..." },
      ...
    ]
    ```
  - **`keys` 필드는 응답에 포함하지 않는다** — 비밀. 나갈 이유가 없다 (발송은 릴레이 안에서 서명한다).
  - `app` 미지정 · 형식 실패 → `400`.
  - 존재하지 않는 `app` (구독 0개) → `200 []`.

- [ ] **FR-36.7** (신규 2026-09-26 B · 개정 C 로 요청 형식 변경): `POST /send` (loopback 전용) — 지정한 구독에 즉시 발송.
  - **요청 Body** (개정 C):
    ```
    {
      "app":       "<id>",
      "endpoint":  "<endpoint URL>",
      "payload":   { ... 앱이 정하는 불투명 JSON 객체 ... },
      "dedupKey":  "<불투명 문자열, 옵션>"
    }
    ```
    ~~`"title"`·`"body"` 최상위 필드~~ 는 개정 B 계약이었다 — 이제 `payload` 안에 앱이 원하는 모양으로 넣는다 (H-21). 최상위에 `title`·`body` 가 오면 `400 unknown-field:<name>`.
  - **동작**:
    1. `(app, endpoint)` 로 저장된 구독을 찾는다. 없으면 `404 subscription-not-found` (EC-92).
    2. `dedupKey` 가 있고 `(app, endpoint, dedupKey)` 가 이미 sentLog 에 있으면 **발송하지 않고** `200 {"status":"suppressed","reason":"dedup"}` (EC-91).
    3. 저장된 keys 로 VAPID 서명해 `JSON.stringify(payload)` 를 발송 (개정 C). 릴레이는 `payload` 안을 보지 않는다.
    4. 응답 정상 → sentLog 에 `(app, endpoint, dedupKey)` 기록 (8일 보존). `200 {"status":"sent"}`.
    5. 응답 410/404 → 저장소에서 그 구독 삭제, `200 {"status":"sent","deleted":true}` 로 호출자(앱 cron) 에게 알림 (FR-44.3).
  - **응답 코드 종합**: `200` 정상 흐름 (`status` 로 sent/suppressed 구분), `400` 요청 형식 오류, `404` 구독 없음, `502` 브라우저 push 서비스 응답 이상 (그 외 5xx).
  - `dedupKey` 문자열은 릴레이가 해석하지 않는다 — 앱이 정한다. bigsix cron 은 「해당 기기의 로컬 날짜(예: `2026-09-28`)」 를 넣어 하루 1회 발송을 보장한다.

- [ ] **FR-36.8** (신규 2026-09-28 C): **공개 표면 제한** (H-19).
  - nginx 는 `location = /api/push/subscribe` 만 릴레이로 프록시한다. 그 밖의 `/api/push/*` 는 nginx 가 `404` 로 끊는다.
  - 릴레이는 `127.0.0.1` 에만 바인드한다 (이미 그렇다 — `server/src/index.ts:83`).
  - 릴레이는 `X-Forwarded-For` 헤더가 붙은 요청(= 프록시를 거쳐 온 요청)이 `GET /subscriptions` 또는 `POST /send` 를 부르면 **`404 not-found`** 로 거절한다. 알 수 없는 경로와 같은 응답이라 존재 여부도 드러내지 않는다. 앱 cron 은 loopback 으로 직접 부르므로 이 헤더가 없다.
  - 이 두 겹 중 하나만 남아도 외부에서 `/send` 를 부를 수 없어야 한다 — 배포 검증(FR-39.4) 이 공개 경로로 두 엔드포인트가 404 인지 확인한다.
- [ ] FR-36.3 (유지): API 는 CORS 를 열지 않는다. 각 앱은 자기 vhost 로 프록시되므로 origin 이 앱마다 다르다.
- [ ] FR-36.4 (유지): 요청 형태가 올바르지 않으면 `400 Bad Request` + 이유 문자열.
- [ ] FR-36.5 (유지): 요청 body 크기 상한은 FR-41. 넘으면 `400`.

### ~~FR-37: 발송 스케줄러 (2026-09-26 A)~~ → 폐기

**개정 B (2026-09-26)** — 이 요구사항은 **전부 폐기**한다. 릴레이가 「언제 발송할지」 판정하는 부분(1분 timer · 시각·요일 매칭 · dedup · 만료 정리) 은 릴레이의 책임이 아니다 (H-17).

각 항목의 대체:
- ~~FR-37.1 실행 주기~~ → **FR-47.1** (bigsix cron systemd timer 1분).
- ~~FR-37.2 발송 조건 판정~~ → **FR-47.2** (앱 cron 이 tz·notifyAt 판정).
- ~~FR-37.3 dedup~~ → **FR-44.2** (릴레이가 `dedupKey` 로 억제, 8일 보존은 유지).
- ~~FR-37.4 만료 구독 정리~~ → **FR-44.3** (`/send` 응답 안에서 410/404 정리, 결과를 응답으로 반환).
- FR-37.5 VAPID 비밀키 정책 → **유지되어 FR-43 으로 이관** (변경 없음).
- ~~FR-37.6 페이로드 조립~~ → **FR-34.5 개정 B** (`/send` 요청의 title·body 를 그대로 페이로드로).

### FR-44 (신규 2026-09-26 B): 릴레이 `/send` 세부

- [ ] FR-44.1: **VAPID 서명**: 저장된 `sub.keys` 와 서버 로컬 VAPID 비밀키(FR-43) 로 서명. 앱 공유 키 (H-16).
- [ ] FR-44.2: **dedup**: `dedupKey` 가 없으면 dedup 검사 자체를 하지 않고 발송한다. 있으면 `(app, endpoint, dedupKey)` 를 sentLog 에서 찾는다. 이미 있으면 `200 {"status":"suppressed","reason":"dedup"}` 반환 (발송하지 않는다). 없으면 발송 후 기록. sentLog 는 8일보다 오래된 항목을 매 `/send` 처리 끝에 pruning (기존 ADR-32 방식 재사용).
- [ ] FR-44.3: **만료 정리**: 발송 응답 `410 Gone` 또는 `404 Not Found` 이면 그 `(app, endpoint)` 를 저장소에서 즉시 삭제하고 응답 body 에 `{"status":"sent","deleted":true}` 를 넣어 호출자(앱 cron) 에게 알린다. 앱 cron 은 이 신호로 자기 재시도 큐를 정리한다.
- [ ] FR-44.4: **로깅**: `/send` 요청은 `method path app endpoint-hash status` 만 남긴다. `payload`·`dedupKey` 값·전체 endpoint 는 로그에 찍지 않는다 (endpoint 는 비밀 토큰 · payload 는 사용자 문자열, 개정 C).
- [ ] FR-44.5: **릴레이는 재시도하지 않는다.** 발송이 5xx 로 실패하면 응답에 실패 사실을 담고 앱 cron 의 다음 tick 에 맡긴다. 릴레이가 재시도 큐를 갖는 순간 「스케줄러 없음」 원칙이 깨진다 (H-17).

**FR-45 · FR-46 은 비어 있다.** 개정 B 초안에서 잡았다가 `FR-36.6`·`FR-36.7` 소절로
흡수해 별도 번호가 필요 없어졌다. 빠진 것이 아니라 쓰지 않은 번호다 — 재사용하지 않는다.

### FR-47 (신규 2026-09-26 B): bigsix cron (앱 쪽 · 신설)

**위치**: 릴레이가 아니라 **bigsix 앱**의 cron. 이 저장소 안에 살고, systemd timer 로 홈서버에서 돈다. 릴레이와 같은 저장소·같은 배포 스크립트를 쓰지만 프로세스는 별개.

- [ ] FR-47.1: **실행 주기**: systemd timer 로 매 분. `bigsix-cron.timer` + `bigsix-cron.service` (oneshot). 폐기된 `bigsix-scheduler.timer` 자리를 대체한다 (Phase 4 개정).
- [ ] FR-47.2: **tick 로직**:
      1. `GET http://127.0.0.1:8791/subscriptions?app=bigsix` — **loopback 으로 직접 부른다** (개정 C, H-19). ~~프로덕션에서는 vhost 프록시 경로를 그대로 씀~~ 은 개정 B 문구였고, 공개 경로에서는 이 엔드포인트가 404 다 (FR-36.8).
      2. 각 구독의 `meta.tz` 로 로컬 `HH:MM` · 로컬 날짜 계산.
      3. 로컬 `HH:MM === meta.notifyAt` 이면 계속. 아니면 skip.
      4. `progressions.json` 을 로드해 `programs[meta.programId].schedule[요일]` 조회. 배열이 없거나 빈 배열이면 휴식일 → skip (EC-83).
      5. `payload = { title: "빅6", body: "{ program.name.ko } · {종목1, 종목2, ...}" }` 조립. 단계 번호 없음 (H-10). `title`·`body` 길이는 FR-34.5' 규약을 cron 이 지킨다.
      6. `POST http://127.0.0.1:8791/send { app: "bigsix", endpoint, payload, dedupKey: 로컬날짜 }` 호출 (개정 C).
      7. 릴레이 응답이 `{ deleted: true }` 이면 로그만 남긴다 (앱은 별도 재시도 큐가 없다 — 다음 tick 에 서브스크립션이 사라져 있을 것).
- [ ] FR-47.3: **휴식일 판정**: `progressions.json` 의 요일 배열이 비어 있으면 그 요일에 `/send` 를 부르지 않는다. 릴레이는 앱 도메인을 모르므로 이 판정을 하지 않는다.
- [ ] FR-47.4: **재시도 없음**: 이 cron 은 매 분 다시 돈다. 릴레이 응답이 5xx 여도 다음 tick 이 재시도 역할을 겸한다. dedupKey 가 하루 단위이므로 tick 안에 중복 발송 위험 없음 (FR-44.2).
- [ ] FR-47.5: **의존**: 앱 cron 코드는 서버 런타임 요구가 릴레이와 같다 (Node 24 + `node --experimental-strip-types`) — 하나의 `server/package.json` 을 공유해도 좋고, 별도 하위 디렉터리를 둬도 좋다. 설계에서 확정 (GLOBAL ADR-42).
- [ ] FR-47.6: **본문 조립 순수 함수**: `progressions.json` + `programId` + 로컬 요일 → `body` 문자열 계산은 순수 함수로 분리해 유닛 테스트한다 (CLAUDE.md 「순수 함수」 규약). 로컬 요일 판정은 FR-48 공용 모듈의 함수를 부른다.
- [ ] FR-47.7 (**릴레이 쪽 요구** — 성격상 FR-36 계열이지만 이 엔드포인트의 유일한 소비자가 cron 이라 여기 둔다): **`GET /subscriptions` · `POST /send` 인증**: 이 저장소에서는 인증을 두지 않는다 (H-18 단일 운영자 전제). **경계는 loopback 이다** (개정 C, H-19 · FR-36.8) — ~~vhost 프록시가 유일한 경계~~ 는 개정 B 문구였고 그 vhost 는 공개였다. 다른 호스트나 다른 저장소의 cron 이 이 릴레이를 붙일 때 앱별 토큰이 필요해진다.

### FR-48 (신규 2026-09-26 B): 공용 타임존 로컬 시각 판정 모듈

**의도**: 「지금이 이 기기의 로컬 `HH:MM` 인지, 로컬 날짜는 무엇인지」 는 앱 도메인과 무관하고 앱마다 똑같이 필요하다. 정책이 아니라 **라이브러리**로 뺀다 — 릴레이 코드에 넣지 말고, 각 앱 cron 이 import 하는 공용 모듈로.

- [ ] FR-48.1: **위치**: `server/lib/tz/localNow.ts` (또는 유사) — 릴레이 프로세스와 앱 cron 프로세스가 같은 저장소 안이므로 relative import 가 자연스럽다. 최종 경로는 GLOBAL ADR-42 에서 확정.
- [ ] FR-48.2: **API**:
      ```ts
      // 순수 함수. 인자로 받은 instant(Date) 를 tz 로 로컬화한다.
      localNowInTz(instant: Date, tz: string): { date: string /* YYYY-MM-DD */, hhmm: string /* HH:MM */, weekday: 'MO'|'TU'|...|'SU' }
      ```
- [ ] FR-48.3: **구현**: `Intl.DateTimeFormat('en-CA', { timeZone: tz, ... })` 로 파트 조회 (기존 ADR-32 방식 재사용). 유효하지 않은 tz 는 예외 (Intl 이 던진다).
- [ ] FR-48.4: **테스트**: 각 tz 별 · 자정 경계 · 서머타임 · 잘못된 tz. 앱 cron 이 이 모듈에 의존하므로 단위 테스트가 여기서 끝나면 앱 cron 테스트에서 tz 로직을 다시 안 짜도 된다.
- [ ] FR-48.5: **릴레이는 이 모듈을 import 하지 않는다.** 「릴레이는 스케줄을 모른다」 (H-17) 를 코드로 강제. 구조 테스트가 이 사실을 grep 으로 잡는다.

### FR-38: 서비스워커 push · notificationclick 핸들러

커스텀 서비스워커 파일에 추가한다 (FR-31.2).

- [ ] FR-38.1: `push` 이벤트 핸들러.
      (a) `event.data.json()` 으로 `{ title, body }` 를 읽는다. **서버는 아이콘을 보내지 않는다** — 아이콘은 앱 자산이므로 SW 가 고정값 `/icon-192.png` 를 붙인다 (FR-34.3, 개정 2026-09-26).
          **개정 C**: payload 는 이제 앱 cron 이 정하는 불투명 JSON 이고 릴레이는 모양을 보증하지 않는다. SW 는 payload 를 **해석하는 쪽**으로서 모양을 직접 확인한다 — JSON 이 아니거나 `title` 이 문자열이 아니면 `title = "빅6"`, `body = ""` 로 대체해 알림을 띄운다 (EC-96). `userVisibleOnly: true` 구독이라 push 를 받고 알림을 안 띄우면 브라우저가 대신 일반 알림을 띄우므로, 버리는 것보다 대체가 낫다. 알 수 없는 필드는 무시한다 — 뒤 호환을 위해서.
      (b) `self.registration.showNotification(title, { body, icon: '/icon-192.png' })` 을 부른다.
      (c) `waitUntil` 로 Promise 를 감싼다 — 알림이 표시되기 전 워커가 종료되지 않도록.
- [ ] FR-38.2: `notificationclick` 이벤트 핸들러.
      (a) `event.notification.close()` 를 먼저 부른다.
      (b) `clients.matchAll({ type: 'window', includeUncontrolled: true })` 로 열려 있는 창을 찾는다.
      (c) 같은 origin 의 창이 있으면 `focus()`, 없으면 `clients.openWindow('/')`.

### FR-40: 앱 식별 (2026-09-26, 개정 B 로 스코프 확장)

- [ ] FR-40.1: `app: string` 필드가 POST · DELETE 양쪽 body 에 필수. **개정 B: GET `?app=` · POST `/send` 양쪽 body 에도 필수.** `[a-z0-9][a-z0-9_-]{0,31}` 형식 (소문자·숫자·언더스코어·대시, 32자 이내, 앞자리는 알파벳 또는 숫자). 위반 시 `400 Bad Request`.
- [ ] FR-40.2: 저장 스코프는 `(app, endpoint)` 쌍. 같은 endpoint 라도 `app` 이 다르면 다른 레코드. sentLog 스코프는 `(app, endpoint, dedupKey)`.
- [ ] FR-40.3: `DELETE /subscribe` 는 `(app, endpoint)` 가 실제로 존재하는 경우에만 저장소에서 지운다. `app` 이 다르면 저장소를 건드리지 않고 `204` — 존재 정보를 유출하지 않는다 (EC-86). `POST /send` 도 마찬가지로 `(app, endpoint)` 가 일치할 때만 발송 대상으로 인정하고, 불일치이면 `404 subscription-not-found` (EC-92).
- [ ] FR-40.4: bigsix 앱은 항상 `app: "bigsix"` 를 보낸다. 다른 앱은 자기 식별자를 정한다 — 서버 코드에는 화이트리스트가 없다 (H-18 자기 신고).

### FR-41: 입력 크기 상한 (2026-09-26, 개정 B — 스코프 재조정)

릴레이가 앱이 준 문자열을 저장하거나 발송하므로 강제 상한이 필요하다. **개정 B: `bodyByDay` 가 사라지고 `meta`·`title`·`body`·`dedupKey` 로 분산**.

- [ ] FR-41.1: 요청 body 전체 크기 상한: `16 KiB`. 넘으면 `400 request-too-large`. `/subscribe`·`/send` 둘 다 적용.
- [ ] FR-41.2: 필드 최대 길이 (문자 수, JSON.stringify 후 바이트 아님):
      - `app`: 32
      - `endpoint`: 2048 (기존 SSRF 검사와 별개, URL 길이 상한)
      - `keys.p256dh` · `keys.auth`: 각 256
      - `meta` (JSON 을 stringify 한 크기): **1024** (개정 B — bigsix 는 `{tz, notifyAt, programId}` 로 ~80 자, 여유)
      - ~~`title` (`/send`): 80~~ · ~~`body` (`/send`): 200~~ — **개정 C 에서 릴레이 상한에서 제외.** 두 필드는 bigsix payload 규약이 되었고 bigsix cron 이 지킨다 (FR-34.5').
      - **`payload` (`/send`, 개정 C)**: 객체 (`null`·배열·원시값 아님). `JSON.stringify(payload)` 의 **UTF-8 바이트 수 ≤ 3072**. 문자 수가 아니라 바이트인 이유: Web Push 레코드 상한(4096 바이트, 암호화 오버헤드 제외 실질 약 3993) 이 바이트 기준이다. 위반 시 `400 payload-invalid` / `400 payload-too-large`
      - `dedupKey` (`/send`): **64** (앱이 정하는 라벨. bigsix 는 로컬 날짜 10자)
- [ ] ~~FR-41.3~~: ~~`bodyByDay` 항목 수 상한: `7`.~~ **개정 B 에서 무효** — `bodyByDay` 자체가 없어졌다.
- [ ] FR-41.4 (유지): 모든 길이·크기 위반은 사유 문자열과 함께 `400`. 사유 문자열은 필드명을 포함한다 (`title-too-long`, `meta-too-long` 등).

### ~~FR-42: `bodyByDay` 스키마 검증 (2026-09-26 A)~~ → 폐기

**개정 B (2026-09-26)** — `bodyByDay` 개념 자체가 사라졌다. 릴레이는 `meta` 를 파싱하지 않는다.

- ~~FR-42.1~~ ~ ~~FR-42.4~~: 폐기. 대체 요구사항은 FR-36.1 (`meta` 는 JSON 이라는 사실만 검증) · FR-41.2 (`meta` 크기 상한).
- 앱 도메인의 `programId`·요일 논리는 이제 bigsix cron 안에서 검증한다 (FR-47.2, `progressions.json` 조회 실패 시 그 cron 이 처리 · 릴레이에 도달하지 않는다).

### FR-43: VAPID 키 · 공유 정책 (개정 2026-09-26)

- [ ] FR-43.1: 모든 앱이 같은 VAPID 키쌍을 공유한다 (H-16). 서버는 한 벌만 로드한다. 앱 스코프별 키 파일을 두지 않는다.
- [ ] FR-43.2: 키 회전 절차는 `deploy/README.md` 「VAPID 키 교체」 절 (GLOBAL ADR-33) 그대로. **다만 회전 시 모든 앱의 기존 구독이 무효화된다** 는 사실을 이 절에 명시한다. bigsix README 「알려진 한계」 에도 한 줄 넣는다 (Phase 7).

### FR-39: 배포 변경 (개정 2026-09-26 B — unit 이름·개수 재조정)

**개정 B**: systemd unit 구성이 바뀐다.
- 릴레이 API 서비스: **`push-relay-api.service`** (개정 A 의 `bigsix-api.service` 이름을 범용화 — 이 서비스는 bigsix 전용이 아니라 릴레이).
- ~~`bigsix-scheduler.service` + `.timer`~~ → 폐기. 대체로:
- **bigsix cron**: `bigsix-cron.service` (oneshot) + `bigsix-cron.timer` (매 분). 이것이 「앱 스케줄러」 다 (FR-47).

- [ ] FR-39.1: `deploy/README.md` 의 "정적 파일뿐이라 서버 런타임은 없다" 문장을 수정한다. 새 서버 런타임(릴레이 API + bigsix cron) 의 시작·중지·로그 확인 방법을 추가한다.
- [ ] ~~FR-39.2: `deploy/nginx/bigsix.conf` 에 `/api/push/` 프록시 location 을 추가한다. `location /api/push/ { proxy_pass http://127.0.0.1:8791/; ... }`~~ **개정 C 로 대체** — 이 형태는 네 엔드포인트를 전부 공개했다.
- [ ] **FR-39.2'** (개정 C): `deploy/nginx/bigsix.conf` 에 **정확 일치** location 하나만 둔다. `location = /api/push/subscribe { client_max_body_size 16k; proxy_pass http://127.0.0.1:8791/subscribe; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; }` 그리고 `location /api/push/ { return 404; }`. `X-Forwarded-For` 는 릴레이의 이중 잠금(FR-36.8) 이 쓰므로 반드시 설정한다. 다른 앱의 vhost 도 같은 두 블록을 쓴다.
- [ ] ~~FR-39.3 (개정 B): `deploy/remote.sh` 에 릴레이 서비스 재시작 + bigsix cron timer 재시작 단계 추가.~~ **개정 C 로 대체.**
- [ ] **FR-39.3'** (개정 C): `deploy/remote.sh` (bigsix 배포) 는 **bigsix cron 만** 다룬다 — `server/apps/bigsix-cron` install 과 `bigsix-cron.timer` 재시작. 릴레이 install·재시작은 하지 않는다 (H-20).
- [ ] FR-39.4 (개정 B · 개정 C 보강): `deploy/deploy.sh` 의 배포 후 검증에 `/api/push/subscribe` 응답 확인 (잘못된 body 로 POST → 400) 을 추가한다. **개정 C**: 공개 경로로 `GET /api/push/subscriptions?app=bigsix` 와 `POST /api/push/send` 가 둘 다 **404** 인지도 확인한다 (FR-36.8). `/send` 를 실제로 발송시키는 검증은 하지 않는다.
- [ ] FR-39.5 (개정 C 경로 갱신): VAPID 키 쌍 생성 절차를 `deploy/README.md` 에 기록한다. 공개키는 앱 빌드 시 `src/lib/data/vapid.ts` 상수로 주입하고, 비밀키는 **릴레이 데이터 디렉터리** (`/var/lib/push-relay/vapid.private`, chmod 600) 로 공급한다. ~~`server/data/vapid.private`~~ 는 개정 B 이전 경로.
- [ ] **FR-39.7** (신규 2026-09-28 C): **릴레이 배포를 따로 둔다** (H-20).
      - 홈서버에 릴레이 전용 체크아웃 `~/apps/push-relay` 를 둔다 (같은 GitHub 저장소를 한 번 더 clone). `push-relay-api.service` 의 `WorkingDirectory` 는 이 체크아웃이다.
      - `deploy/relay-deploy.sh <ref>` 가 이 체크아웃을 `<ref>` 로 동기화 → `(cd server/relay && npm ci --omit=dev)` → `push-relay-api.service` 재시작 → loopback 과 공개 경로 응답 확인 (FR-39.4 와 같은 항목) 을 한다. 기존 `resolve_commit` · 커밋 대조 규약을 재사용한다.
      - 데이터 디렉터리 `/var/lib/push-relay` (소유 `ulismoon`, 권한 700) 는 「최초 1회 설정」 에서 만든다. 릴레이는 `RELAY_DATA_DIR` 가 **없으면 기동을 거부**한다 — 기본값을 저장소 안으로 두면 체크아웃 안에 운영 데이터가 다시 생긴다.
      - bigsix 배포와 릴레이 배포는 서로를 부르지 않는다. 릴레이 계약(FR-36) 이 바뀌는 커밋은 **릴레이를 먼저** 배포한 뒤 bigsix 를 배포한다 — 이 순서를 `deploy/README.md` 에 적는다.
- [ ] FR-39.6 (신규 개정 B): systemd unit 이름 재정비.
      - **삭제**: `deploy/systemd/bigsix-scheduler.service`, `deploy/systemd/bigsix-scheduler.timer`, `deploy/systemd/bigsix-api.service` (있으면 파일명 rename).
      - **신설/rename**: `deploy/systemd/push-relay-api.service` (릴레이 API), `deploy/systemd/bigsix-cron.service`, `deploy/systemd/bigsix-cron.timer`.
      - `deploy/README.md` 「최초 1회 설정」 절과 「서버 런타임」 절이 이 이름들을 반영한다.
      - `sudo systemctl` 재시작 대상도 함께 갱신.

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
- [ ] NFR-31 (개정 2026-09-26 B): **릴레이가 저장하는 데이터**: `{ app, endpoint, keys, meta, createdAt, updatedAt }` — `meta` 는 앱이 정하는 불투명 JSON. bigsix 는 `meta = { tz, notifyAt, programId }` 를 넣는다. **릴레이가 발송 시 부수적으로 지나가는 데이터**: bigsix cron 이 `/send` 로 넘긴 `payload` (bigsix 는 `{title, body}`, VAPID 서명 후 브라우저 push 서비스로. 릴레이는 저장하지 않는다). 운동 기록·AppState·수행 여부·진행 단계는 기기에 남고 서버로 나가지 않는다. 릴레이 저장 파일 스키마에 이 필드가 없다는 사실이 저장소 검증(`tests/server/`) 에서 잡힌다.
- [ ] NFR-32: VAPID 비밀키는 저장소에 커밋하지 않는다. `.gitignore` 또는 서버 전용 파일로 관리한다.
- [ ] NFR-33: `pnpm check` 오류·경고 0, `pnpm test` 전부 통과를 각 커밋에서 유지.
      기준선: main 브랜치 `dc84f1e` 실측 **797 tests / 38 files** (이번에 추가되는 알림 관련 테스트 포함).
- [ ] NFR-34 (도메인 순수성 유지): `src/lib/domain/**` 은 이번 작업에서 수정하지 않는다.
      알림 로직은 `src/lib/ui/` 아래 새 파일(설계에서 경로 정함)에 둔다.

---

## Constraints

- 이 저장소의 **첫 서버 런타임**이다. `deploy/README.md:3` 의 "정적 파일뿐이라 서버 런타임은 없다"
  전제가 이번 작업에서 바뀐다. **개정 B 이후 서버 런타임은 두 개**: (1) 릴레이 API, (2) bigsix cron. 둘 다 이 저장소에서 배포하지만 프로세스가 별개이고 코드 위치도 격리한다 (GLOBAL ADR-38 재작성 · ADR-42).
- **릴레이는 범용이지만 코드는 잠시 이 저장소에 산다 (개정 B).** 나중에 별 저장소로 분리해도 되도록 릴레이 코드가 앱 도메인을 몰라야 한다는 규약은 그대로 유지. bigsix cron 은 앱 코드이므로 이 저장소에 영구히 남는다.
- **코드는 같이 살아도 운영은 따로 간다 (개정 C).** 릴레이는 별도 체크아웃 · 저장소 밖 데이터 디렉터리 · 별도 배포 명령을 갖는다 (H-20, FR-39.7). 분리 시점에 바뀌는 것은 그 체크아웃의 clone URL 뿐이어야 한다.
- **단일 운영자 전제 (H-18)**: `app` 은 자기 신고 값. 남의 앱이 이 릴레이에 붙으려면 별도 인증(앱별 토큰) 이 필요해진다 — 그 조건이 생기기 전까지는 이 릴레이를 공용 인터넷에 노출하지 않는다. 개정 C 에서 이 문장을 코드로 강제한다 — 공개되는 것은 `/subscribe` 뿐이다 (H-19, FR-36.8).
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
| 프로그램 수동 전환 | `src/routes/programs/+page.svelte:39` | FR-33.3(b) 재등록 트리거 |
| 제안 승인 | `src/routes/+page.svelte:62` | FR-33.3(c) 재등록 트리거 |
| 프로그램 스케줄 | `src/lib/data/progressions.json:1703,1738,1782,1829,1920` | FR-47 **bigsix cron 이** 발송 시점에 종목명 계산에 사용 (2026-09-26 B: 릴레이는 이 파일을 읽지 않는다. 개정 A 때 앱이 등록 시 조립하던 로직은 cron 으로 옮겨진다) |
| nginx 설정 | `deploy/nginx/bigsix.conf` | FR-39.2 프록시 location 추가 |
| 배포 스크립트 | `deploy/deploy.sh`, `deploy/remote.sh` | FR-39.3~39.4 |
| deploy README | `deploy/README.md:3` | FR-39.1 수정 대상 |
| 세션 알림(별개) | `src/lib/ui/session/notify.ts` | 이번 작업과 무관. 혼동 주의 |
| iOS 설치 안내 (별개) | `src/lib/ui/shell/install.svelte.ts` | `beforeinstallprompt` 기반 Chrome/Android 전용. iOS standalone 감지 불가 — UI-16 의 iOS 안내와 직접 연동 여부는 설계에서 정함 (OQ-24) |

### programId 값 (progressions.json:1695 이후 — 앱 도메인)

**개정 (2026-09-26 B)**: 이 표는 이제 **bigsix cron 이 읽는 앱 도메인 값**이다. 릴레이는 `programId` 라는 문자열이 `meta` 안에 있다는 사실만 알 뿐 해석하지 않는다. cron 은 매 tick 에서 `progressions.json` 을 다시 읽어 그날 요일의 종목을 계산한다.

| programId | 한국어명 | 운동 요일 | 로컬 요일 매핑 (`FR-48` 결과) |
|---|---|---|---|
| `new_blood` | 신참 | 월 · 목 | `MO`, `TH` |
| `good_behavior` | 모범수 | 월 · 수 · 금 | `MO`, `WE`, `FR` |
| `veterano` | 베테랑 | 월 · 화 · 수 · 목 · 금 · 토 | `MO`~`SA` |
| `solitary_confinement` | 독방 감금 | 월 · 화 · 수 · 목 · 금 · 토 | `MO`~`SA` |
| `supermax` | 슈퍼맥스 | 월 · 화 · 수 · 목 · 금 · 토 | `MO`~`SA` |

(일요일 배열이 모든 프로그램에서 비어 있다 → `SU` 요일에는 cron 이 `/send` 를 부르지 않는다 · EC-83)

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
| EC-78 (개정 B) | push 발송 후 브라우저 push 서비스가 `410 Gone` 또는 `404 Not Found` 응답 | 릴레이가 `/send` 응답 안에서 해당 구독을 저장소에서 즉시 삭제하고 응답 body 에 `{deleted: true}` 를 담아 앱 cron 에 알린다 (FR-44.3). 다음 tick 부터 이 endpoint 는 목록에 없다 |
| EC-79 (개정 B) | 프로그램 미선택 상태에서 알림 켜기 시도 | 켜기 버튼 비활성화. "프로그램을 먼저 선택하세요" 표시 (FR-32.5). 프로그램이 없으면 `meta.programId` 가 없어 cron 이 발송을 만들 수 없으므로 앱이 서버에 등록하지 않는다 |
| EC-80 | 프로그램 전환 후 재등록 실패 (서버 도달 불가 등) | 알림이 꺼진 상태로 돌아간다. About 모달에 실패 사실 표시 (FR-33.4) |
| EC-81 | 서버 도달 불가 (홈서버 꺼짐, 네트워크 단절) | 구독 등록·해지 요청 실패 → EC-80 흐름. 이미 등록된 구독에서는 서버가 꺼진 동안 알림이 오지 않는다. 알려진 한계 (H-13) |
| EC-82 | 같은 기기에서 구독 등록을 두 번 시도 | 브라우저 `PushSubscription` 의 `endpoint` 가 같으므로 서버가 upsert 처리한다 (FR-36.1). 중복 구독이 생기지 않는다 |
| EC-83 (개정 B) | 휴식일(일요일 등 schedule 배열이 빈 날) | **bigsix cron 이** `progressions.json` 을 조회해 그날 요일 배열이 비어 있으면 `/send` 를 부르지 않는다 (FR-47.3). 릴레이는 이 판정을 하지 않는다 |
| EC-84 | 알림 시각을 변경하는 도중 About 모달을 닫음 | 저장되지 않은 시각 변경은 버린다. 마지막으로 저장된 시각이 유효하다 |
| EC-85 (개정 B) | 앱 삭제·재설치 후 새 구독 등록 | 브라우저가 새 `PushSubscription` (새 endpoint)을 발급한다. 이전 endpoint 는 릴레이에 남아 있다. bigsix cron 이 이전 endpoint 로 `/send` → 릴레이 → 브라우저 push 서비스가 `410` → 릴레이가 정리 후 `deleted:true` 응답 (FR-44.3). 새 구독으로 발송이 이어진다 |
| **EC-86** (2026-09-26) | 다른 앱이 남의 endpoint 를 지우려 시도 (`DELETE {"app":"X","endpoint":"..."}` 인데 저장된 레코드는 `("Y", endpoint)` 임) | 서버가 저장소를 **건드리지 않고** `204` 로 응답한다. `app` 이 일치할 때만 삭제 대상. 존재 정보 유출을 피하기 위해 상태 코드는 idempotent 를 유지 (FR-40.3) |
| **EC-87** (개정 B · 개정 C) | 앱이 `/subscribe` 의 `meta`, 또는 `/send` 의 `payload`·`dedupKey` 크기 상한(FR-41.2) 을 넘겨 보냄 | `400 {field}-too-long` 응답. 저장소를 건드리지 않는다. 앱은 이 오류를 `bigsix.push.lastError = 'subscribe-failed'` (또는 cron 로그) 로 처리 |
| ~~**EC-88** (2026-09-26 A)~~ | ~~앱이 `bodyByDay` 키에 요일 코드가 아닌 값~~ | **개정 B 에서 무효** — 릴레이가 `bodyByDay` · `meta` 를 파싱하지 않는다. `meta` 는 그냥 JSON 이면 통과. 요일 검증은 bigsix cron 안의 도메인 규약 (FR-47.2) 이 담당 |
| ~~**EC-89** (2026-09-26 A)~~ | ~~`bodyByDay: {}` 로 보냄~~ | **개정 B 에서 무효** — 동상. `meta = {}` 도 릴레이는 허용 (앱이 자기 의미로 씀) |
| **EC-90** (유지) | VAPID 키 회전 후 기존 구독으로 발송 | 브라우저가 옛 공개키로 만든 subscription 을 새 공개키로 서명하면 검증 실패 · 대부분 `410 Gone` 반환. 릴레이가 `/send` 응답에 `deleted: true` 를 담아 정리 사실을 앱 cron 에 알린다 (FR-44.3). **모든 앱의 사용자가 About 을 열어 「알림 켜기」 를 다시 눌러야 한다.** 자동 감지 수단 없음 (H-16, FR-43.2) |
| **EC-91** (2026-09-26 B) | 같은 `(app, endpoint, dedupKey)` 로 `/send` 두 번 호출 | 두 번째 요청은 발송하지 않고 `200 {"status":"suppressed","reason":"dedup"}` 반환. sentLog 는 그대로 (FR-44.2). bigsix cron 은 이 응답을 받아도 오류로 취급하지 않는다 |
| **EC-92** (2026-09-26 B) | `/send` 로 지정한 `(app, endpoint)` 가 저장소에 없음 (해지됨 · 최초 등록 없음) | `404 subscription-not-found`. 앱 cron 이 이 응답을 받으면 다음 tick 에서 `GET /subscriptions` 로 목록을 다시 읽으므로 자동 회복 |
| **EC-93** (2026-09-26 B) | `meta` 가 JSON 이 아니거나 (예: 문자열 · null · 배열) `meta` stringify 크기가 1024 초과 | `400 meta-invalid` 또는 `400 meta-too-long` (FR-41.2). 저장소를 건드리지 않는다 |
| **EC-94** (2026-09-28 C) | 인터넷에서 `GET /api/push/subscriptions?app=bigsix` 또는 `POST /api/push/send` 를 부름 | nginx 가 `404` (FR-39.2'). nginx 설정이 잘못돼 요청이 릴레이까지 가도, `X-Forwarded-For` 가 붙어 있으므로 릴레이가 `404 not-found` (FR-36.8). 구독 목록도 발송도 일어나지 않는다 |
| **EC-95** (2026-09-28 C) | `/send` 의 `payload` 가 객체가 아님 (문자열 · null · 배열) 또는 UTF-8 직렬화가 3072 바이트 초과 · 또는 최상위에 옛 `title`·`body` 필드 | `400 payload-invalid` / `400 payload-too-large` / `400 unknown-field:title`. 발송하지 않고 sentLog 도 건드리지 않는다 |
| **EC-96** (2026-09-28 C) | 서비스워커가 받은 push 데이터가 JSON 이 아니거나 `title` 이 문자열이 아님 | `title = "빅6"`, `body = ""` 로 대체해 알림을 띄운다 (FR-38.1 개정 C). 알 수 없는 추가 필드는 무시 |

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
- **릴레이 차원의 스케줄 기능** — 간격 기반(「3일마다」) · 특정 날짜(「D-7, D-1」) · 조건부
  (「오늘 안 했으면」) 등 **어떤 스케줄 형태도 릴레이는 제공하지 않고 약속하지 않는다.**
  릴레이가 약속하는 것은 「받아서 서명해 보낸다」 까지다. 스케줄은 전적으로 각 앱 cron 의
  몫이고, 앱이 어떤 규칙을 쓰든 릴레이 코드는 영향받지 않는다 (H-17). 이것이 앱이 늘어도
  릴레이를 고치지 않아도 되는 이유다.
- **VAPID 공개키를 릴레이가 내주는 엔드포인트** (`GET /vapid-public-key`) — 개정 C 검토에서 나왔으나 뒤로 미룬다.
  앱이 둘 이상이 되기 전에 한다. https://github.com/U-lis/bigsix/issues/8
- **공용 tz 모듈의 저장소 밖 재사용** — 다른 저장소의 앱 cron 이 `server/lib/tz` 를 쓰는 방법 (복사 · 패키지).
  두 번째 앱 cron 이 생길 때 정한다. https://github.com/U-lis/bigsix/issues/9

---

## Open Questions

| # | 질문 | 메모 | 상태 |
|---|---|---|---|
| OQ-20 | 서버 런타임 언어/프레임워크 | Node.js(`web-push` npm), Deno, Python(FastAPI), Go 중 선택. `web-push` 라이브러리 생태계 성숙도와 기존 서버(Node nvm 24)의 런타임 재사용을 고려하면 Node.js 가 자연스럽다. | **확정 — GLOBAL ADR-29** |
| OQ-21 | 구독 저장 형식 | SQLite (better-sqlite3) vs JSON 파일. 구독 수가 단일 사용자(기기 1~3개) 규모면 JSON 파일로 충분하다. 스케줄러의 중복 방지 기록도 같은 저장소를 공유한다. | **확정 — GLOBAL ADR-31** |
| OQ-22 | 스케줄러 중복 방지 구현 | `(endpoint, date)` 발송 기록을 저장소에 남기는 방법과 보존 기간(예: 7일 후 자동 삭제). systemd timer 재실행 간격(1분)에서 타임존 경계(자정 직후) 처리. | **확정 — GLOBAL ADR-41 · ADR-42** (개정 B). 원래 답이던 ADR-32 는 「릴레이 안의 스케줄러」로서 폐기됐다. 중복 억제는 릴레이가 `dedupKey` 문자열로 하고(ADR-41), 매 분 판정은 앱 cron 이 한다(ADR-42) |
| OQ-23 | VAPID 키 배포 방법 | 비밀키는 서버 로컬 파일 또는 환경 변수. `deploy/remote.sh` 에서 최초 1회 생성 후 서버에 남기는 방식이 단순하다. 공개키는 `vite.config.ts` 에 상수로 박는다(저장소 커밋 가능). 키 교체 절차도 문서화 필요. | **확정 — GLOBAL ADR-33** |
| OQ-24 | iOS 미설치 안내와 install.svelte.ts 연동 | `src/lib/ui/shell/install.svelte.ts` 가 이미 설치 상태를 추적한다. 알림 섹션에서 이 상태를 읽어 "홈 화면에 추가하세요" 안내에 연결할 수 있다. | **확정 — GLOBAL ADR-34** |
| OQ-25 | 커스텀 서비스워커 파일 경로 | `src/service-worker.ts` (vite-pwa/sveltekit 기본) vs `src/sw.ts` 등. SvelteKit + vite-pwa 의 `injectManifest` 에서 권장하는 위치와 `srcDir`·`filename` 설정값. | **확정 — GLOBAL ADR-35** |

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
