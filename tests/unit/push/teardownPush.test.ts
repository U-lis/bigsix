// @vitest-environment happy-dom
//
// `teardownPush` — 전체 초기화의 선행 단계 테스트
// (SPEC4 FR-33.10 · ADR-36 · PHASE_4_PLAN 2단계).
//
// 2026-10-03 Android PWA 회귀 — 과거 `PushRelayGlobal.state()` 를 동기로 타입했기에
// 호출자가 `relay.state() === 'on'` 을 await 없이 비교했고 Promise 와 문자열이
// 영원히 다르다는 이유로 `disable()` 이 호출되지 않았다 — 즉 「전체 초기화」에서
// 릴레이 구독이 끊기지 않았다. 이 테스트는 state 를 비동기로만 돌려주며 그래도
// `disable()` 이 호출됨을 확인해 async/sync 미스매치가 다시 숨지 못하게 한다.

import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';

type PushState = 'unsupported' | 'denied' | 'off' | 'on';

const stateMock = vi.fn<() => Promise<PushState>>();
const enableMock = vi.fn<(meta: unknown) => Promise<'on'>>();
const disableMock = vi.fn<() => Promise<'off'>>();

function installRelayGlobal(): void {
  (window as unknown as { PushRelay: unknown }).PushRelay = {
    state: async () => stateMock(),
    enable: async (meta: unknown) => enableMock(meta),
    disable: async () => disableMock(),
  };
}

function clearRelayGlobal(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).PushRelay;
}

beforeEach(() => {
  stateMock.mockReset();
  enableMock.mockReset();
  disableMock.mockReset();
  disableMock.mockResolvedValue('off');
  enableMock.mockResolvedValue('on');
});

afterEach(() => {
  clearRelayGlobal();
});

describe('teardownPush — FR-33.10 / ADR-36', () => {
  it('PushRelay 전역이 없으면 즉시 반환한다 (한 번도 켠 적 없는 사용자)', async () => {
    clearRelayGlobal();

    const { teardownPush } = await import('../../../src/lib/ui/push/relay');
    await teardownPush();

    assert.equal(stateMock.mock.calls.length, 0);
    assert.equal(disableMock.mock.calls.length, 0);
  });

  it('state === "on" 이면 disable() 를 1회 호출한다', async () => {
    installRelayGlobal();
    stateMock.mockResolvedValue('on');

    const { teardownPush } = await import('../../../src/lib/ui/push/relay');
    await teardownPush();

    assert.equal(stateMock.mock.calls.length, 1);
    assert.equal(disableMock.mock.calls.length, 1, 'state === "on" 이면 disable 이 호출된다');
  });

  it.each(['off', 'denied', 'unsupported'] as const)(
    'state === "%s" 이면 disable() 를 호출하지 않는다',
    async (s) => {
      installRelayGlobal();
      stateMock.mockResolvedValue(s);

      const { teardownPush } = await import('../../../src/lib/ui/push/relay');
      await teardownPush();

      assert.equal(disableMock.mock.calls.length, 0);
    },
  );

  // 회귀 테스트 ── 2026-10-03 Android PWA 버그
  // state() 가 다음 틱에서 'on' 으로 resolve 되는 느린 Promise 를 돌려준다. 코드가
  // await 를 유지하지 않으면 Promise 자체는 'on' 과 다르므로 disable 이 호출되지
  // 않는다. 즉 await 가 빠진 과거 상태라면 이 테스트가 0 호출로 실패한다.
  it('회귀: state() 가 비동기로만 resolve 돼도 await 를 유지하면 disable 이 호출된다', async () => {
    installRelayGlobal();
    stateMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('on'), 0)),
    );

    const { teardownPush } = await import('../../../src/lib/ui/push/relay');
    await teardownPush();

    assert.equal(
      disableMock.mock.calls.length,
      1,
      'state() 결과를 await 하지 않으면 Promise !== "on" 분기로 빠져 0 이 된다',
    );
  });

  it('state() 가 reject 해도 밖으로 던지지 않는다 (초기화 흐름 보호)', async () => {
    installRelayGlobal();
    stateMock.mockRejectedValue(new Error('boom'));

    const { teardownPush } = await import('../../../src/lib/ui/push/relay');
    await assert.doesNotReject(async () => teardownPush());
    assert.equal(disableMock.mock.calls.length, 0);
  });

  it('disable() 가 reject 해도 밖으로 던지지 않는다', async () => {
    installRelayGlobal();
    stateMock.mockResolvedValue('on');
    disableMock.mockRejectedValue(new Error('network'));

    const { teardownPush } = await import('../../../src/lib/ui/push/relay');
    await assert.doesNotReject(async () => teardownPush());
    assert.equal(disableMock.mock.calls.length, 1);
  });
});
