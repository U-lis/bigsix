// 날짜별 목록 계산 (FR-24.2~6 / EC-58 / EC-66).

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { moveRecordDate } from '../../src/lib/domain/index.ts';
import { buildDayRows, type DayRow } from '../../src/lib/ui/history/dayList.ts';
import type {
  AppState, IsoDate, ProgramStint, SessionRecord, SwitchProposal,
} from '../../src/lib/domain/types.ts';
import { ALL_UNLOCKED_STEPS, catalog, stateAt, stintFixture } from './helpers.ts';

// ── 날짜 기준점 (2026-08-31 = 월) ────────────────────────────────────────────
// 2026-08-31(월) 09-01(화) 02(수) 03(목) 04(금) 05(토) 06(일) 07(월) ...
const MON = '2026-08-31';
const TUE = '2026-09-01';
const WED = '2026-09-02';
const THU = '2026-09-03';
const FRI = '2026-09-04';

function stintAt(programId: string, selectedAt: IsoDate, startedAt: IsoDate): ProgramStint {
  return { programId, selectedAt, startedAt, endedAt: null };
}

function acceptedProposal(from: string, to: string, resolvedAt: IsoDate): SwitchProposal {
  return {
    proposedAt: resolvedAt,
    fromProgramId: from,
    toProgramId: to,
    status: 'accepted',
    resolvedAt,
  };
}

function rec(
  date: IsoDate, id: SessionRecord['progressionId'], sets: number[] = [5, 5],
  extra: Partial<SessionRecord> = {},
): SessionRecord {
  return { date, progressionId: id, step: 2, sets, kind: 'work', ...extra };
}

describe('buildDayRows — 날짜별 목록 조합 (FR-24.2~6)', () => {
  it('reviewDay().status 를 그대로 노출한다', () => {
    // good_behavior: 월수금 훈련 · 화목토일 휴식.
    // 월요일은 훈련일 결석 → missed. 화요일은 계획 없음 → rest.
    // 수요일은 훈련일 · 아무것도 안 함 → missed.
    const state = stateAt(
      ALL_UNLOCKED_STEPS,
      [],
      [stintAt('good_behavior', MON, MON)],
    );
    const rows = buildDayRows(state, catalog, { from: MON, to: WED });
    const byDate = Object.fromEntries(rows.map((r) => [r.review.date, r]));
    assert.equal(byDate[MON].review.status, 'missed');
    assert.equal(byDate[TUE].review.status, 'rest');
    assert.equal(byDate[WED].review.status, 'missed');
    assert.equal(byDate[MON].weekday, '월');
    assert.equal(byDate[TUE].weekday, '화');
  });

  it('그날 stint.startedAt 이면 stintStartedOn 이 채워진다', () => {
    const state = stateAt(
      ALL_UNLOCKED_STEPS,
      [],
      [stintAt('good_behavior', MON, MON)],
    );
    const rows = buildDayRows(state, catalog, { from: MON, to: MON });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].stintStartedOn?.programId, 'good_behavior');
    assert.equal(rows[0].proposalAcceptedOn, null);
  });

  it('그날 accepted proposal.resolvedAt 이면 proposalAcceptedOn 이 채워진다', () => {
    const state = stateAt(
      ALL_UNLOCKED_STEPS,
      [],
      [
        stintFixture('good_behavior', MON, MON, THU),
        stintAt('veterano', THU, THU),
      ],
      [acceptedProposal('good_behavior', 'veterano', THU)],
    );
    const rows = buildDayRows(state, catalog, { from: THU, to: THU });
    assert.equal(rows[0].proposalAcceptedOn?.toProgramId, 'veterano');
    // 같은 날 새 구간도 시작됐다.
    assert.equal(rows[0].stintStartedOn?.programId, 'veterano');
  });

  it('pending / declined proposal 은 proposalAcceptedOn 에 잡히지 않는다', () => {
    const state = stateAt(
      ALL_UNLOCKED_STEPS,
      [],
      [stintAt('good_behavior', MON, MON)],
      [
        {
          proposedAt: TUE, fromProgramId: 'good_behavior', toProgramId: 'veterano',
          status: 'pending', resolvedAt: null,
        },
        {
          proposedAt: WED, fromProgramId: 'good_behavior', toProgramId: 'veterano',
          status: 'declined', resolvedAt: WED,
        },
      ],
    );
    const rows = buildDayRows(state, catalog, { from: TUE, to: WED });
    for (const r of rows) assert.equal(r.proposalAcceptedOn, null);
  });

  it('같은 날 같은 종목 세션 2건이 모두 review.performed 에 노출된다 (EC-58)', () => {
    const twice: SessionRecord[] = [rec(TUE, 'pushup', [5, 5]), rec(TUE, 'pushup', [4, 4])];
    const state = stateAt(
      ALL_UNLOCKED_STEPS, twice,
      [stintAt('good_behavior', MON, MON)],
    );
    const rows = buildDayRows(state, catalog, { from: TUE, to: TUE });
    const performed = rows[0].review.performed;
    assert.equal(performed.length, 2);
    // 저장 순서를 유지한다.
    assert.deepEqual(performed[0].sets, [5, 5]);
    assert.deepEqual(performed[1].sets, [4, 4]);
  });

  it('프로그램 미선택 기간의 자유 운동 기록이 그날 결과에 잡힌다 (EC-66)', () => {
    // 구간 없음, TUE 에 자유 운동 하나.
    const state = stateAt(
      ALL_UNLOCKED_STEPS,
      [rec(TUE, 'pushup', [8], { kind: 'free' })],
      [],
    );
    const rows = buildDayRows(state, catalog, { from: TUE, to: TUE });
    assert.equal(rows[0].review.status, 'rest'); // stint 없음 → rest
    assert.equal(rows[0].review.performed.length, 1);
    assert.equal(rows[0].review.performed[0].kind, 'free');
  });

  it('결과 배열이 최근 날짜부터 (내림차순)', () => {
    const state = stateAt(
      ALL_UNLOCKED_STEPS,
      [],
      [stintAt('good_behavior', MON, MON)],
    );
    const rows = buildDayRows(state, catalog, { from: MON, to: FRI });
    const dates = rows.map((r) => r.review.date);
    assert.deepEqual(dates, [FRI, THU, WED, TUE, MON]);
  });

  it('창이 한 날짜만 담고 있어도 정상 동작한다', () => {
    const state = stateAt(
      ALL_UNLOCKED_STEPS,
      [],
      [stintAt('good_behavior', MON, MON)],
    );
    const rows = buildDayRows(state, catalog, { from: TUE, to: TUE });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].review.date, TUE);
  });
});

