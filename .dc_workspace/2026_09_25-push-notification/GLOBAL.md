# bigsix 푸시 알림 — 전역 문서

## 기능 개요

**목적**: 운동일 사용자가 정한 시각에 푸시 알림을 보내, 앱을 열지 않아 세션을 놓치는 상황을 막는다.

**문제**: 정적 PWA 는 닫힌 상태에서 코드를 실행할 수 없다. 정해진 시각에 알림을 보내려면 외부 주체가 필요하다.

**해법**: 홈서버의 공용 푸시 게이트웨이 **push-relay** 에 붙는다. bigsix 가 하는 일은 셋이다.

| 어디 | 무엇 |
|---|---|
| 화면 | `/settings` 에서 알림 켜기·끄기와 시각. 릴레이 `client.js` 로 `PushRelay.enable(meta)` · `disable()` · `state()` 호출 |
| 서비스워커 | `src/pwa-sw.ts` 최상위에 릴레이 `sw.js` 를 `importScripts` 한 줄 |
| 홈서버 cron | 1분마다 릴레이 cron API 로 구독 목록을 받아 창 안의 구독에 한 번에 발송 |

---

## 아키텍처 결정

### ADR-29: 「알림 켜짐」의 정본

`PushRelay.state()` 가 정본이다. 로컬 저장소 `bigsix.push` 에는 `{ v:1, notifyAt, sentMeta }` 만 보관한다 — `enabled` 플래그 없음. 이유: 브라우저 설정에서 권한을 철회하면(EC-75) 로컬 플래그가 실제 릴레이 상태와 영구히 어긋난다.

### ADR-30: 신규 UI 레이어 `src/lib/ui/push/`

푸시 관련 클라이언트 코드 전부를 `src/lib/ui/push/` 에 둔다. `tests/unit/structure.test.ts` 두 곳을 함께 수정해야 한다.

- `LAYER_ROOTS` (31행): `'lib/ui/history'` 뒤에 `'lib/ui/push'` 추가 — 123행의 길이 단언을 `9` → `10` 으로 변경.
- `UI_UNDER` (43행): `'push'` 를 Set 에 추가 — 231행의 `UI_UNDER.has(d) || d === 'history'` 가드가 자동으로 커버.

### ADR-31: 환경변수 `PUBLIC_PUSH_RELAY_URL` 하나

비밀이 아니므로 두 `.env` 파일을 저장소에 커밋한다.

- `.env.development` → `https://push-dev.siot-ieung.duckdns.org`
- `.env.production`  → `https://push.siot-ieung.duckdns.org`

서비스워커(`src/pwa-sw.ts`)와 설정 화면 모두 `$env/static/public` 으로 읽는다. 메인 세션 실측: `pwa-sw.ts` 에서 `$env/static/public` import → 빌드 성공, 산출 `sw.js` 에 URL 인라인, `import` 문 없음 (OQ-20 해소).

### ADR-32: classic SW 에서 `importScripts` + try/catch

`src/pwa-sw.ts` 최상위:
```ts
import { PUBLIC_PUSH_RELAY_URL } from '$env/static/public';
try { importScripts(PUBLIC_PUSH_RELAY_URL + '/sw.js') } catch {}
```
`sw.svelte.ts:54` 가 `/sw.js` 를 classic SW 로 등록하므로 `importScripts` 를 쓸 수 있다. `try/catch` 가 Chrome · Firefox · Safari 에서 릴레이 불능 시에도 앱 SW 설치를 보호하는지는 Phase 3 수동 확인(OQ-21).

### ADR-33: `relay.ts` 의 동적 `client.js` 로드

`client.js` 를 `app.html` 에 넣지 않는다. `src/lib/ui/push/relay.ts` 가 `loadRelay()` 를 export 하고, 이 함수가 `<script>` 태그를 한 번만 삽입·캐시한다. 호출 지점: `/settings` 진입 시, 부팅 뒤 자동 동기화. 릴레이 스크립트가 첫 화면 렌더와 오프라인 진입을 막지 않도록 하기 위해서다.

### ADR-34: 순수 함수 `buildMeta` (`src/lib/ui/push/meta.ts`)

시그니처: `buildMeta(state: AppState, catalog: Catalog, tz: string, notifyAt: string): PushMeta | null`

프로그램 미선택(`currentStint(state)` 가 null)이면 null 을 반환한다. 재료:

- `currentStint(state)` → `programId`
- `getProgram(catalog, programId).name.ko` → `meta.program`
- 각 `Weekday` 마다 `planDay(state, catalog, programId, weekday).exercises[].progressionId` → `getProgression(catalog, id).name.ko`
- 종목이 없는 요일은 `meta.days` 에서 제외

