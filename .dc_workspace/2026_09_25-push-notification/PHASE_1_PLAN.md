# Phase 1 — injectManifest 전환 + 커스텀 서비스워커

**목표**
`SvelteKitPWA` 를 `generateSW` 에서 `injectManifest` 로 옮기고, 커스텀 SW 파일에 (a) 기존 프리캐시·SPA 라우팅 동작을 코드로 재구성, (b) `push` · `notificationclick` 핸들러를 얹는다. **이번 작업 최대의 회귀 위험** (SPEC RISK-1) 이므로 프리캐시 등가성을 로컬 검증까지 붙인다.

## SPEC 참조

- FR-31.1: `vite.config.ts` 를 `strategies: 'injectManifest'` 로. `injectManifest.globPatterns` 유지. `ignoreURLParametersMatching` · `navigateFallback` 은 SW 코드로 이관 (GLOBAL ADR-35).
- FR-31.2: 커스텀 SW 파일 경로 = `src/pwa-sw.ts` (ADR-35). 프리캐시·SPA 라우팅 + push · notificationclick.
- FR-31.3: `sw.svelte.ts:41` 의 `controllerchange` 새로고침, `sw.svelte.ts:54` 의 `/sw.js` 하드코딩이 전환 후에도 동작.
- FR-31.4: `pnpm check` 0/0, `pnpm test` 통과, 프리캐시 대조 통과.
- FR-38.1: `push` 이벤트 핸들러 (title/body/icon).
- FR-35.1 · FR-35.2: 알림을 탭하면 루트(`/`)를 열거나 이미 열려 있으면 포커스한다.
  닫혀 있으면 `clients.openWindow('/')`. FR-38.2 핸들러가 이 동작을 낸다.
- FR-38.2: `notificationclick` 이벤트 핸들러 (matchAll → focus | openWindow).
- NFR-30 (a~d): globPatterns 에 json, ignore 쿼리, navigateFallback, controllerchange 자동 새로고침.

## 변경 파일

| 파일 | 편집 종류 | 내용 |
|---|---|---|
| `vite.config.ts` | 편집 | `strategies: 'injectManifest'`, `workbox:` 키 → `injectManifest:` 로 변경 후 `globPatterns` 만 유지, `srcDir/filename` 추가 |
| `src/pwa-sw.ts` | 신규 | 프리캐시 + navigate route + skipWaiting/clientsClaim + push · notificationclick |
| `package.json` | 편집 | dev deps 에 `workbox-precaching`, `workbox-routing`, `@types/serviceworker` 추가 (`@vite-pwa/sveltekit` 이 내부 의존하지만 injectManifest 소스 컴파일 대상에 명시적 dep 필요) |
| `pnpm-lock.yaml` | 자동 | lock 갱신 |
| `tsconfig.json` | 편집 (필요 시) | `src/pwa-sw.ts` 를 `WebWorker` lib 로 인식하도록 `types` 설정 확인. 실측 후 필요 시만 |
| `tests/unit/pwa-sw.test.ts` | 신규 | SW 핸들러 유닛 테스트 (FR-38.1·2) — happy-dom 없이 순수 함수로 뺀 헬퍼를 검증 |
| `tests/unit/precache-parity.test.ts` | 신규 | 빌드 산출물 `build/sw.js` 에서 프리캐시 URL 목록을 파싱해 `build/` 실파일 존재 검증 — 로컬 대체 대조 (RISK-1 대응) |

## 커스텀 SW 파일 초안 (`src/pwa-sw.ts`)

**설계 요점** — 이벤트 핸들러의 순수 로직은 별도 exported 함수 (`buildNotification`, `pickTargetClient`) 로 분리해 tests 가 SW 컨텍스트 없이 검증할 수 있게 한다. self 접근은 파일 하단 wire-up 에서만.

```ts
// src/pwa-sw.ts  (Phase 1 신규)
/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

// (1) 프리캐시 — generateSW 의 globPatterns + ignoreURLParametersMatching 등가.
precacheAndRoute(self.__WB_MANIFEST, {
  ignoreURLParametersMatching: [/.*/],
});
cleanupOutdatedCaches();

// (2) SPA 라우팅 fallback — generateSW 의 navigateFallback: '/' 등가.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/')));

// (3) autoUpdate — skipWaiting + clientsClaim 등가.
self.skipWaiting();
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// (4) FR-38.1 push 이벤트. 서버가 보낸 { title, body, icon } 를 그대로 표시.
export interface PushPayload { title: string; body: string; icon?: string; }
export function buildNotification(payload: PushPayload): { title: string; options: NotificationOptions } {
  return {
    title: payload.title,
    options: { body: payload.body, icon: payload.icon ?? '/icon-192.png' },
  };
}
self.addEventListener('push', (event) => {
  const raw = event.data?.json() as PushPayload | undefined;
  if (raw === undefined) return;
  const { title, options } = buildNotification(raw);
  event.waitUntil(self.registration.showNotification(title, options));
});

// (5) FR-38.2 notificationclick — 열려 있으면 focus, 없으면 open.
export function pickTargetClient(
  clients: readonly WindowClient[], origin: string,
): WindowClient | null {
  return clients.find((c) => new URL(c.url).origin === origin) ?? null;
}
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const target = pickTargetClient(clients, self.location.origin);
    if (target !== null) {
      await target.focus();
    } else {
      await self.clients.openWindow('/');
    }
  })());
});
```

