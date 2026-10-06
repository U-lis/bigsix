# Phase 1: pwa-injectmanifest

## 상태: 완료

커밋 `07ebe99` · `5225746` 에서 완료.

## 한 일

- `SvelteKitPWA` 를 `generateSW` 에서 `injectManifest` 로 전환하고 커스텀 SW `src/pwa-sw.ts` 를 추가했다.
- 프리캐시 · `ignoreURLParametersMatching` · `navigateFallback` · `controllerchange` 기반 자동 갱신을 등가 재구성했다.
- 출력 파일명을 `sw.js` 로 유지해 `sw.svelte.ts:54` 의 classic 등록과 맞췄다.
- `tests/unit/precache-parity.test.ts` 를 추가해 배포 전 로컬 프리캐시 대조를 자동화했다.
- 빌드 산출 `sw.js` 에 `import` 문이 없음을 확인했다 — classic SW 이므로 `importScripts` 를 쓸 수 있다.

## 완료 체크리스트

- [x] FR-31.1: 프리캐시 · ignoreURLParametersMatching · navigateFallback · autoUpdate 등가 재구성
- [x] FR-31.2: 출력 파일명 `sw.js` 유지
- [x] FR-31.3: 프리캐시 등가성 테스트 추가 (`tests/unit/precache-parity.test.ts`)
- [x] FR-31.4: 빌드 산출 `sw.js` 에 `import` 문 없음
- [x] NFR-30: `deploy/deploy.sh` 에 배포 후 프리캐시 전수 대조 추가
