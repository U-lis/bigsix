// moveRecordDate: moving one saved record to another date without changing judging (FR-2, FR-3, FR-4).
// All dates are fixed; `today` is always an argument.

import { afterEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getStep } from '../../src/lib/domain/catalog.ts';
import {
  addDays, maintenanceCount, moveRecordDate, stepStreak,
  type MoveRecordRejection, type MoveRecordResult,
} from '../../src/lib/domain/index.ts';
import type {
  AppState, IsoDate, ProgressionId, SessionRecord,
} from '../../src/lib/domain/types.ts';
import { catalog, rec, stateAt } from './helpers.ts';

const TODAY: IsoDate = '2026-09-30';
const ALL_IDS: ProgressionId[] = ['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'];
// Before every fixture date, so the date floor of maintenanceCount never filters a record.
const FLOOR: IsoDate = '2026-01-01';
const STEP = 2;

/** Sets that pass the beginner standard of `step`, so each one advances the streak. */
function passSets(id: ProgressionId, step: number = STEP): number[] {
  const std = getStep(catalog, id, step).beginner as { sets: number; value: number };
  return Array.from({ length: std.sets }, () => std.value);
}

const FAIL_SETS = [1];

function pass(id: ProgressionId, date: IsoDate, extra: Partial<SessionRecord> = {}): SessionRecord {
  return rec(id, STEP, passSets(id), { date, ...extra });
}

function accepted(r: MoveRecordResult): AppState {
  assert.equal(r.ok, true, r.ok ? '' : `rejected: ${r.reason}`);
  return (r as { ok: true; state: AppState }).state;
}

function rejectedWith(r: MoveRecordResult, reason: MoveRecordRejection): void {
  assert.deepEqual(r, { ok: false, reason });
}

function datesOf(state: AppState): IsoDate[] {
  return state.history.map((h) => h.date);
}

/** Judging snapshot FR-4 says a move must not change. */
function judging(state: AppState) {
  return ALL_IDS.map((id) => ({
    id,
    streak: stepStreak(state, catalog, id),
    maintenance: maintenanceCount(
      state.history, id, FLOOR, state.adjustedAtSessionIndex?.[id],
    ),
  }));
}

describe('moveRecordDate: position and fields (FR-2)', () => {
  it('moves a record to an earlier date: only its date changes, order ascends, input is not mutated', () => {
    const history = [
      pass('pushup', '2026-09-10'),
      pass('squat', '2026-09-20'),
      pass('pullup', TODAY),
    ];
    const state = stateAt({}, history);
    const before = structuredClone(state);

    const next = accepted(moveRecordDate(state, 2, '2026-09-15', TODAY));

    assert.deepEqual(datesOf(next), ['2026-09-10', '2026-09-15', '2026-09-20']);
    assert.deepEqual(next.history[1], { ...history[2], date: '2026-09-15' });
    assert.deepEqual(next.history[0], history[0]);
    assert.deepEqual(next.history[2], history[1]);
    assert.deepEqual(state, before);
    assert.notEqual(next, state);
    assert.notEqual(next.history, state.history);
  });

  it('lands after the last record of the target date, moving backward', () => {
    const state = stateAt({}, [
      pass('pushup', '2026-09-10'),
      pass('squat', '2026-09-10'),
      pass('pullup', '2026-09-12'),
      pass('legraise', '2026-09-14'),
    ]);
    const next = accepted(moveRecordDate(state, 3, '2026-09-10', TODAY));
    assert.deepEqual(next.history.map((h) => h.progressionId), ['pushup', 'squat', 'legraise', 'pullup']);
    assert.deepEqual(datesOf(next), ['2026-09-10', '2026-09-10', '2026-09-10', '2026-09-12']);
  });

  it('lands after the last record of the target date, moving forward', () => {
    const state = stateAt({}, [
      pass('legraise', '2026-09-08'),
      pass('pushup', '2026-09-10'),
      pass('squat', '2026-09-10'),
      pass('pullup', '2026-09-12'),
    ]);
    const next = accepted(moveRecordDate(state, 0, '2026-09-10', TODAY));
    assert.deepEqual(next.history.map((h) => h.progressionId), ['pushup', 'squat', 'legraise', 'pullup']);
  });

  it('when the position stays the same, only the date changes and anchors are kept', () => {
    const state: AppState = {
      ...stateAt({}, [
        pass('pushup', '2026-09-10'),
        pass('squat', '2026-09-20'),
      ]),
      adjustedAtSessionIndex: { pushup: 1, squat: 1 },
    };
    const next = accepted(moveRecordDate(state, 1, '2026-09-15', TODAY));
    assert.deepEqual(datesOf(next), ['2026-09-10', '2026-09-15']);
    assert.deepEqual(next.history.map((h) => h.progressionId), ['pushup', 'squat']);
    assert.deepEqual(next.adjustedAtSessionIndex, { pushup: 1, squat: 1 });
  });

  it('keeps completedAt, promotedTo, blockedBy and every other state field', () => {
    const moved = pass('pushup', '2026-09-20', {
      completedAt: '2026-09-20T23:50:00+09:00',
      promotedTo: 3,
      blockedBy: 'rpe',
      rpe: 8,
    });
    const state: AppState = {
      ...stateAt({ pushup: 3 }, [pass('squat', '2026-09-10'), moved], [
        { programId: 'p', selectedAt: '2026-09-01', startedAt: '2026-09-01', endedAt: null },
      ], [
        {
          proposedAt: '2026-09-07', fromProgramId: 'p', toProgramId: 'q',
          status: 'declined', resolvedAt: '2026-09-08',
        },
      ]),
      adjustedTier: { squat: 'intermediate' },
      stepAdjustments: [{
        date: '2026-09-01', progressionId: 'squat', from: 1, to: 2,
        fromTier: 'beginner', toTier: 'intermediate',
      }],
    };
    const next = accepted(moveRecordDate(state, 1, '2026-09-15', TODAY));
    assert.deepEqual(next, {
      ...state,
      history: [state.history[0], { ...moved, date: '2026-09-15' }],
    });
  });
});

