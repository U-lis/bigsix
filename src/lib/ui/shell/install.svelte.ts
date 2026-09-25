/**
 * PWA 설치 유도 (beforeinstallprompt 가로챔) — FR-16.2 / EC-31 / EC-32.
 *
 * CubeStudy 의 +layout.svelte 에서 installPrompt / install() 로직을 발췌 · 별도
 * 모듈로 분리했다 (참조: ~/Documents/cube-study/src/routes/+layout.svelte:46~60).
 *
 * 브라우저는 설치 팝업을 스스로 띄우지 않는다. `beforeinstallprompt` 를 잡아
 * 보관했다가 사용자가 「설치」 를 눌렀을 때 `prompt()` 를 부른다.
 * 조건 미달·이미 설치·iOS Safari 는 이벤트 자체가 오지 않는다 → `available === false`
 * → 버튼도 안 그린다 (EC-31 / NFR-22).
 *
 * `prompt()` 는 이벤트당 한 번만 쓸 수 있다. 호출 즉시 보관분을 비운다 (EC-32).
 * `appinstalled` 가 오면 보관분을 파기한다.
 */
// SSR / node 테스트 안전 브라우저 판정. `$app/environment` 는 vitest 에서 alias 미해석.
const browser: boolean = typeof window !== 'undefined' && typeof document !== 'undefined';

interface DeferredPrompt {
  prompt: () => Promise<unknown>;
}

class Install {
  /** 설치 프롬프트 가능? beforeinstallprompt 를 받았는가. */
  available = $state(false);

  #deferred: DeferredPrompt | null = null;

  /** 부팅 후 한 번 호출. 이벤트 리스너를 건다. */
  start(): void {
    if (!browser) return;
    window.addEventListener('beforeinstallprompt', (e) => {
      // 막지 않으면 브라우저가 제 타이밍에 처리해 버린다.
      e.preventDefault();
      this.#deferred = e as unknown as DeferredPrompt;
      this.available = true;
    });
    window.addEventListener('appinstalled', () => {
      this.#deferred = null;
      this.available = false;
    });
  }

  /**
   * 설치 프롬프트 발동. `prompt()` 는 이벤트당 1회 (EC-32) — 호출 즉시 비운다.
   * 이후 재호출은 no-op.
   */
  async prompt(): Promise<void> {
    const p = this.#deferred;
    if (p === null) return;
    this.#deferred = null;
    this.available = false;
    try {
      await p.prompt();
    } catch {
      // 사용자가 취소하거나 브라우저가 거부 — 재발동은 없다 (EC-32).
    }
  }
}

export const install = new Install();
