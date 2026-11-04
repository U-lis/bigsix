// 오늘로 옮기기 가드: 열린 칸의 세트가 승급 판정에서 조용히 빠지는 이동을 막는다.

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import type { IsoDate, ProgressionId } from '../../src/lib/domain/types.ts';
import { openDraftBlocksMove } from '../../src/lib/ui/history/moveGuard.ts';
import { draftKey, type SessionDraft } from '../../src/lib/ui/state/storage.ts';
import { syncDoneDrafts } from '../../src/lib/ui/today/done.ts';
import { rec } from './helpers.ts';

const TODAY: IsoDate = '2026-09-30';
const PAST: IsoDate = '2026-09-28';

function draft(
  kind: SessionDraft['kind'], extra: Partial<SessionDraft> = {},
): Record<string, SessionDraft> {
  const d: SessionDraft = {
    startedAt: TODAY,
    progressionId: 'pushup',
    step: 2,
    performedStep: 2,
    kind,
    workSets: [{ value: 10 }],
    ...extra,
  };
  return { [draftKey(d.progressionId, kind)]: d };
}

function blocks(
  drafts: Record<string, SessionDraft>, id: ProgressionId = 'pushup', toDate: IsoDate = TODAY,
): boolean {
  return openDraftBlocksMove(drafts, id, toDate, TODAY);
}

describe('openDraftBlocksMove', () => {
  for (const kind of ['work', 'consolidation'] as const) {
    it(`a today ${kind} draft with a set blocks a move into today`, () => {
      assert.equal(blocks(draft(kind)), true);
    });
  }

  it('a free draft does not block', () => {
    assert.equal(blocks(draft('free')), false);
  });

  it('a draft with no set does not block', () => {
    assert.equal(blocks(draft('work', { workSets: [] })), false);
  });

  it('a draft started on another day does not block', () => {
    assert.equal(blocks(draft('work', { startedAt: PAST })), false);
  });

  it("another progression's draft does not block", () => {
    assert.equal(blocks(draft('work'), 'squat'), false);
  });

  it('a move to a past date does not block, even onto the date the draft started', () => {
    assert.equal(blocks(draft('work'), 'pushup', PAST), false);
    assert.equal(blocks(draft('work', { startedAt: PAST }), 'pushup', PAST), false);
  });

  it('no drafts do not block', () => {
    assert.equal(blocks({}), false);
  });

  // 가드의 근거: 막지 않으면 세트가 있는 칸만 자유 운동으로 넘어간다 (`syncDoneDrafts`).
  it('agrees with what syncDoneDrafts would do once a record is dated today', () => {
    const history = [rec('pushup', 2, [10], { date: TODAY })];
    const withSets = syncDoneDrafts(draft('work'), history, TODAY);
    assert.ok(withSets.some((a) => a.kind === 'move-sets'));
    assert.equal(blocks(draft('work')), true);

    const empty = draft('work', { workSets: [] });
    assert.ok(!syncDoneDrafts(empty, history, TODAY).some((a) => a.kind === 'move-sets'));
    assert.equal(blocks(empty), false);
  });
});