describe('moveRecordDate: inverted input follows the position rule (AD-3)', () => {
  const D9: IsoDate = '2026-09-09';
  const D10: IsoDate = '2026-09-10';
  const D11: IsoDate = '2026-09-11';
  const D12: IsoDate = '2026-09-12';
  const D13: IsoDate = '2026-09-13';
  const inverted = () => stateAt({}, [pass('pushup', D10), pass('squat', D9)]);

  it('moving d9 to d11 stays behind d10', () => {
    const next = accepted(moveRecordDate(inverted(), 1, D11, TODAY));
    assert.deepEqual(datesOf(next), [D10, D11]);
    assert.deepEqual(next.history.map((h) => h.progressionId), ['pushup', 'squat']);
  });

  it('moving d9 to d10 stays behind d10', () => {
    const next = accepted(moveRecordDate(inverted(), 1, D10, TODAY));
    assert.deepEqual(datesOf(next), [D10, D10]);
    assert.deepEqual(next.history.map((h) => h.progressionId), ['pushup', 'squat']);
  });

  it('does not sort records it does not move', () => {
    const state = stateAt({}, [
      pass('pushup', D10), pass('squat', D9), pass('pullup', D11),
    ]);
    const next = accepted(moveRecordDate(state, 2, '2026-09-12', TODAY));
    assert.deepEqual(datesOf(next), [D10, D9, '2026-09-12']);
  });

  it('a real reposition corrects crossed anchors and keeps FR-4 judging equal', () => {
    const state: AppState = {
      ...stateAt({}, [
        pass('pushup', D12), pass('squat', D10), pass('pullup', D9), pass('legraise', D13),
      ]),
      adjustedAtSessionIndex: { squat: 1, pullup: 2, legraise: 3 },
    };
    const next = accepted(moveRecordDate(state, 0, D9, TODAY));
    assert.deepEqual(
      next.history.map((h) => h.progressionId), ['squat', 'pullup', 'pushup', 'legraise'],
    );
    assert.deepEqual(datesOf(next), [D10, D9, D9, D13]);
    assert.deepEqual(next.adjustedAtSessionIndex, { squat: 0, pullup: 1, legraise: 3 });
    assert.deepEqual(judging(next), judging(state));
  });
});

