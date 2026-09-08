// @vitest-environment happy-dom
//
// FR-16.5 ~ FR-16.7 / EC-33 ~ EC-36. localStorage 를 만지므로 happy-dom.

import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';

const KEY = 'bigsix.wakeLock';

/**
 * navigator.wakeLock 을 조립하는 헬퍼.
 * requestResult 는 request() 가 돌려주는 Promise 의 성격을 정한다.
 */
function stubWakeLock(
  requestResult: 'ok' | 'reject' = 'ok',
): { released: () => boolean; releaseListener: () => void } {
  const releaseListeners: (() => void)[] = [];
  let released = false;
  const sentinel = {
    released: false,
    release: async () => { released = true; },
    addEventListener: (_t: 'release', listener: () => void) => releaseListeners.push(listener),
  };
  (navigator as unknown as { wakeLock: unknown }).wakeLock = {
    request: async () => {
      if (requestResult === 'reject') throw new Error('거부');
      return sentinel;
    },
  };
  return {
    released: () => released,
    releaseListener: () => releaseListeners.forEach((fn) => fn()),
  };
}

async function freshMod(): Promise<typeof import('../../src/lib/ui/wakelock.svelte.ts')> {
  vi.resetModules();
  return await import('../../src/lib/ui/wakelock.svelte.ts');
}

beforeEach(() => {
  window.localStorage.clear();
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
});

afterEach(() => {
  window.localStorage.clear();
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
});

describe('WakeLock — FR-16.5~7 / EC-33~36', () => {
  it('EC-33: navigator.wakeLock 이 없으면 supported === false', async () => {
    const mod = await freshMod();
    assert.equal(mod.wakeLock.supported, false);
  });

  it('supported === true 일 때 toggle() 이 enabled 를 반전한다', async () => {
    stubWakeLock('ok');
    const mod = await freshMod();
    assert.equal(mod.wakeLock.supported, true);
    assert.equal(mod.wakeLock.enabled, false);
    await mod.wakeLock.toggle();
    assert.equal(mod.wakeLock.enabled, true);
    await mod.wakeLock.toggle();
    assert.equal(mod.wakeLock.enabled, false);
  });

  it('EC-34: request() 가 reject 되어도 enabled 는 켜진 채, held 만 false', async () => {
    stubWakeLock('reject');
    const mod = await freshMod();
    await mod.wakeLock.toggle();
    assert.equal(mod.wakeLock.enabled, true, '거부돼도 사용자 의사는 켜짐 그대로');
    assert.equal(mod.wakeLock.held, false, '실제 잠금은 안 잡힘');
  });

  it('EC-35: visibilitychange 로 hidden→visible 복귀 시 다시 잡는다', async () => {
    const stub = stubWakeLock('ok');
    const mod = await freshMod();
    await mod.wakeLock.toggle();
    mod.wakeLock.start();
    // 브라우저가 hidden 진입 시 자동으로 lock 을 놓는 것을 시뮬레이션.
    stub.releaseListener();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(mod.wakeLock.held, false);
    // visible 복귀
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // #acquire 는 async — microtask 를 여러 번 비운다
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(mod.wakeLock.held, true);
  });

  it('EC-36 / FR-16.8: localStorage 저장 실패해도 크래시하지 않는다', async () => {
    stubWakeLock('ok');
    const orig = window.localStorage.setItem;
    window.localStorage.setItem = () => { throw new Error('막힘'); };
    try {
      const mod = await freshMod();
      await mod.wakeLock.toggle();
      assert.equal(mod.wakeLock.enabled, true, '세션에는 적용');
    } finally {
      window.localStorage.setItem = orig;
    }
  });

  it('저장된 값이 있으면 초기화 시 enabled 복원', async () => {
    stubWakeLock('ok');
    window.localStorage.setItem(KEY, '1');
    const mod = await freshMod();
    assert.equal(mod.wakeLock.enabled, true);
  });
});
