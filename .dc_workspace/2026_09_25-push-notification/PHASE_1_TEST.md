# Phase 1 — TEST 체크리스트

## FR-31.1 — `vite.config.ts` 전환

- [ ] `grep -n "strategies:" vite.config.ts` → `'injectManifest'`.
- [ ] `grep -n "injectManifest:" vite.config.ts` → `srcDir: 'src'`, `filename: 'pwa-sw.ts'`, `globPatterns: ['**/*.{js,css,html,json,svg,png,woff2}']` 셋 다 존재.
- [ ] `grep -n "workbox:" vite.config.ts` 결과 없음 (구 키 제거 확인).
- [ ] `registerType: 'autoUpdate'` 유지. `manifest` 블록 유지.

## FR-31.2 · FR-38 — `src/pwa-sw.ts` 존재와 핸들러

- [ ] `test -f src/pwa-sw.ts` 통과.
- [ ] `grep -n "precacheAndRoute" src/pwa-sw.ts` — 1건.
- [ ] `grep -n "ignoreURLParametersMatching" src/pwa-sw.ts` — `[/.*/]` 존재 (NFR-30.b 등가).
- [ ] `grep -n "NavigationRoute\\|createHandlerBoundToURL" src/pwa-sw.ts` — SPA fallback 존재 (NFR-30.c 등가).
- [ ] `grep -n "cleanupOutdatedCaches" src/pwa-sw.ts` — 1건.
- [ ] `grep -n "skipWaiting\\|clients.claim" src/pwa-sw.ts` — 각각 존재 (autoUpdate 등가, NFR-30.d).
- [ ] `grep -n "self.addEventListener.'push'" src/pwa-sw.ts` — push 리스너 존재.
- [ ] `grep -n "self.addEventListener.'notificationclick'" src/pwa-sw.ts` — notificationclick 리스너 존재.
- [ ] `grep -n "waitUntil" src/pwa-sw.ts` — 최소 2건 (push · notificationclick 각).

## FR-38.1 · FR-38.2 — 유닛 테스트 (`tests/unit/pwa-sw.test.ts`)

- [ ] `buildNotification({title:'빅6', body:'모범수 · 푸시업, 레그 레이즈'})` — title 그대로, options.body 그대로, options.icon 기본값 `/icon-192.png`.
- [ ] `buildNotification({..., icon:'/x.png'})` — icon 오버라이드 반영.
- [ ] `pickTargetClient([], 'https://example.com')` → `null`.
- [ ] `pickTargetClient([{url:'https://example.com/'} as WindowClient], 'https://example.com')` → 그 client 반환.
- [ ] `pickTargetClient([{url:'https://other.com/'} as WindowClient], 'https://example.com')` → `null`.

## FR-31.4 — 빌드와 검사

- [ ] `pnpm check` — 오류 0, 경고 0. (NFR-33)
- [ ] `pnpm test` — 전부 통과. 기준선 797 → 797 + N (신규 5~7건).
- [ ] `pnpm build` — 성공. `build/sw.js` 존재.
- [ ] `test -f build/sw.js` 통과.
- [ ] `build/sw.js` 안에 `self.__WB_MANIFEST` 자리 (`workbox` injection 완료 확인) 확장 결과가 있음 — `grep -o 'url:"' build/sw.js | wc -l` ≥ 20.

## NFR-30 — 등가성 로컬 대조 (`tests/unit/precache-parity.test.ts`)

- [ ] 매니페스트에 `.js`, `.css`, `.html`, `.json`, `.svg`, `.png`, `.woff2` 확장자 파일들이 포함.
- [ ] 매니페스트의 각 URL 이 `build/` 안 실파일로 존재 (404 발생 파일 없음).
- [ ] `/sw.js` · `/pwa-sw.ts` 는 매니페스트에 없음.
- [ ] `/manifest.webmanifest` 는 매니페스트에 존재 (기존 generateSW 동작 유지).

## FR-31.3 — 서비스워커 등록 · 갱신 흐름 미변경

- [ ] `src/lib/ui/shell/sw.svelte.ts` 는 이 페이즈에서 편집 0건 (`git diff --name-only HEAD` 결과에 없음).
- [ ] `src/lib/ui/shell/sw.svelte.ts:54` 의 `/sw.js` 하드코딩 그대로.
- [ ] `pnpm preview` 로 로컬 서빙 후 브라우저 DevTools:
  - Service Workers 탭에 `/sw.js` scope `/` 로 activated.
  - Console 에 서비스워커 관련 오류 · 경고 0건.
  - Application → Cache Storage 에 workbox 프리캐시 캐시(`workbox-precache-v2-...`) 가 생성되고 파일들이 담겨 있다.

## 브라우저 실물 확인 (수동)

- [ ] Chrome DevTools → Application → Service Workers → "Update on reload" 켠 상태에서 새로고침 시 새 SW 가 정상 활성화 (기존 controllerchange 새로고침 흐름).
- [ ] Application → Notifications → "Test push" 로 임의 payload 전송 시 `showNotification` 이 발동 (수동 확인, 서버 준비 전 대체 검증).
- [ ] 오프라인 모드에서 `/`, `/programs`, `/steps`, `/history` 로 이동 시 프리캐시된 shell 이 로드 (기존 오프라인 동작 유지, NFR-30.a·b·c).

## 배포 후 대조 (Phase 4 이후 재확인)

- [ ] `deploy/deploy.sh` 실행 시 프리캐시 전수 대조 통과 (`==> 프리캐시 목록 대조` `전부 200`).

## 알림 탭 동작 (FR-35)

- [ ] FR-35.1: 앱이 열려 있는 상태에서 `notificationclick` → 기존 클라이언트를 `focus()` 한다 (새 창을 열지 않는다).
- [ ] FR-35.2: 열린 클라이언트가 없으면 `clients.openWindow('/')` 를 부른다.

---

## 검증 메모 (Coder 가 채운다)

<!-- 각 커밋 SHA · pnpm test 결과 · 발견 사항. Phase 1 완료 후 이 자리에 추가. -->