describe('moveRecordDate: landing before a same-date same-progression record', () => {
  const D10: IsoDate = '2026-09-10';
  const D11: IsoDate = '2026-09-11';
  const D12: IsoDate = '2026-09-12';
  const D13: IsoDate = '2026-09-13';

  it('abandoned then consolidation on one day goes out and comes back, judging equal throughout', () => {
    const T: IsoDate = '2026-09-20';
    const Y: IsoDate = addDays(T, -1);
    const start = stateAt({}, [
      pass('pushup', T, { outcome: 'abandoned' }),
      pass('pushup', T, { kind: 'consolidation' }),
    ]);
    const before = judging(start);

    const s1 = accepted(moveRecordDate(start, 0, Y, TODAY));
    const s2 = accepted(moveRecordDate(s1, 1, Y, TODAY));
    const s3 = accepted(moveRecordDate(s2, 1, T, TODAY));
    const s4 = accepted(moveRecordDate(s3, 0, T, TODAY));

    for (const s of [s1, s2, s3, s4]) {
      assert.deepEqual(s.steps, start.steps);
      assert.deepEqual(judging(s), before);
    }
    assert.deepEqual(s4.history, start.history);
  });

  it('lands immediately before the first such record, past other progressions', () => {
    const state = stateAt({}, [
      pass('pushup', D10), pass('squat', D11), pass('pushup', D12), pass('pushup', D12),
      pass('squat', D12),
    ]);
    const next = accepted(moveRecordDate(state, 0, D12, TODAY));
    assert.deepEqual(next.history.map((h) => h.progressionId), [
      'squat', 'pushup', 'pushup', 'pushup', 'squat',
    ]);
    assert.deepEqual(datesOf(next), [D11, D12, D12, D12, D12]);
    assert.equal(next.history[2], state.history[2]);
  });

  it('a same-progression record dated before the target in the span is still rejected', () => {
    const state = stateAt({}, [pass('pushup', D10), pass('pushup', D11), pass('pushup', D12)]);
    rejectedWith(moveRecordDate(state, 0, D12, TODAY), 'crosses-same-progression');
  });

  it('a free moved record keeps the old rule and lands after', () => {
    const state = stateAt({}, [pass('pushup', D10, { kind: 'free' }), pass('pushup', D12)]);
    const next = accepted(moveRecordDate(state, 0, D12, TODAY));
    assert.equal(next.history[0], state.history[1]);
    assert.equal(next.history[1].kind, 'free');
  });

  it('a free or other-progression record on the target date is not a landing point', () => {
    const free = stateAt({}, [pass('pushup', D10), pass('pushup', D12, { kind: 'free' })]);
    assert.equal(accepted(moveRecordDate(free, 0, D12, TODAY)).history[0], free.history[1]);
    const other = stateAt({}, [pass('pushup', D10), pass('squat', D12)]);
    assert.equal(accepted(moveRecordDate(other, 0, D12, TODAY)).history[0], other.history[1]);
  });

  it('a same-date record before the old index is not a landing point', () => {
    const state = stateAt({}, [pass('pushup', D12), pass('pushup', D10)]);
    const next = accepted(moveRecordDate(state, 1, D12, TODAY));
    assert.equal(next.history[0], state.history[0]);
    assert.deepEqual(datesOf(next), [D12, D12]);
  });

  it('a date-backward move keeps the old rule even when the record after it has the target date', () => {
    const state = stateAt({}, [pass('pushup', D12), pass('pushup', D10)]);
    rejectedWith(moveRecordDate(state, 0, D10, TODAY), 'crosses-same-progression');
  });

  describe('anchors use the final position', () => {
    // 옮긴 기록은 인덱스 1 에 앉는다. 옛 규칙이라면 인덱스 2 까지 갔을 자리다.
    const history = () => [pass('pushup', D10), pass('squat', D11), pass('pushup', D12), pass('squat', D13)];

    it('own anchor between the new and the old position is not crossed and stays', () => {
      const state: AppState = { ...stateAt({}, history()), adjustedAtSessionIndex: { pushup: 2 } };
      const next = accepted(moveRecordDate(state, 0, D12, TODAY));
      assert.deepEqual(next.adjustedAtSessionIndex, { pushup: 2 });
      assert.deepEqual(judging(next), judging(state));
    });

    it('own anchor at the new position is rejected', () => {
      const state: AppState = { ...stateAt({}, history()), adjustedAtSessionIndex: { pushup: 1 } };
      rejectedWith(moveRecordDate(state, 0, D12, TODAY), 'crosses-adjustment');
    });

    it("another progression's anchor shifts only up to the new position", () => {
      for (const [a, shifted] of [[1, 0], [2, 2]] as const) {
        const state: AppState = { ...stateAt({}, history()), adjustedAtSessionIndex: { squat: a } };
        const next = accepted(moveRecordDate(state, 0, D12, TODAY));
        assert.deepEqual(next.adjustedAtSessionIndex, { squat: shifted });
        assert.deepEqual(judging(next), judging(state));
      }
    });
  });
});