모두 `$lib/domain` index export. `catalog` 는 호출자가 `$lib/data/catalog` `loadCatalog()` 로 로드해 넘긴다. 변경 감지는 `JSON.stringify` 비교.

### ADR-35: 부팅 뒤 자동 동기화

`+layout.svelte` `onMount` 에서 `boot()` 뒤:
```ts
queueMicrotask(() => pushAutoSync())
```
`pushAutoSync` (`src/lib/ui/push/autoSync.ts`)는 `bigsix.push.sentMeta` 가 null 이면 바로 반환한다 — 한 번도 켠 적 없는 사용자는 릴레이 클라이언트를 로드하지 않는다. 실행 조건: `state() === 'on'` 이고 `buildMeta(...)` 가 non-null 이며 직렬화가 `sentMeta` 와 다를 때 `enable(새 meta)` 호출. 직렬화는 `test` 를 뺀 meta 기준 (FR-33.11). 모든 예외는 조용히 넘긴다. 근거: relay `client.js` 는 `Notification.permission === 'default'` 일 때만 `requestPermission` 을 부르므로, 이미 `granted` 이면 제스처 밖 `enable` 호출이 안전하다.

### ADR-36: 전체 초기화 연동

`src/lib/ui/state/reset.ts` `performReset()` 은 동기를 유지한다. 유일한 직접 호출 지점인 `src/lib/ui/shell/About.svelte:35` 에서 `performReset()` 호출 전에 `await teardownPush()` 를 먼저 실행한다. `teardownPush()` 는 `state() === 'on'` 이면 `PushRelay.disable()` 을 호출하고, 실패해도 통과한다. `performReset()` 은 기존 동작에 `deletePushRecord()` 를 추가한다.

### ADR-37: `cron/` 레이아웃

파일: `cron/push.ts` (진입·I/O) · `cron/decide.ts` (순수) · `cron/message.ts` (순수) · `cron/env.ts` (환경변수). `src/` import 없음. 신규 npm 의존성 없음. Node 24 네이티브 TS 실행 (플래그 필요 여부는 Phase 6 확인).

### ADR-38: `dedupKey` 와 `requestId`

- `dedupKey` = 구독의 현지 날짜 `YYYY-MM-DD` (릴레이 dedup PK 는 `(subscription_id, dedup_key)`, 8일 보존 — push-relay `src/store/migrations.rs:40`, `src/store/mod.rs:161`)
- 테스트 발송: `dedupKey = 'test-YYYYMMDDHHMMSS'` (UTC, `meta.test` 기준, FR-35.8)
- `requestId` = `bigsix-<UTC YYYY-MM-DDTHH:MM>-<4자리 이상 hex>` — 발송 전에 로그에 남긴다

### ADR-39: systemd 템플릿 유닛 (`deploy/systemd/`)

파일: `bigsix-push@.service` (oneshot) · `bigsix-push@.timer` (매 분). 핵심:

- `EnvironmentFile=%h/apps/push-relay/%i/data/keys/bigsix.env` — `%h` 는 systemd 홈 디렉터리 지시자(`~` 아님), `%i` 는 인스턴스 이름(`prod` 또는 `dev`)
- `User=ulismoon` — 릴레이 유닛과 같은 사용자여야 600 권한 키 파일을 읽을 수 있다
- `ExecStart` 의 `node` 절대 경로는 `deploy/push-install.sh` 설치 시 확정
- 인스턴스 이름이 릴레이 환경 디렉터리 이름과 같아 템플릿 하나로 `prod` · `dev` 를 모두 커버

### ADR-40: 페이즈별 IR 로그 즉시 기록

각 페이즈 끝에 SPEC IR 로그 표를 갱신한다. Phase 8 에서 종합해 PR 본문 「push-relay 연동 문서 이슈」 절로 낸다.

---

## 데이터 모델

### 클라이언트 타입 (`src/lib/ui/push/types.ts`)

```ts
type PushState = 'loading' | 'unsupported' | 'denied' | 'off' | 'on';

type PushErrorCode =
  | 'denied' | 'unsupported' | 'no-service-worker' | 'origin-not-allowed'
  | 'push-service-not-allowed' | 'subscribe' | 'network' | 'server';

interface PushMeta {
  v: 1;
  tz: string;           // IANA 타임존
  notifyAt: string;     // "HH:MM"
  program: string;      // 프로그램 한국어명
  days: Partial<Record<Weekday, string[]>>;  // 종목 한국어명 배열
}

interface PushRecord {
  v: 1;
  notifyAt: string;     // 사용자 설정 시각, 기본값 "19:00"
  sentMeta: string | null;  // 마지막으로 릴레이에 보낸 PushMeta 의 JSON.stringify 결과
}
```

