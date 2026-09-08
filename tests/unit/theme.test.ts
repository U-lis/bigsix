// @vitest-environment happy-dom
//
// FR-16.3 / FR-16.4 / EC-36. localStorage 를 만지므로 happy-dom.

import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';

const KEY = 'bigsix.theme';

async function freshMod(): Promise<typeof import('../../src/lib/ui/theme.svelte.ts')> {
  vi.resetModules();
  return await import('../../src/lib/ui/theme.svelte.ts');
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('theme — FR-16.3 / FR-16.4 / EC-36', () => {
  it('초기 = "system" 이면 dataset.theme 없음', async () => {
    const mod = await freshMod();
    assert.equal(mod.theme.value, 'system');
    assert.equal(document.documentElement.dataset.theme, undefined);
  });

  it('cycle() 순환: system → light → dark → system', async () => {
    const mod = await freshMod();
    assert.equal(mod.theme.value, 'system');
    mod.theme.cycle();
    assert.equal(mod.theme.value, 'light');
    assert.equal(document.documentElement.dataset.theme, 'light');
    mod.theme.cycle();
    assert.equal(mod.theme.value, 'dark');
    assert.equal(document.documentElement.dataset.theme, 'dark');
    mod.theme.cycle();
    assert.equal(mod.theme.value, 'system');
    assert.equal(document.documentElement.dataset.theme, undefined);
  });

  it('set("light") 시 dataset.theme === "light"', async () => {
    const mod = await freshMod();
    mod.theme.set('light');
    assert.equal(document.documentElement.dataset.theme, 'light');
  });

  it('set("dark") 시 dataset.theme === "dark"', async () => {
    const mod = await freshMod();
    mod.theme.set('dark');
    assert.equal(document.documentElement.dataset.theme, 'dark');
  });

  it('set("system") 시 dataset.theme 삭제', async () => {
    const mod = await freshMod();
    mod.theme.set('light');
    mod.theme.set('system');
    assert.equal(document.documentElement.dataset.theme, undefined);
  });

  it('EC-36 / FR-16.8: localStorage 저장 실패해도 세션에는 적용', async () => {
    const mod = await freshMod();
    const orig = window.localStorage.setItem;
    window.localStorage.setItem = () => { throw new Error('막힘'); };
    try {
      mod.theme.cycle();
      assert.equal(mod.theme.value, 'light');
      assert.equal(document.documentElement.dataset.theme, 'light');
    } finally {
      window.localStorage.setItem = orig;
    }
  });

  it('저장된 값 복원 — 새 세션 시작 시 dataset.theme 복원', async () => {
    window.localStorage.setItem(KEY, 'dark');
    const mod = await freshMod();
    assert.equal(mod.theme.value, 'dark');
    assert.equal(document.documentElement.dataset.theme, 'dark');
  });

  it('저장된 값이 이상하면 system 로 폴백', async () => {
    window.localStorage.setItem(KEY, 'weird');
    const mod = await freshMod();
    assert.equal(mod.theme.value, 'system');
  });
});
