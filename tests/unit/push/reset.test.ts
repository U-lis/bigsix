// @vitest-environment happy-dom
//
// 전체 초기화 연동 테스트 (SPEC4 FR-33.10 · ADR-36 · PHASE_4_PLAN 6단계).
//
// `performReset()` 는 기존 동작(앱 상태 초기화 · 진행 중 세션 폐기) 뒤에
// `deletePushRecord()` 를 추가해 `bigsix.push` 를 지운다. 알림 자체의 `disable()`
// 는 `teardownPush()` 가 호출자(`About.svelte`) 에서 선행한다 — 이 테스트는
// 로컬 저장소에서 레코드가 사라지는 것만 확인한다.

import { describe, it, beforeEach } from 'vitest';
import assert from 'node:assert/strict';

import { performReset } from '../../../src/lib/ui/state/reset';
import { PUSH_KEY, writePushRecord } from '../../../src/lib/ui/push/storage';

beforeEach(() => {
  window.localStorage.clear();
});

describe('performReset — 푸시 레코드 삭제 (FR-33.10)', () => {
  it('performReset 실행 후 bigsix.push 가 null 이다', () => {
    writePushRecord({ v: 1, notifyAt: '07:30', sentMeta: '{"v":1}' });
    assert.notEqual(window.localStorage.getItem(PUSH_KEY), null);

    performReset();

    assert.equal(window.localStorage.getItem(PUSH_KEY), null);
  });
});