## `vite.config.ts` 변경 diff (요지)

```
- workbox: {
-   globPatterns: ['**/*.{js,css,html,json,svg,png,woff2}'],
-   ignoreURLParametersMatching: [/.*/],
-   navigateFallback: '/'
- }
+ strategies: 'injectManifest',
+ injectManifest: {
+   srcDir: 'src',
+   filename: 'pwa-sw.ts',
+   globPatterns: ['**/*.{js,css,html,json,svg,png,woff2}']
+ }
```

- `registerType: 'autoUpdate'` · `manifest` 블록은 그대로 유지 (FR-31.3, NFR-30.d).
- `ignoreURLParametersMatching` · `navigateFallback` 은 SW 코드로 옮겼음을 diff 옆 주석으로 명시.

## 커밋 경계 (3개)

### (a) `feat(pwa): injectManifest 전환 · 커스텀 SW 파일 신설`

- `vite.config.ts` 변경 (위 diff).
- `src/pwa-sw.ts` 신규 (위 초안). push · notificationclick 핸들러 포함.
- `package.json` 에 `workbox-precaching`, `workbox-routing`, `@types/serviceworker` (또는 `types: ['webworker']` tsconfig 옵션) 추가. `pnpm install` 후 lock 갱신.
- `pnpm build` 를 로컬에서 돌려 `build/sw.js` 생성이 성공하는지 확인. `build/sw.js` 내부에 `url:"/index.html"` 등 프리캐시 매니페스트가 embed 되어 있는지 grep.
- `pnpm check` 0/0, `pnpm test` 797 그대로 (신규 tests 는 커밋 b 에서).

### (b) `test(pwa): push · notificationclick 유닛 테스트`

- `tests/unit/pwa-sw.test.ts` 신규:
  - `buildNotification` — 기본 icon 적용, body/title 전달, icon override.
  - `pickTargetClient` — origin 일치 창 우선, 없으면 null.
- `pnpm test` 797 → 797 + N (신규 4~5 케이스).

### (c) `test(pwa): 프리캐시 등가성 로컬 대조`

- `tests/unit/precache-parity.test.ts` 신규:
  - `pnpm build` 산출물 존재를 가정하지 않고, `vite build --outDir=/tmp/parity-<pid>` 를 `execSync` 로 부른다 (test setup 내부).
  - `sw.js` 를 읽어 `url:"..."` 목록을 뽑아, 각 URL 이 `build/` 안 실파일로 존재하는지 확인.
  - `.js`, `.css`, `.html`, `.json`, `.svg`, `.png`, `.woff2` 확장자만 매니페스트에 들어와야 한다는 assertion (globPatterns 유지 확인).
  - `/sw.js` 자체는 매니페스트에 들어가지 않아야 한다.
- 이 테스트는 CI 에서 build 를 한 번 도는 것에 해당 — 실측 소요 시간 확인 후 vitest 의 timeout 을 30s 로 설정.
- Alternative (백업): build 실행이 CI 리소스에 무리이면 사전 빌드 산출물을 fixture 로 커밋하지 않고, 이 테스트를 skip 하되 `deploy/deploy.sh` 의 원격 대조가 안전망이 된다는 사실을 test 파일 상단 주석에 명시. **일단 첫 시도로 실행 포함, 실측 후 결정.**

## 완료 기준

- 커밋 a~c 전부에서 `pnpm check` 오류/경고 0.
- `pnpm test` 통과. 테스트 수 797 → 797+N.
- `pnpm build` 성공, `build/sw.js` 존재.
- `build/sw.js` 를 브라우저에서 로드했을 때 (`pnpm preview`) DevTools Application → Service Workers 에 "activated" 상태로 뜨고, 콘솔에 오류 없음.
- 프리캐시 매니페스트 목록 (`grep -oE 'url:"[^"]+"' build/sw.js`) 이 이전 `generateSW` 산출물과 동일 파일 집합 (파일 개수 · 확장자 분포 일치).
- SW 유닛 테스트 5건 통과.
- FR-31.3: 등록 흐름 미변경 — `sw.svelte.ts` 는 이 페이즈에서 손대지 않는다.

## 위험

- **RISK-1** (사용자 지시 최대 위험): 프리캐시 회귀. 로컬 대체 대조로 1차 걸러내고, 홈서버 배포 후 `deploy/deploy.sh` 프리캐시 전수 대조가 2차 안전망. Phase 4 배포 후 재확인.
- **package-lock 노이즈**: `pnpm-lock.yaml` diff 가 크게 나올 수 있음. `pnpm-lock.yaml` 만 별도 커밋으로 뺄 필요 없음 — 규모 크지 않으면 (a) 에 포함.
- **`@types/serviceworker`**: 이 패키지가 없으면 `self.__WB_MANIFEST` 등에 타입이 없어 svelte-check 가 실패. 대안: `tsconfig.json` 에 `"lib": ["...", "WebWorker"]` 를 이 파일 한정으로 걸 수 없으므로 파일 상단 `/// <reference lib="webworker" />` + `declare const self: ServiceWorkerGlobalScope;` 로 처리 (초안 그대로).

## 임시 배포

이 페이즈에 포함하지 않는다. Phase 4 완료 후 홈서버에 올려 SW 갱신·프리캐시 대조를 한 번에 검증.
