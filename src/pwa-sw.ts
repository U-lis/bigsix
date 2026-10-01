/**
 * 커스텀 서비스워커 — vite-pwa `injectManifest` 소스 (FR-31 / GLOBAL ADR-35).
 *
 * `generateSW` 시절의 세 옵션은 build-time 옵션에서 사라져 이 파일 안에서
 * 코드로 등가 재구성한다 (NFR-30):
 *   - globPatterns:                    → vite.config.ts `injectManifest.globPatterns` 유지
 *   - ignoreURLParametersMatching:     → `precacheAndRoute` 인자 (b)
 *   - navigateFallback: '/'            → `NavigationRoute` + `createHandlerBoundToURL('/')` (c)
 *   - autoUpdate (skipWaiting/claim):  → 이 파일의 skipWaiting/clients.claim() (d)
 *
 * `sw.svelte.ts` 는 이 페이즈에서 손대지 않는다 — 빌드 출력 파일명이 `sw.js` 로
 * 유지되어 `sw.svelte.ts:54` 의 `/sw.js` 하드코딩과 어긋나지 않는다 (FR-31.3).
 *
 * push · notificationclick 은 이 파일이 갖지 않는다 — push-relay 의 `sw.js` 를
 * importScripts 로 받아 쓴다 (SPEC4 개정 D).
 */

/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// (1) 프리캐시 — generateSW 의 globPatterns + ignoreURLParametersMatching 등가 (NFR-30.a·b).
//     globPatterns 는 build-time (vite.config.ts) 에서 매니페스트에 심어 넣는다.
//     쿼리 파라미터를 전부 무시해야 오프라인에서 `?foo=bar` 같은 딥링크가 프리캐시에 히트한다.
precacheAndRoute(self.__WB_MANIFEST, {
  ignoreURLParametersMatching: [/.*/],
});
cleanupOutdatedCaches();

// (2) SPA 라우팅 fallback — navigateFallback: '/' 등가 (NFR-30.c).
//     프리캐시에 없는 네비게이션 요청은 루트 `/` 로 되돌려 SPA 가 라우팅을 이어간다.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/')));

// (3) autoUpdate — skipWaiting + clientsClaim 등가 (NFR-30.d).
//     `sw.svelte.ts:41` 의 `controllerchange` 자동 새로고침이 여기서 트리거된다.
self.skipWaiting();
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
