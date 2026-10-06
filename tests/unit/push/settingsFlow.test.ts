// @vitest-environment happy-dom
//
// `/settings` 알림 섹션 — 「알림 켜기」 활성 흐름 회귀 (2026-10-03 Android PWA 버그).
//
// 저장소에는 Svelte 컴포넌트 DOM 테스트 인프라가 없다 (PHASE_4_PLAN 3단계) — 대신
// `+page.svelte` 가 돌리는 refreshState 패턴을 그대로 재현해, `canEnable` 이 올바른
// 활성화를 돌려주는지 확인한다. 핵심:
//   1. `pushState` 초기값은 `'loading'` 이고 `canEnable('loading', ...)` 은 false.
//   2. `pushState = await window.PushRelay.state()` 로 `'off'` 가 들어오면
//      `canEnable('off', true)` 가 true 로 돌아간다.
//
// 회귀의 원인은 `await` 누락이었다 — `pushState = relay.state()` 가 Promise 를
// 그대로 담아 `canEnable(Promise, true)` 가 영원히 false 였다. 이 테스트는
// `await` 를 유지한 할당만 올바르게 동작함을 못박는다.

import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';

import { canEnable } from '../../../src/lib/ui/push/pushUI';
import type { PushState } from '../../../src/lib/ui/push/types';

type RelayState = 'unsupported' | 'denied' | 'off' | 'on';

const stateMock = vi.fn<() => Promise<RelayState>>();

function installRelayGlobal(): void {
  (window as unknown as { PushRelay: unknown }).PushRelay = {
    state: async () => stateMock(),
    enable: async () => 'on',
    disable: async () => 'off',
  };
}

function clearRelayGlobal(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).PushRelay;
}

beforeEach(() => {
  stateMock.mockReset();
  installRelayGlobal();
});

afterEach(() => {
  clearRelayGlobal();
});

describe('/settings refreshState 패턴 — FR-33.3 / EC-77', () => {
  it('초기값 loading 에서는 「알림 켜기」가 비활성 — 「확인 중」 문구 유지', () => {
    const pushState: PushState = 'loading';
    assert.equal(canEnable(pushState, true), false);
  });

  it('state() 를 await 로 받으면 off 가 들어와 프로그램 선택 상태에서 활성화된다', async () => {
    stateMock.mockResolvedValue('off');

    // +page.svelte refreshState 가 하는 것과 같은 할당.
    const relay = window.PushRelay!;
    const pushState: PushState = await relay.state();

    assert.equal(pushState, 'off', 'await 로 받은 값은 문자열 "off" 다');
    assert.equal(canEnable(pushState, true), true, '프로그램 선택 상태에서 「알림 켜기」 활성화');
  });

  it('프로그램 미선택이면 state === "off" 라도 비활성 (EC-77)', async () => {
    stateMock.mockResolvedValue('off');
    const pushState: PushState = await window.PushRelay!.state();
    assert.equal(canEnable(pushState, false), false);
  });

  // 회귀 — await 를 빠뜨리면 pushState 는 Promise 가 된다. canEnable 은 string
  // 매칭이라 Promise 인 입력은 늘 false. 이 테스트는 그 실패 모드를 명시적으로 못박는다.
  it('회귀: await 를 빠뜨리면 pushState 가 Promise 가 돼 canEnable 이 영원히 false', async () => {
    stateMock.mockResolvedValue('off');

    // await 없이 할당 — Android PWA 에서 「알림 켜기」가 비활성이던 과거 상태 재현.
    const rawReturn: unknown = window.PushRelay!.state();
    assert.ok(rawReturn instanceof Promise, 'await 를 빠뜨리면 Promise 가 담긴다');
    const pushStateWrong = rawReturn as unknown as PushState;
    assert.equal(
      canEnable(pushStateWrong, true),
      false,
      'canEnable 은 string 매칭이라 Promise 입력이면 늘 false — 사용자가 영원히 못 켠다',
    );

    // 수정된 흐름 (await 유지) 과 대비.
    const pushStateCorrect: PushState = await window.PushRelay!.state();
    assert.equal(canEnable(pushStateCorrect, true), true);
  });
});
