// @vitest-environment happy-dom
//
// FR-16.2 / EC-31 / EC-32. beforeinstallprompt 이벤트 리스너를 확인한다.

import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';

async function freshMod(): Promise<typeof import('../../src/lib/ui/install.svelte.ts')> {
  vi.resetModules();
  return await import('../../src/lib/ui/install.svelte.ts');
}

function fireBeforeInstallPrompt(promptImpl: () => Promise<unknown>): Event {
  const e: Event & { prompt?: () => Promise<unknown> } = new Event('beforeinstallprompt');
  e.prompt = promptImpl;
  window.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  // 브라우저 이벤트를 재사용하지 않도록 새 window 상태를 목표로.
});

afterEach(() => {
  // 리스너를 청소할 방법은 없지만 각 테스트는 freshMod 로 새 인스턴스라 분리된다.
});

describe('install — FR-16.2 / EC-31 / EC-32', () => {
  it('EC-31: beforeinstallprompt 이벤트가 오지 않으면 available === false', async () => {
    const mod = await freshMod();
    mod.install.start();
    assert.equal(mod.install.available, false);
  });

  it('beforeinstallprompt 이벤트 수신 → available === true', async () => {
    const mod = await freshMod();
    mod.install.start();
    fireBeforeInstallPrompt(async () => undefined);
    assert.equal(mod.install.available, true);
  });

  it('EC-32: prompt() 호출 즉시 보관분을 비운다 (available false)', async () => {
    const mod = await freshMod();
    mod.install.start();
    let called = 0;
    fireBeforeInstallPrompt(async () => { called += 1; });
    await mod.install.prompt();
    assert.equal(called, 1);
    assert.equal(mod.install.available, false);
  });

  it('EC-32: 재호출은 no-op', async () => {
    const mod = await freshMod();
    mod.install.start();
    let called = 0;
    fireBeforeInstallPrompt(async () => { called += 1; });
    await mod.install.prompt();
    await mod.install.prompt();
    assert.equal(called, 1);
  });

  it('appinstalled 이벤트 → 보관분 파기', async () => {
    const mod = await freshMod();
    mod.install.start();
    fireBeforeInstallPrompt(async () => undefined);
    assert.equal(mod.install.available, true);
    window.dispatchEvent(new Event('appinstalled'));
    assert.equal(mod.install.available, false);
  });
});
