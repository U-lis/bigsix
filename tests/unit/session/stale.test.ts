// SPEC5 Phase 2 — `staleDrafts` 는 날 넘긴 칸만 날짜별로 묶어 돌려준다
// (ADR-48 / FR-2.9 / EC-7a).
//
// 순수 함수라 localStorage 가 필요 없다 — node 환경이면 충분.

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { staleDrafts } from '../../../src/lib/ui/session/stale.ts';
import { draftKey, type SessionDraft } from '../../../src/lib/ui/state/storage.ts';

function makeDraft(progressionId: 'pushup' | 'squat' | 'pullup', startedAt: string): SessionDraft {
  return {
    startedAt,
    progressionId,
    step: 3,
    performedStep: 3,
    kind: 'work',
    workSets: [],
  };
}

describe('staleDrafts — startedAt < today 인 칸만 돌려준다', () => {
  it('오늘보다 이른 날짜의 칸만 포함된다', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: makeDraft('pushup', '2026-10-05'),
      [draftKey('squat', 'work')]: makeDraft('squat', '2026-10-08'),
    };
    const result = staleDrafts(drafts, '2026-10-08');
    assert.deepEqual(Object.keys(result), ['2026-10-05']);
    assert.equal(result['2026-10-05'].length, 1);
    assert.equal(result['2026-10-05'][0].progressionId, 'pushup');
  });

  it('startedAt === today 인 칸은 포함하지 않는다', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: makeDraft('pushup', '2026-10-08'),
    };
    const result = staleDrafts(drafts, '2026-10-08');
    assert.deepEqual(result, {});
  });

  it('startedAt > today 인 칸도 포함하지 않는다 (방어)', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: makeDraft('pushup', '2026-10-09'),
    };
    const result = staleDrafts(drafts, '2026-10-08');
    assert.deepEqual(result, {});
  });

  it('빈 drafts 는 빈 결과', () => {
    assert.deepEqual(staleDrafts({}, '2026-10-08'), {});
  });
});

describe('staleDrafts — 날짜별 묶음', () => {
  it('같은 날짜의 칸들이 한 배열로 묶인다', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: makeDraft('pushup', '2026-10-05'),
      [draftKey('squat', 'work')]: makeDraft('squat', '2026-10-05'),
    };
    const result = staleDrafts(drafts, '2026-10-08');
    assert.deepEqual(Object.keys(result), ['2026-10-05']);
    assert.equal(result['2026-10-05'].length, 2);
  });

  it('다른 날짜의 칸들은 별도 배열로 묶인다', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: makeDraft('pushup', '2026-10-05'),
      [draftKey('squat', 'work')]: makeDraft('squat', '2026-10-06'),
      [draftKey('pullup', 'work')]: makeDraft('pullup', '2026-10-05'),
    };
    const result = staleDrafts(drafts, '2026-10-08');
    assert.deepEqual(Object.keys(result).sort(), ['2026-10-05', '2026-10-06']);
    assert.equal(result['2026-10-05'].length, 2);
    assert.equal(result['2026-10-06'].length, 1);
  });
});
