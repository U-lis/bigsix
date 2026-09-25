/**
 * 화면 자동 꺼짐 방지 (Screen Wake Lock) — FR-16.5 ~ FR-16.7 / EC-33 ~ EC-35.
 *
 * CubeStudy 의 wakelock.svelte.ts 를 이식했다 (참조: ~/Documents/cube-study/src/lib/ui/wakelock.svelte.ts).
 * 계약과 상태 이름은 그대로 유지하고, bigsix 에 없는 설정 항목은 끌어오지 않았다 (FR-16.9).
 *
 * 세션 도중 화면이 꺼지면 세트를 입력하려 손이 다시 화면에 닿아야 한다.
 * 이 기능은 앱이 뜨는 동안 화면이 꺼지지 않게 잡는다. 기본은 꺼짐이고 켠 상태는 저장된다.
 *
 * 잠금은 화면이 가려지면 브라우저가 알아서 해제한다 — visibilitychange 로 다시 잡는다
 * (FR-16.6 / EC-35). 절전 모드 등으로 잠금 요청이 거부되면 enabled 는 켜진 채로
 * 두고 다음 기회에 재시도한다 (EC-34).
 *
 * localStorage 접근은 try/catch 로 감싼다 — 사생활 보호 모드에서도 이번 세션은
 * 정상 동작해야 한다 (FR-16.8 / EC-36).
 */
// SSR / node 테스트에서도 안전하게 로드되도록 window 존재로 브라우저 판정한다.
// (`$app/environment` 는 SvelteKit 런타임 alias 라 순수 vitest 로드에서 해석되지 않는다.)
const browser: boolean = typeof window !== 'undefined' && typeof document !== 'undefined';

const KEY = 'bigsix.wakeLock';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
}

function api(): { request: (t: 'screen') => Promise<WakeLockSentinelLike> } | null {
  if (!browser) return null;
  const wl = (navigator as Navigator & { wakeLock?: unknown }).wakeLock;
  return (wl as { request: (t: 'screen') => Promise<WakeLockSentinelLike> }) ?? null;
}

class WakeLock {
  /** 브라우저가 이 기능을 지원하는가. false 면 토글 자체를 그리지 않는다 (NFR-22 / EC-33). */
  supported = $state(false);
  /** 사용자가 켜두겠다고 한 상태 (FR-16.7). "실제로 잡혀 있는가" 와 구분. */
  enabled = $state(false);
  /** 실제로 잠금이 잡혀 있는가. 켜달라고 해도 거부될 수 있다 (절전 모드 등, EC-34). */
  held = $state(false);

  #sentinel: WakeLockSentinelLike | null = null;

  constructor() {
    if (!browser) return;
    this.supported = api() !== null;
    try {
      this.enabled = localStorage.getItem(KEY) === '1';
    } catch {
      // 저장소가 막혀 있어도 기능 자체는 쓸 수 있어야 한다 (FR-16.8).
    }
  }

  /** 부팅 후 한 번 호출. visibilitychange 리스너를 걸고 저장된 enabled 를 반영한다. */
  start(): void {
    if (!this.supported) return;
    // 화면이 가려지면 브라우저가 잠금을 놓는다. 돌아오면 다시 잡는다 (FR-16.6 / EC-35).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.enabled) void this.#acquire();
      else this.held = false;
    });
    if (this.enabled) void this.#acquire();
  }

  async toggle(): Promise<void> {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(KEY, this.enabled ? '1' : '0');
    } catch {
      // 저장에 실패해도 이번 세션에는 적용된다 (EC-36).
    }
    if (this.enabled) await this.#acquire();
    else await this.#release();
  }

  async #acquire(): Promise<void> {
    if (!this.supported || this.#sentinel !== null) return;
    try {
      const s = await api()!.request('screen');
      this.#sentinel = s;
      this.held = true;
      // 절전 모드 진입 등으로 브라우저가 놓을 수 있다. 상태를 따라간다.
      s.addEventListener('release', () => {
        this.#sentinel = null;
        this.held = false;
      });
    } catch {
      // 배터리 절약 모드 등에서 거부된다 (EC-34).
      // 토글은 켜진 채로 두고 다음 기회에 다시 잡는다.
      this.held = false;
    }
  }

  async #release(): Promise<void> {
    const s = this.#sentinel;
    this.#sentinel = null;
    this.held = false;
    try {
      await s?.release();
    } catch {
      // 이미 해제된 경우
    }
  }
}

export const wakeLock = new WakeLock();
