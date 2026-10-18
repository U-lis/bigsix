// @vitest-environment happy-dom
//
// reset 2단계 확인 상태 머신 (FR-19.4 / EC-47) + performReset 의 drafts 정리
// (SPEC5 FR-45.5). performReset 쪽은 localStorage 를 만지므로 happy-dom 환경이
// 필요하다.

import { afterEach, beforeEach, describe, it } from 'vitest';
import assert from 'node:assert/strict';

import {
  nextResetState,
  isResetReady,
  performReset,
} from '../../src/lib/ui/state/reset.ts';
import { inProgress } from '../../src/lib/ui/session/session.svelte.ts';
import {
  IN_PROGRESS_KEY,
  draftKey,
  writeInProgress,
  type SessionDraft,
} from '../../src/lib/ui/state/storage.ts';

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

// ── SPEC5 FR-45.5 — performReset 이 drafts 를 전부 비운다 ──────────────────

describe('performReset — drafts 전부 비우기 (SPEC5 FR-45.5)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    inProgress.discardAll();
  });

  afterEach(() => {
    window.localStorage.clear();
    inProgress.discardAll();
  });

  it('진행 중 drafts 가 여러 개 있어도 performReset 후 비어 있다', () => {
    const d1: SessionDraft = {
      startedAt: '2026-10-08',
      progressionId: 'pushup',
      step: 3,
      performedStep: 3,
      kind: 'work',
      workSets: [{ value: 10 }],
    };
    const d2: SessionDraft = {
      startedAt: '2026-10-07',
      progressionId: 'squat',
      step: 4,
      performedStep: 4,
      kind: 'work',
      workSets: [{ value: 15 }],
    };
    // 스토어 자체도 그 drafts 를 안고 있어야 한다 — writeInProgress 는 저장만 하지
    // 스토어 상태를 바꾸지 않는다. init 으로 심어 둔다.
    inProgress.init({
      [draftKey('pushup', 'work')]: d1,
      [draftKey('squat', 'work')]: d2,
    });
    writeInProgress({
      [draftKey('pushup', 'work')]: d1,
      [draftKey('squat', 'work')]: d2,
    });

    performReset();

    assert.deepEqual(inProgress.drafts, {});
    // 저장소에서도 지워져 다음 부팅에 복원되지 않는다.
    assert.equal(window.localStorage.getItem(IN_PROGRESS_KEY), null);
  });

  it('drafts 가 애초에 비어 있어도 performReset 은 조용히 성공한다', () => {
    assert.deepEqual(inProgress.drafts, {});
    performReset();
    assert.deepEqual(inProgress.drafts, {});
  });
});
