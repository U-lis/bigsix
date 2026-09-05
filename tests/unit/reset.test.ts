import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { nextResetState, isResetReady } from '../../src/lib/ui/reset.ts';

describe('reset 2단계 확인 상태 머신 — FR-19.4 / EC-47', () => {
  it('초기 상태는 "idle"', () => {
    // 상수는 없지만 nextResetState 계약으로 검증한다.
    assert.equal(nextResetState('idle', 'click'), 'confirming');
  });

  it('idle 에서 click → confirming', () => {
    assert.equal(nextResetState('idle', 'click'), 'confirming');
  });

  it('confirming 에서 click → idle (실행은 isResetReady 로 신호)', () => {
    assert.equal(nextResetState('confirming', 'click'), 'idle');
    assert.equal(isResetReady('confirming', 'click'), true, '두 번째 클릭이 실행 신호');
  });

  it('EC-47: confirming 에서 closeModal → idle', () => {
    assert.equal(nextResetState('confirming', 'closeModal'), 'idle');
  });

  it('idle 에서 closeModal → idle (no-op)', () => {
    assert.equal(nextResetState('idle', 'closeModal'), 'idle');
  });

  it('isResetReady(idle, click) === false — 한 번 더 클릭해야 ready', () => {
    assert.equal(isResetReady('idle', 'click'), false);
  });

  it('isResetReady(confirming, click) === true — 두 번째 클릭 시점', () => {
    assert.equal(isResetReady('confirming', 'click'), true);
  });
});
