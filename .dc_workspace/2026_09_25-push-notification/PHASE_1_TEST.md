# Phase 1 — TEST 체크리스트

## FR-31.1 — `vite.config.ts` 전환

- [x] `grep -n "strategies:" vite.config.ts` → `'injectManifest'`. (vite.config.ts:34)
- [x] `grep -n "injectManifest:" vite.config.ts` → `globPatterns: ['**/*.{js,css,html,json,svg,png,woff2}']` 존재.
      ※ `srcDir`/`filename` 은 @vite-pwa/sveltekit@1.1.0 에서 top-level 로 지정 (`filename: 'sw.js'`). SW 소스 경로는 `svelte.config.js kit.files.serviceWorker: 'src/pwa-sw'` 로 지정 — PLAN 이탈이나 타당함 (이탈 사항 1·2 참조).
- [x] `grep -n "workbox:" vite.config.ts` 결과 없음 (구 키 제거 확인).
- [x] `registerType: 'autoUpdate'` 유지. `manifest` 블록 유지.

## FR-31.2 · FR-38 — `src/pwa-sw.ts` 존재와 핸들러

- [x] `test -f src/pwa-sw.ts` 통과. (src/pwa-sw.ts:1)
- [x] `grep -n "precacheAndRoute" src/pwa-sw.ts` — 1건. (src/pwa-sw.ts:35)
- [x] `grep -n "ignoreURLParametersMatching" src/pwa-sw.ts` — `[/.*/]` 존재 (NFR-30.b 등가). (src/pwa-sw.ts:36)
- [x] `grep -n "NavigationRoute\\|createHandlerBoundToURL" src/pwa-sw.ts` — SPA fallback 존재 (NFR-30.c 등가). (src/pwa-sw.ts:42)
- [x] `grep -n "cleanupOutdatedCaches" src/pwa-sw.ts` — 1건. (src/pwa-sw.ts:38)
- [x] `grep -n "skipWaiting\\|clients.claim" src/pwa-sw.ts` — 각각 존재 (autoUpdate 등가, NFR-30.d). (src/pwa-sw.ts:46, 48)
- [x] `grep -n "self.addEventListener.'push'" src/pwa-sw.ts` — push 리스너 존재. (src/pwa-sw.ts:55)
- [x] `grep -n "self.addEventListener.'notificationclick'" src/pwa-sw.ts` — notificationclick 리스너 존재. (src/pwa-sw.ts:66)
- [x] `grep -n "waitUntil" src/pwa-sw.ts` — 2건 이상 (push · notificationclick 각). (src/pwa-sw.ts:59, 68)
      ※ 순수 헬퍼(`buildNotification`, `pickTargetClient`)는 `src/lib/pwa/push-handlers.ts` 로 분리 — PLAN 이탈이나 타당함 (이탈 사항 4 참조).

## FR-38.1 · FR-38.2 — 유닛 테스트 (`tests/unit/pwa-sw.test.ts`)

- [x] `buildNotification({title:'빅6', body:'모범수 · 푸시업, 레그 레이즈'})` — title 그대로, options.body 그대로, options.icon 기본값 `/icon-192.png`. PASS
- [x] `buildNotification({..., icon:'/x.png'})` — icon 오버라이드 반영. PASS
- [x] `pickTargetClient([], 'https://example.com')` → `null`. PASS
- [x] `pickTargetClient([{url:'https://example.com/'} as WindowClient], 'https://example.com')` → 그 client 반환. PASS
- [x] `pickTargetClient([{url:'https://other.com/'} as WindowClient], 'https://example.com')` → `null`. PASS
- [x] 추가 케이스: 여러 창 중 origin 일치하는 첫 번째 선택 (tests/unit/pwa-sw.test.ts:47). PASS

## FR-31.4 — 빌드와 검사

- [x] `pnpm check` — 오류 0, 경고 0. (실측 0/0/0, 500 files)
- [x] `pnpm test` — 전부 통과. 797 → 805 (+8건, 40 test files).
- [x] `pnpm build` — 성공. `build/sw.js` 존재. (39 precache entries, 276.82 KiB)
- [x] `test -f build/sw.js` 통과.
- [x] `build/sw.js` 안에 precache 매니페스트 39건. `grep -o '"url":"' build/sw.js | wc -l` = 39.

## NFR-30 — 등가성 로컬 대조 (`tests/unit/precache-parity.test.ts`)

- [x] 매니페스트에 `.js`(22건), `.css`(7건), `.json`(1건: `_app/version.json`), `.svg`(1건), `.png`(3건) 포함. PASS
      ※ `.html`: 확장자 없는 URL(`steps`, `programs`, `/`, `history`)이 실체는 `.html` — fileExists 에서 `.html` suffix 체크로 검증. `.woff2`: 프로젝트에 웹폰트 없음 — 빈 것은 정상.
- [x] 매니페스트의 각 URL 이 `build/` 안 실파일로 존재. missing=[] 확인. PASS
- [x] `/sw.js` · `/pwa-sw.ts` 는 매니페스트에 없음. PASS
- [x] `/manifest.webmanifest` 는 매니페스트에 존재. PASS

## FR-31.3 — 서비스워커 등록 · 갱신 흐름 미변경

- [x] `src/lib/ui/shell/sw.svelte.ts` 는 이 페이즈에서 편집 0건 (git diff dc84f1e..HEAD 결과 없음).
- [x] `src/lib/ui/shell/sw.svelte.ts:54` 의 `/sw.js` 하드코딩 그대로.
- [ ] `pnpm preview` 로 로컬 서빙 후 브라우저 DevTools: **[배포 후 확인]**

## 브라우저 실물 확인 (수동) — 배포 후 확인

- [ ] Chrome DevTools → Application → Service Workers → "Update on reload" 켠 상태에서 새로고침 시 새 SW 가 정상 활성화.
- [ ] Application → Notifications → "Test push" 로 임의 payload 전송 시 `showNotification` 발동.
- [ ] 오프라인 모드에서 `/`, `/programs`, `/steps`, `/history` 프리캐시 shell 로드.

## 배포 후 대조 (Phase 4 이후 재확인)

- [ ] `deploy/deploy.sh` 실행 시 프리캐시 전수 대조 통과 (`==> 프리캐시 목록 대조` `전부 200`).
      ※ `a3909fa` 에서 정규식 수정 + 0건 실패 처리 완료 — deploy.sh 거짓 통과 방지됨.

## 알림 탭 동작 (FR-35)

- [x] FR-35.1: `notificationclick` 에서 `pickTargetClient` → origin 일치 창 있으면 `focus()`. 유닛 테스트 검증. (src/pwa-sw.ts:75-76)
- [x] FR-35.2: 열린 클라이언트가 없으면 `clients.openWindow('/')`. 유닛 테스트 검증 (null 반환 케이스). (src/pwa-sw.ts:78)

---

## 검증 메모

- 검증 일시: 2026-09-25
- 검증 커밋: `a3909fa` (HEAD)
- `pnpm check`: 0/0/0 (500 files)
- `pnpm test`: 805 passed / 40 files
- `pnpm build`: 성공, `build/sw.js` 39 entries, 276.82 KiB
- `bash tests/deploy/run.sh`: 15 passed / 0 failed
- PLAN 이탈 4건 전부 타당성 확인 완료
