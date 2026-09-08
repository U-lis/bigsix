// 하단 3탭 계산. 순수 함수라 브라우저 환경은 필요 없다.

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { tabsFor } from '../../src/lib/ui/nav.ts';

describe('nav.tabsFor — 하단 3탭 소속/순서/활성', () => {
  it('세 탭이 순서대로 나온다: 오늘 → 프로그램 → 단계', () => {
    const tabs = tabsFor('/');
    assert.equal(tabs.length, 3);
    assert.deepEqual(
      tabs.map((t) => t.href),
      ['/', '/programs', '/steps'],
    );
    assert.deepEqual(
      tabs.map((t) => t.label),
      ['오늘', '프로그램', '단계'],
    );
  });

  it('/ 에서는 "오늘" 만 active', () => {
    const tabs = tabsFor('/');
    assert.deepEqual(
      tabs.map((t) => t.active),
      [true, false, false],
    );
  });

  it('/programs 에서는 "프로그램" 만 active', () => {
    const tabs = tabsFor('/programs');
    assert.deepEqual(
      tabs.map((t) => t.active),
      [false, true, false],
    );
  });

  it('/steps 에서는 "단계" 만 active', () => {
    const tabs = tabsFor('/steps');
    assert.deepEqual(
      tabs.map((t) => t.active),
      [false, false, true],
    );
  });

  it('알 수 없는 경로에서는 아무 것도 active 가 아니지만 탭은 그대로 3개다', () => {
    const tabs = tabsFor('/unknown');
    assert.equal(tabs.length, 3);
    assert.ok(tabs.every((t) => t.active === false));
  });

  it('반환값은 새 배열이라 호출자가 mutate 해도 다음 호출에 영향이 없다', () => {
    const a = tabsFor('/');
    a.pop();
    const b = tabsFor('/');
    assert.equal(b.length, 3);
  });
});