describe('moveRecordDate: rejections (FR-3)', () => {
  const two = () => stateAt({}, [pass('pushup', '2026-09-10'), pass('squat', '2026-09-20')]);

  for (const index of [-1, 2, 1.5, NaN]) {
    it(`index ${index} returns invalid-index and leaves state alone`, () => {
      const state = two();
      const before = structuredClone(state);
      rejectedWith(moveRecordDate(state, index, '2026-09-15', TODAY), 'invalid-index');
      assert.deepEqual(state, before);
    });
  }

  for (const toDate of ['', '2026-2-3', '2026-02-30', '2026-13-01', '20260901', '2026-09-01T00:00', '12026-01-01']) {
    it(`date "${toDate}" returns invalid-date and leaves state alone`, () => {
      const state = two();
      const before = structuredClone(state);
      rejectedWith(moveRecordDate(state, 0, toDate, TODAY), 'invalid-date');
      assert.deepEqual(state, before);
    });
  }

  it('a date after today returns future; today itself is allowed', () => {
    rejectedWith(moveRecordDate(two(), 0, addDays(TODAY, 1), TODAY), 'future');
    const next = accepted(moveRecordDate(two(), 1, TODAY, TODAY));
    assert.equal(next.history[1].date, TODAY);
  });

  it('the record\'s own date returns same-date', () => {
    rejectedWith(moveRecordDate(two(), 0, '2026-09-10', TODAY), 'same-date');
  });

  it('crossing another work record of the same progression is rejected, forward and backward', () => {
    const state = stateAt({}, [
      pass('pushup', '2026-09-10'), pass('pushup', '2026-09-12'), pass('pushup', '2026-09-14'),
    ]);
    rejectedWith(moveRecordDate(state, 0, '2026-09-13', TODAY), 'crosses-same-progression');
    rejectedWith(moveRecordDate(state, 2, '2026-09-11', TODAY), 'crosses-same-progression');
  });

  it('a same-progression record exactly at old index j blocks in both directions', () => {
    const state = stateAt({}, [
      pass('pushup', '2026-09-10'), pass('squat', '2026-09-12'), pass('pushup', '2026-09-14'),
      pass('squat', '2026-09-16'), pass('pushup', '2026-09-18'),
    ]);
    // Forward i=0, j=2: the same-progression record is at old index j.
    rejectedWith(moveRecordDate(state, 0, '2026-09-15', TODAY), 'crosses-same-progression');
    // Backward i=4, j=2: the same-progression record is at old index j.
    rejectedWith(moveRecordDate(state, 4, '2026-09-13', TODAY), 'crosses-same-progression');
  });

  it('crossing a consolidation record of the same progression is rejected', () => {
    const state = stateAt({}, [
      pass('pushup', '2026-09-10'),
      pass('pushup', '2026-09-12', { kind: 'consolidation' }),
    ]);
    rejectedWith(moveRecordDate(state, 0, '2026-09-13', TODAY), 'crosses-same-progression');
  });

  it('stopping next to a same-progression record without passing it is allowed', () => {
    const state = stateAt({}, [
      pass('pushup', '2026-09-10'), pass('squat', '2026-09-12'), pass('pushup', '2026-09-14'),
    ]);
    const next = accepted(moveRecordDate(state, 0, '2026-09-13', TODAY));
    assert.deepEqual(next.history.map((h) => h.progressionId), ['squat', 'pushup', 'pushup']);
  });

  it('crossing only a free record of another progression is allowed', () => {
    const state = stateAt({}, [
      pass('pushup', '2026-09-10'),
      pass('squat', '2026-09-12', { kind: 'free' }),
    ]);
    const next = accepted(moveRecordDate(state, 0, '2026-09-13', TODAY));
    assert.deepEqual(datesOf(next), ['2026-09-12', '2026-09-13']);
  });

  it('a work record crossing a free record of its own progression is allowed', () => {
    const state = stateAt({}, [
      pass('pushup', '2026-09-10'),
      pass('pushup', '2026-09-12', { kind: 'free' }),
    ]);
    const next = accepted(moveRecordDate(state, 0, '2026-09-13', TODAY));
    assert.deepEqual(next.history.map((h) => h.kind), ['free', 'work']);
    assert.deepEqual(judging(next), judging(state));
  });

  describe('check order: the earliest failing reason wins', () => {
    const blocked = (): AppState => ({
      ...stateAt({}, [
        pass('pushup', '2026-09-10'), pass('pushup', '2026-09-12'), pass('squat', '2026-09-14'),
      ]),
      adjustedAtSessionIndex: { pushup: 1 },
    });

    it('invalid-index before invalid-date', () => {
      rejectedWith(moveRecordDate(blocked(), 9, 'nope', TODAY), 'invalid-index');
    });
    it('invalid-date before future', () => {
      rejectedWith(moveRecordDate(blocked(), 0, '2999-02-30', TODAY), 'invalid-date');
    });
    it('future before same-date', () => {
      const state = stateAt({}, [pass('pushup', '2026-10-05')]);
      rejectedWith(moveRecordDate(state, 0, '2026-10-05', TODAY), 'future');
    });
    it('same-date before crossing checks', () => {
      rejectedWith(moveRecordDate(blocked(), 0, '2026-09-10', TODAY), 'same-date');
    });
    it('crosses-same-progression before crosses-adjustment', () => {
      rejectedWith(moveRecordDate(blocked(), 0, '2026-09-13', TODAY), 'crosses-same-progression');
    });
  });
});