describe('buildDayRows — recordIndices (AD-6)', () => {
  function rowsByDate(state: AppState, from: IsoDate, to: IsoDate): Record<IsoDate, DayRow> {
    const rows = buildDayRows(state, catalog, { from, to });
    return Object.fromEntries(rows.map((r) => [r.review.date, r]));
  }

  /** 화면이 넘기는 인덱스가 곧 그 줄의 기록이어야 옮기기가 엉뚱한 기록을 건드리지 않는다. */
  function assertAligned(state: AppState, rows: Record<IsoDate, DayRow>): void {
    for (const row of Object.values(rows)) {
      assert.equal(row.recordIndices.length, row.review.performed.length);
      row.review.performed.forEach((r, k) => {
        assert.equal(r, state.history[row.recordIndices[k]]);
      });
    }
  }

  it('같은 날 여러 기록이 서로 다른 인덱스를 저장 순서대로 받는다', () => {
    const state = stateAt(
      ALL_UNLOCKED_STEPS,
      [rec(MON, 'pushup'), rec(TUE, 'pushup'), rec(TUE, 'squat'), rec(WED, 'squat')],
      [stintAt('good_behavior', MON, MON)],
    );
    const rows = rowsByDate(state, MON, THU);
    assert.deepEqual(rows[MON].recordIndices, [0]);
    assert.deepEqual(rows[TUE].recordIndices, [1, 2]);
    assert.deepEqual(rows[WED].recordIndices, [3]);
    assert.deepEqual(rows[THU].recordIndices, []);
    assertAligned(state, rows);
  });

  it('프로그램 미선택 기간의 자유 운동만 있는 날도 인덱스가 맞다 (EC-66)', () => {
    const state = stateAt(
      ALL_UNLOCKED_STEPS,
      [rec(MON, 'squat', [8], { kind: 'free' }), rec(TUE, 'pushup', [8], { kind: 'free' })],
      [],
    );
    const rows = rowsByDate(state, MON, TUE);
    assert.deepEqual(rows[TUE].recordIndices, [1]);
    assertAligned(state, rows);
  });

  it('날짜가 뒤집힌 history 에서도 각 기록의 실제 인덱스를 가리킨다', () => {
    const state = stateAt(
      ALL_UNLOCKED_STEPS,
      [rec(WED, 'pushup'), rec(TUE, 'squat'), rec(WED, 'pullup')],
      [stintAt('good_behavior', MON, MON)],
    );
    const rows = rowsByDate(state, TUE, WED);
    assert.deepEqual(rows[WED].recordIndices, [0, 2]);
    assert.deepEqual(rows[TUE].recordIndices, [1]);
    assertAligned(state, rows);
  });

  it('옮긴 뒤 원래 날과 옮겨 간 날의 표시가 함께 바뀐다 (FR-5)', () => {
    // 자정을 넘겨 월요일 계획(푸시업 · 레그레이즈)이 화요일 기록으로 들어간 경우.
    const state = stateAt(
      ALL_UNLOCKED_STEPS,
      [rec(TUE, 'pushup'), rec(TUE, 'legraise')],
      [stintAt('good_behavior', MON, MON)],
    );
    const before = rowsByDate(state, MON, TUE);
    assert.equal(before[MON].review.status, 'missed');
    assert.deepEqual(before[TUE].recordIndices, [0, 1]);

    // 화면과 같은 경로: 그 줄의 recordIndices 로 고른 기록을 옮긴다.
    const first = moveRecordDate(state, before[TUE].recordIndices[0], MON, FRI);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const partial = rowsByDate(first.state, MON, TUE);
    assert.equal(partial[MON].review.status, 'partial');
    assert.deepEqual(partial[MON].review.performed.map((p) => p.progressionId), ['pushup']);
    assert.deepEqual(partial[TUE].review.performed.map((p) => p.progressionId), ['legraise']);
    assertAligned(first.state, partial);

    const second = moveRecordDate(first.state, partial[TUE].recordIndices[0], MON, FRI);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    const done = rowsByDate(second.state, MON, TUE);
    assert.equal(done[MON].review.status, 'done');
    assert.deepEqual(done[TUE].review.performed, []);
  });
});
