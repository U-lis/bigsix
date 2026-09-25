// 종목별 추이 순수 함수 (FR-25.1~4 / EC-57).

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import {
  buildProgressionRows, defaultProgressionId,
} from '../../src/lib/ui/history/progression.ts';
import type {
  IsoDate, SessionRecord, SessionTarget,
} from '../../src/lib/domain/types.ts';
import { ALL_UNLOCKED_STEPS, stateAt } from './helpers.ts';

const D1: IsoDate = '2026-09-01';
const D2: IsoDate = '2026-09-03';
const D3: IsoDate = '2026-09-05';
const D4: IsoDate = '2026-09-07';

function rec(
  date: IsoDate,
  progressionId: SessionRecord['progressionId'],
  step: number,
  sets: number[],
  extra: Partial<SessionRecord> = {},
): SessionRecord {
  return { date, progressionId, step, sets, kind: 'work', ...extra };
}

function targetOf(sets: number, value: number): SessionTarget {
  return {
    goal: { label: 'beginner', sets, value },
    work: Array.from({ length: sets }, () => ({ target: value, mode: 'fixed' as const })),
  };
}

describe('defaultProgressionId — 진입 시 기본 종목 (FR-25.1)', () => {
  it('기록이 있으면 마지막 세션의 progressionId', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      rec(D1, 'pushup', 3, [8, 8]),
      rec(D2, 'squat', 3, [10, 10]),
      rec(D3, 'pullup', 3, [5, 5]),
    ]);
    assert.equal(defaultProgressionId(state), 'pullup');
  });

  it('기록이 없으면 pushup 이 기본', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, []);
    assert.equal(defaultProgressionId(state), 'pushup');
  });
});

describe('buildProgressionRows — 종목 하나의 세션 (FR-25.2~4)', () => {
  it('결과는 최근 세션부터 (내림차순)', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      rec(D1, 'pushup', 3, [8, 8]),
      rec(D2, 'pushup', 3, [9, 9]),
      rec(D3, 'pushup', 3, [10, 10]),
    ]);
    const rows = buildProgressionRows(state, 'pushup');
    assert.deepEqual(rows.map((r) => r.date), [D3, D2, D1]);
  });

  it('다른 종목 세션은 걸러진다', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      rec(D1, 'pushup', 3, [8]),
      rec(D2, 'squat', 3, [10]),
      rec(D3, 'pushup', 3, [9]),
    ]);
    const rows = buildProgressionRows(state, 'pushup');
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.date), [D3, D1]);
  });

  it('total 이 sets 배열 합계', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      rec(D1, 'pushup', 3, [8, 7, 6]),
    ]);
    const rows = buildProgressionRows(state, 'pushup');
    assert.equal(rows[0].total, 21);
  });

  it('저장된 target 이 있고 meetsStandard 참이면 meetsGoal === true', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      // 목표: 2세트 × 8 이상. 실제: 10, 9 → 상위 2세트가 모두 8 이상 → 충족.
      rec(D1, 'pushup', 3, [10, 9], { target: targetOf(2, 8) }),
    ]);
    const rows = buildProgressionRows(state, 'pushup');
    assert.equal(rows[0].meetsGoal, true);
    assert.deepEqual(rows[0].goal, { label: 'beginner', sets: 2, value: 8 });
  });

  it('저장된 target 이 있고 미달이면 meetsGoal === false', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      // 목표: 2세트 × 10. 실제: 8, 7 → 미달.
      rec(D1, 'pushup', 3, [8, 7], { target: targetOf(2, 10) }),
    ]);
    const rows = buildProgressionRows(state, 'pushup');
    assert.equal(rows[0].meetsGoal, false);
  });

  it('target 없는 옛 세션은 meetsGoal · goal 모두 undefined (EC-57)', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      rec(D1, 'pushup', 3, [8, 8]),
    ]);
    const rows = buildProgressionRows(state, 'pushup');
    assert.equal(rows[0].meetsGoal, undefined);
    assert.equal(rows[0].goal, undefined);
  });

  it('첫 세션은 stepBoundary === false', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      rec(D1, 'pushup', 3, [8]),
    ]);
    const rows = buildProgressionRows(state, 'pushup');
    assert.equal(rows[0].stepBoundary, false);
  });

  it('promotedTo 세션 이후 첫 세션이 stepBoundary === true', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      rec(D1, 'pushup', 3, [10, 10]),
      rec(D2, 'pushup', 3, [10, 10], { promotedTo: 4 }),
      rec(D3, 'pushup', 4, [8, 8]),
    ]);
    const rows = buildProgressionRows(state, 'pushup');
    // 최근순: D3, D2, D1
    const [d3, d2, d1] = rows;
    assert.equal(d3.date, D3);
    assert.equal(d3.stepBoundary, true);
    assert.equal(d3.performedStep, 4);
    // D2 는 아직 step 3 세션 — 경계 아님.
    assert.equal(d2.stepBoundary, false);
    // 첫 세션(D1) 도 경계 아님.
    assert.equal(d1.stepBoundary, false);
  });

  it('consolidation 세션은 performedStep = step - 1 이며 stepBoundary 대상', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      rec(D1, 'pushup', 4, [8, 8]),
      rec(D2, 'pushup', 4, [7, 7], { kind: 'consolidation', performedStep: 3 }),
    ]);
    const rows = buildProgressionRows(state, 'pushup');
    // 최근순: D2, D1
    const [d2] = rows;
    assert.equal(d2.date, D2);
    assert.equal(d2.performedStep, 3);
    assert.equal(d2.kind, 'consolidation');
    assert.equal(d2.stepBoundary, true);
  });

  it('빈 기록에서 빈 배열', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, []);
    const rows = buildProgressionRows(state, 'pushup');
    assert.deepEqual(rows, []);
  });
});