describe('moveRecordDate: anchors (FR-4, AD-4)', () => {
  const N = 6;
  const OWN: ProgressionId = 'pushup';
  const OTHER: ProgressionId = 'squat';

  /** n records two days apart; the moved one is `OWN`, the rest `OTHER`, all passing. */
  function fixture(i: number, kind: SessionRecord['kind'] = 'work'): SessionRecord[] {
    return Array.from({ length: N }, (_, k) => pass(
      k === i ? OWN : OTHER,
      addDays('2026-09-10', k * 2),
      k === i ? { kind } : {},
    ));
  }

  /** A date that makes the position rule produce exactly `j` for the record at `i`. */
  function dateFor(history: SessionRecord[], i: number, j: number): IsoDate {
    const rest = history.filter((_, k) => k !== i);
    return j === 0 ? addDays(rest[0].date, -1) : addDays(rest[j - 1].date, 1);
  }

  const ROWS: {
    name: string; i: number; j: number; a: number; shifted: number; ownRejected: boolean;
  }[] = [
    { name: 'forward a=0', i: 1, j: 3, a: 0, shifted: 0, ownRejected: false },
    { name: 'forward a=i', i: 1, j: 3, a: 1, shifted: 1, ownRejected: false },
    { name: 'forward a=i+1', i: 1, j: 3, a: 2, shifted: 1, ownRejected: true },
    { name: 'forward a=j', i: 1, j: 3, a: 3, shifted: 2, ownRejected: true },
    { name: 'forward a=j+1', i: 1, j: 3, a: 4, shifted: 4, ownRejected: false },
    { name: 'forward a=n with j=n-1', i: 1, j: 5, a: 6, shifted: 6, ownRejected: false },
    { name: 'backward a=0 with j=0', i: 4, j: 0, a: 0, shifted: 0, ownRejected: false },
    { name: 'backward a=j', i: 4, j: 2, a: 2, shifted: 2, ownRejected: false },
    { name: 'backward a=j+1', i: 4, j: 2, a: 3, shifted: 4, ownRejected: true },
    { name: 'backward a=i', i: 4, j: 2, a: 4, shifted: 5, ownRejected: true },
    { name: 'backward a=i+1', i: 4, j: 2, a: 5, shifted: 5, ownRejected: false },
    { name: 'backward a=n', i: 4, j: 2, a: 6, shifted: 6, ownRejected: false },
  ];

  for (const row of ROWS) {
    it(`${row.name}: another progression's anchor ${row.a} becomes ${row.shifted}, streak equal`, () => {
      const history = fixture(row.i);
      const state: AppState = { ...stateAt({}, history), adjustedAtSessionIndex: { [OTHER]: row.a } };
      const next = accepted(moveRecordDate(state, row.i, dateFor(history, row.i, row.j), TODAY));
      assert.equal(next.history[row.j].progressionId, OWN);
      assert.deepEqual(next.adjustedAtSessionIndex, { [OTHER]: row.shifted });
      assert.deepEqual(stepStreak(next, catalog, OTHER), stepStreak(state, catalog, OTHER));
    });

    it(`${row.name}: own anchor ${row.a} is ${row.ownRejected ? 'rejected' : 'allowed and unchanged'}`, () => {
      const history = fixture(row.i);
      const state: AppState = { ...stateAt({}, history), adjustedAtSessionIndex: { [OWN]: row.a } };
      const r = moveRecordDate(state, row.i, dateFor(history, row.i, row.j), TODAY);
      if (row.ownRejected) {
        rejectedWith(r, 'crosses-adjustment');
      } else {
        const next = accepted(r);
        assert.deepEqual(next.adjustedAtSessionIndex, { [OWN]: row.a });
        assert.deepEqual(stepStreak(next, catalog, OWN), stepStreak(state, catalog, OWN));
      }
    });

    it(`${row.name}: a free record's own anchor ${row.a} shifts to ${row.shifted} and is never rejected`, () => {
      const history = fixture(row.i, 'free');
      const state: AppState = { ...stateAt({}, history), adjustedAtSessionIndex: { [OWN]: row.a } };
      const next = accepted(moveRecordDate(state, row.i, dateFor(history, row.i, row.j), TODAY));
      assert.deepEqual(next.adjustedAtSessionIndex, { [OWN]: row.shifted });
      assert.deepEqual(stepStreak(next, catalog, OWN), stepStreak(state, catalog, OWN));
    });
  }

  it('a free record crossing a same-progression record and its own anchor is allowed', () => {
    const state: AppState = {
      ...stateAt({}, [
        pass('pushup', '2026-09-10', { kind: 'free' }),
        pass('pushup', '2026-09-12'),
        pass('pushup', '2026-09-14'),
      ]),
      adjustedAtSessionIndex: { pushup: 1 },
    };
    const next = accepted(moveRecordDate(state, 0, '2026-09-13', TODAY));
    assert.deepEqual(next.history.map((h) => h.kind), ['work', 'free', 'work']);
    assert.deepEqual(next.adjustedAtSessionIndex, { pushup: 0 });
    assert.deepEqual(stepStreak(next, catalog, 'pushup'), stepStreak(state, catalog, 'pushup'));
  });

  it('absent adjustedAtSessionIndex stays absent', () => {
    const state = stateAt({}, [pass('pushup', '2026-09-10'), pass('squat', '2026-09-12')]);
    const next = accepted(moveRecordDate(state, 0, '2026-09-13', TODAY));
    assert.equal('adjustedAtSessionIndex' in next, false);
  });

  it('a progression with no anchor gets no key when another anchor shifts', () => {
    const state: AppState = {
      ...stateAt({}, [pass('pushup', '2026-09-10'), pass('squat', '2026-09-12')]),
      adjustedAtSessionIndex: { squat: 1 },
    };
    const next = accepted(moveRecordDate(state, 0, '2026-09-13', TODAY));
    assert.deepEqual(next.adjustedAtSessionIndex, { squat: 0 });
  });

  it('does not mutate the input anchors object', () => {
    const anchors = { squat: 1 };
    const state: AppState = {
      ...stateAt({}, [pass('pushup', '2026-09-10'), pass('squat', '2026-09-12')]),
      adjustedAtSessionIndex: anchors,
    };
    accepted(moveRecordDate(state, 0, '2026-09-13', TODAY));
    assert.deepEqual(anchors, { squat: 1 });
  });

  it('moving a promotedTo record leaves steps and judging unchanged', () => {
    const state = stateAt({ pushup: 3 }, [
      pass('squat', '2026-09-10'),
      pass('pushup', '2026-09-12', { promotedTo: 3 }),
      rec('pushup', 3, passSets('pushup', 3), { date: '2026-09-14' }),
    ]);
    const next = accepted(moveRecordDate(state, 1, '2026-09-09', TODAY));
    assert.equal(next.history[0].promotedTo, 3);
    assert.deepEqual(next.steps, state.steps);
    assert.deepEqual(judging(next), judging(state));
  });
});

