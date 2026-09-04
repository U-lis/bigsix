/**
 * 서비스 워커 등록·갱신 (FR-11.3 / NFR-6). cube-study 참조.
 *
 * 설치된 PWA 는 홈 화면에서 다시 열어도 브라우저가 sw.js 를 다시 확인할 계기가 없다.
 * 화면이 다시 보일 때마다, 그리고 주기적으로 직접 물어본다.
 *
 * autoUpdate(skipWaiting + clientsClaim) 는 워커만 바꾸고 떠 있는 화면은 옛 JS 다.
 * `controllerchange` 로 한 번 새로고침한다 — 최초 등록은 제외 (그때는 옛 컨트롤러가 없다).
 */

import { browser, dev } from '$app/environment';

const FLAG = 'bigsix.sw.justUpdated';
const POLL_MS = 30 * 60 * 1000;

class ServiceWorkerState {
  justUpdated = $state(false);
  #reg: ServiceWorkerRegistration | null = null;

  constructor() {
    if (!browser) return;
    try {
      if (sessionStorage.getItem(FLAG)) {
        sessionStorage.removeItem(FLAG);
        this.justUpdated = true;
      }
    } catch {
      // 사생활 모드에서 sessionStorage 가 막혀도 앱은 돈다.
    }
  }

  async register(): Promise<void> {
    if (!browser || dev || !('serviceWorker' in navigator)) return;

    const hadController = navigator.serviceWorker.controller !== null;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      try {
        sessionStorage.setItem(FLAG, '1');
      } catch {
        // 표식을 못 남겨도 갱신은 진행한다.
      }
      location.reload();
    });

    // vite-pwa 가 만드는 registerSW.js 는 상대경로라 하위 경로 첫 진입 시 404 가 난다.
    // 절대경로로 직접 등록.
    this.#reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.#update();
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') void this.#update();
    }, POLL_MS);
  }

  async #update(): Promise<void> {
    try {
      await this.#reg?.update();
    } catch {
      // 네트워크 실패는 조용히 넘긴다 — 다음 주기에 다시 시도.
    }
  }
}

export const sw = new ServiceWorkerState();