localStorage 키: `bigsix.push` 에 `PushRecord` 를 저장한다.

### cron 타입 (`cron/`)

```ts
interface CronMessage {
  to: string;           // 구독 id
  notification: {
    title: string;      // 항상 "BigSix"
    body: string;
    url: string;
    tag: string;
    icon: string;       // 절대 URL (IR-6 참조)
  };
  dedupKey: string;     // 정규: 구독 현지 타임존 기준 "YYYY-MM-DD" / 테스트: "test-YYYYMMDDHHMMSS"
}
```

---

## 파일 배치

### 신설 파일

| 경로 | 역할 |
|------|------|
| `src/lib/ui/push/types.ts` | PushState · PushErrorCode · PushMeta · PushRecord 타입 |
| `src/lib/ui/push/storage.ts` | `bigsix.push` localStorage 읽기/쓰기/삭제 |
| `src/lib/ui/push/push.svelte.ts` | 룬 기반 반응형 푸시 레코드 |
| `src/lib/ui/push/meta.ts` | `buildMeta()` 순수 함수 |
| `src/lib/ui/push/relay.ts` | `loadRelay()` · `teardownPush()` |
| `src/lib/ui/push/autoSync.ts` | `pushAutoSync()` — layout 부팅 뒤 호출 |
| `src/routes/settings/+page.svelte` | 설정 화면 |
| `src/routes/settings/+page.ts` | `prerender = true` |
| `.env.development` | `PUBLIC_PUSH_RELAY_URL` dev 값 |
| `.env.production` | `PUBLIC_PUSH_RELAY_URL` prod 값 |
| `cron/push.ts` | cron 진입점 |
| `cron/decide.ts` | 발송 판정 순수 함수 |
| `cron/message.ts` | 메시지 조립 순수 함수 |
| `cron/env.ts` | 환경변수 로드 |
| `deploy/systemd/bigsix-push@.service` | systemd oneshot 유닛 |
| `deploy/systemd/bigsix-push@.timer` | systemd 타이머 유닛 |
| `deploy/push-install.sh` | 최초 1회 설치 스크립트 (멱등) |

### 수정 파일

| 경로 | 변경 내용 |
|------|----------|
| `src/pwa-sw.ts` | 최상위에 `importScripts` try/catch 추가 |
| `src/routes/+layout.svelte` | 상단 바 「설정」 링크(`data-settings-open`), 부팅 뒤 `pushAutoSync` 호출 |
| `src/lib/ui/state/reset.ts` | `performReset()` 에 `deletePushRecord()` 추가 |
| `src/lib/ui/shell/About.svelte` | `performReset()` 호출 전 `await teardownPush()` 추가 |
| `vite.config.ts` | `server: { port: 5173, strictPort: true }` 추가 |
| `tests/unit/structure.test.ts` | `LAYER_ROOTS` 에 `lib/ui/push` 추가, 길이 단언 10, `UI_UNDER` 에 `'push'` 추가 |
| `deploy/deploy.sh` | `bigsix-push@prod.timer` 활성 여부 검증 추가 |
| `deploy/README.md` | 런타임 설명 수정, 키 교체 절차 추가 |
| `README.md` | 알림 기능 설명 및 알려진 한계 추가 |
| `CHANGELOG.md` | 0.3.0 항목 추가 |
| `CLAUDE.md` | `data-push-*` · `data-settings-*` 훅, `ui/push` 폴더, 서버 코드 문구 수정 |

---

## 페이즈 지도

모두 단일 워크트리에서 순차 실행한다. Phase 6 은 앱 페이즈와 import 관계가 없고 `PushMeta` 형식만 공유한다.

| 페이즈 | 키워드 | 설명 | 상태 | 선행 조건 |
|--------|--------|------|------|----------|
| 1 | pwa-injectmanifest | SW injectManifest 전환 | 완료 | — |
| 2 | push-foundation | 타입 · storage · push state · meta | Complete | 1 |
| 3 | sw-importscripts | `.env` 파일 · pwa-sw.ts · vite strictPort | Complete (OQ-21 수동 미결) | 2 |
| 4 | settings-screen | `/settings` 화면 · relay.ts · 상단 바 링크 · reset 연동 | — | 3 |
| 5 | push-autosync | autoSync.ts · layout 연결 | — | 4 |
| 6 | cron-sender | `cron/` 구현 | — | 2 (PushMeta 타입만) |
| 7 | deploy-wiring | systemd 유닛 · push-install.sh · deploy.sh · deploy/README | — | 5, 6 |
| 8 | docs-and-ir-report | README · CHANGELOG · CLAUDE.md · IR 로그 마감 | — | 7 |