describe('moveRecordDate: exhaustive FR-4 over a small fixture', () => {
  // Mixed pass, fail, free, consolidation and promotion so a wrong order or scope changes a number.
  const HISTORY: SessionRecord[] = [
    pass('pushup', '2026-09-01'),
    pass('squat', '2026-09-03'),
    pass('pushup', '2026-09-05', { kind: 'free' }),
    pass('squat', '2026-09-07', { kind: 'consolidation' }),
    pass('pushup', '2026-09-09', { promotedTo: 3 }),
    rec('squat', STEP, FAIL_SETS, { date: '2026-09-11' }),
    rec('pushup', 3, passSets('pushup', 3), { date: '2026-09-13' }),
    pass('squat', '2026-09-15'),
    // 같은 날 같은 종목 묶음. 옮긴 기록이 이 앞에 내려앉는 경로를 전수로 지난다.
    rec('pushup', 3, passSets('pushup', 3), { date: '2026-09-17', outcome: 'abandoned' }),
    rec('pushup', 3, passSets('pushup', 3), { date: '2026-09-17', kind: 'consolidation' }),
  ];
  const ANCHORS: (number | undefined)[] = [undefined, ...HISTORY.keys(), HISTORY.length];
  // Before the first, on every date, and between every pair, after the last.
  const TARGETS: IsoDate[] = Array.from({ length: 19 }, (_, k) => addDays('2026-08-31', k));

  it('every accepted move keeps streak, steps and maintenance count; both shift directions occur', () => {
    let acceptedCount = 0;
    let forwardShifts = 0;
    let backwardShifts = 0;
    let sameDateLandings = 0;
    const reasons = new Set<MoveRecordRejection>();

    for (const pushupAnchor of ANCHORS) {
      for (const squatAnchor of ANCHORS) {
        const anchors: AppState['adjustedAtSessionIndex'] = {};
        if (pushupAnchor !== undefined) anchors.pushup = pushupAnchor;
        if (squatAnchor !== undefined) anchors.squat = squatAnchor;
        const state: AppState = {
          ...stateAt({ pushup: 3, squat: STEP }, HISTORY),
          adjustedAtSessionIndex: anchors,
        };
        const before = judging(state);

        for (let i = 0; i < HISTORY.length; i += 1) {
          for (const toDate of TARGETS) {
            const r = moveRecordDate(state, i, toDate, TODAY);
            if (!r.ok) {
              reasons.add(r.reason);
              continue;
            }
            acceptedCount += 1;
            const label: string = `i=${i} to=${toDate} anchors=${JSON.stringify(anchors)}`;
            assert.deepEqual(judging(r.state), before, label);
            assert.deepEqual(r.state.steps, state.steps, label);
            const follower = r.state.history[r.state.history.findIndex((h) => !HISTORY.includes(h)) + 1];
            if (HISTORY[i].kind !== 'free' && follower?.kind !== 'free' && follower?.date === toDate
              && follower.progressionId === HISTORY[i].progressionId) {
              sameDateLandings += 1;
            }
            for (const id of ['pushup', 'squat'] as const) {
              const from = anchors[id];
              const to = r.state.adjustedAtSessionIndex?.[id];
              if (from === undefined || to === undefined) continue;
              if (to < from) forwardShifts += 1;
              if (to > from) backwardShifts += 1;
            }
          }
        }
      }
    }

    // Guards against a fixture that stops exercising the rule.
    assert.ok(acceptedCount > 0);
    assert.ok(forwardShifts > 0);
    assert.ok(backwardShifts > 0);
    assert.ok(sameDateLandings > 0);
    assert.deepEqual(
      [...reasons].sort(),
      ['crosses-adjustment', 'crosses-same-progression', 'same-date'],
    );
  });
});

describe('moveRecordDate: no system clock (NFR-3)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('decides future from the today argument, whatever the system clock says', () => {
    const state = stateAt({}, [pass('pushup', '2026-09-10')]);

    vi.useFakeTimers({ now: Date.UTC(2000, 0, 1) });
    accepted(moveRecordDate(state, 0, '2026-09-05', TODAY));

    vi.setSystemTime(Date.UTC(2099, 0, 1));
    rejectedWith(moveRecordDate(state, 0, addDays(TODAY, 1), TODAY), 'future');
  });

  it('records.ts reads no clock', () => {
    const source = readFileSync(
      new URL('../../src/lib/domain/records.ts', import.meta.url), 'utf8',
    );
    assert.doesNotMatch(source, /Date\.now|new Date/);
  });
});
