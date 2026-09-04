import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import {
  abandonChallenge, addDays, advanceProposals, initialState, planDay, planOn,
  proposeSwitchForCurrent, recordSession, reviewDay, reviewRange, selectProgram, switchProgram,
} from '../../src/lib/domain/index.ts';
import type {
  AppState, Catalog, IsoDate, Program, ProgressionId, SessionRecord, Weekday,
} from '../../src/lib/domain/types.ts';
import { ALL_UNLOCKED_STEPS, catalog, readyForProposal, stateAt, stintFixture } from './helpers.ts';

// ── 날짜 기준점 ──────────────────────────────────────────────────────────────
// 2026-09-07(월) 08(화) 09(수) 10(목) 11(금) 12(토) 13(일)
const MON = '2026-09-07';
const TUE = '2026-09-08';
const WED = '2026-09-09';
const THU = '2026-09-10';
const FRI = '2026-09-11';
const SAT = '2026-09-12';
const SUN = '2026-09-13';
const WEEK: IsoDate[] = [MON, TUE, WED, THU, FRI, SAT, SUN];

// ── 로컬 픽스처 ──────────────────────────────────────────────────────────────

/** `selectProgram` 을 거친 상태. */
function selected(programId: string, onDate: IsoDate, base: AppState = initialState(2)): AppState {
  return selectProgram(base, catalog, programId, onDate);
}

/** 세션 기록을 순서대로 적용한 상태. */
function recorded(
  state: AppState, ...inputs: { date: IsoDate; progressionId: ProgressionId }[]
): AppState {
  let out = state;
  for (const input of inputs) {
    out = recordSession(out, catalog, {
      date: input.date,
      progressionId: input.progressionId,
      step: out.steps[input.progressionId],
      sets: [5, 5],
      kind: 'work',
    }).state;
  }
  return out;
}

/** history 에 직접 넣을 기록 하나. */
function hist(
  date: IsoDate, progressionId: ProgressionId, extra: Partial<SessionRecord> = {},
): SessionRecord {
  return { date, progressionId, step: 2, sets: [5, 5], kind: 'work', ...extra };
}

/** 실제 카탈로그에 가상의 프로그램 하나를 덧붙인 사본. `data/progressions.json` 은 건드리지 않는다. */
function catalogWith(program: Program): Catalog {
  return { progressions: catalog.progressions, programs: [...catalog.programs, program] };
}

function emptyWeek(): Record<Weekday, [string, string][]> {
  return { 월: [], 화: [], 수: [], 목: [], 금: [], 토: [], 일: [] };
}

/** 월요일에 보조 운동만 계획된 가상 프로그램 (ADR-4 부수 결정 b 검증용). */
const ACCESSORY_ONLY: Program = {
  id: 'test_accessory_only',
  name: { en: 'accessory only', ko: '보조 전용' },
  frequency: '주 1일',
  schedule: { ...emptyWeek(), 월: [['악력 운동', '제한 없음'], ['목 운동', '2~4세트']] },
};

/** 월요일에 빅6 3종목이 계획된 가상 프로그램. 실제 5종에는 하루 3종목인 날이 없다. */
const TRIPLE: Program = {
  id: 'test_triple',
  name: { en: 'triple', ko: '3종목' },
  frequency: '주 1일',
  schedule: {
    ...emptyWeek(),
    월: [['푸시업', '2세트'], ['스쿼트', '2세트'], ['레그 레이즈', '2세트']],
  },
};

const snapshot = (s: AppState) => JSON.stringify(s);

// ─────────────────────────────────────────────────────────────────────────────
describe('planOn — 프로그램 미선택 (EC-1, FR-2.5)', () => {
  it('EC-1 미선택 상태에서 no-program 을 반환한다', () => {
    const agenda = planOn(initialState(2), catalog, MON);
    assert.equal(agenda.kind, 'no-program');
    assert.equal(agenda.date, MON);
  });

  it('EC-1 / FR-2.5 예외를 던지지 않는다', () => {
    assert.doesNotThrow(() => planOn(initialState(2), catalog, MON));
  });

  it('EC-1 no-program 변형에는 계획 필드가 없다 — 호출자가 분기를 강제받는다', () => {
    const agenda = planOn(initialState(2), catalog, MON) as Record<string, unknown>;
    assert.equal('exercises' in agenda, false);
    assert.equal('weekday' in agenda, false);
    assert.equal('dayNumber' in agenda, false);
    assert.deepEqual(Object.keys(agenda).sort(), ['date', 'kind']);
  });

  it('EC-1 모든 구간이 마감된 상태에서도 no-program 이다', () => {
    const state = stateAt({}, [], [stintFixture('good_behavior', '2026-08-03', '2026-08-03', '2026-09-01')]);
    assert.equal(planOn(state, catalog, MON).kind, 'no-program');
  });
});

describe('planOn — 요일 도출 (FR-6.1, FR-6.2)', () => {
  const state = selected('good_behavior', MON);

  it('날짜에서 요일이 정확히 도출된다', () => {
    const days = WEEK.map((d) => {
      const a = planOn(state, catalog, d);
      assert.equal(a.kind, 'plan');
      return a.kind === 'plan' ? a.weekday : null;
    });
    assert.deepEqual(days, ['월', '화', '수', '목', '금', '토', '일']);
  });

  it('계획 내용이 planDay 직접 호출과 완전히 동일하다 (ADR-1 위임)', () => {
    for (const d of WEEK) {
      const a = planOn(state, catalog, d);
      assert.equal(a.kind, 'plan');
      if (a.kind !== 'plan') return;
      const direct = planDay(state, catalog, 'good_behavior', a.weekday);
      assert.equal(a.rest, direct.rest);
      assert.deepEqual(a.exercises, direct.exercises);
      assert.deepEqual(a.locked, direct.locked);
    }
  });

  it('휴식일에는 rest 가 true 이고 exercises 가 빈 배열이다', () => {
    const a = planOn(state, catalog, TUE);
    assert.equal(a.kind === 'plan' && a.rest, true);
    assert.deepEqual(a.kind === 'plan' ? a.exercises : null, []);
  });

  it('운동일에는 rest 가 false 다', () => {
    const a = planOn(state, catalog, MON);
    assert.equal(a.kind === 'plan' && a.rest, false);
  });
});

describe('planOn — 며칠차 (FR-2.7, EC-8, EC-10)', () => {
  it('startedAt 당일이 1일차다', () => {
    const a = planOn(selected('good_behavior', MON), catalog, MON);
    assert.equal(a.kind === 'plan' && a.dayNumber, 1);
  });

  it('EC-8 — 기록이 없어도 달력 기준으로 증가한다', () => {
    const state = selected('good_behavior', MON);
    assert.deepEqual(state.history, []);
    const a = planOn(state, catalog, addDays(MON, 7));
    assert.equal(a.kind === 'plan' && a.dayNumber, 8);
  });

  it('EC-10 — startedAt 이전은 0 이다', () => {
    // new_blood 는 월·목 운동이다. 화요일에 고르면 첫 운동일은 목요일이다.
    const state = selected('new_blood', TUE);
    assert.equal(state.stints[0].startedAt, THU);
    for (const d of [TUE, WED]) {
      const a = planOn(state, catalog, d);
      assert.equal(a.kind === 'plan' && a.dayNumber, 0, d);
    }
  });

  it('EC-10 — 며칠차 0 인 날에도 계획이 정상 생성된다', () => {
    const state = selected('new_blood', TUE);
    for (const d of [TUE, WED]) {
      const a = planOn(state, catalog, d);
      assert.equal(a.kind, 'plan');
      assert.equal(a.kind === 'plan' && a.rest, true);
    }
  });
});

describe('planOn — 제안 노출 (FR-4.6a, ADR-6)', () => {
  /** 제안 조건이 충족된 new_blood 진행 상태. */
  const ready = () => readyForProposal('new_blood', '2026-08-03', '2026-08-05');

  it('pending 제안이 있으면 agenda.proposal 에 담긴다', () => {
    const state = advanceProposals(ready(), catalog, MON);
    assert.equal(state.proposals.length, 1);
    const a = planOn(state, catalog, MON);
    assert.equal(a.kind === 'plan' && a.proposal?.toProgramId, 'good_behavior');
  });

  it('pending 이 없으면 proposal 이 null 이다', () => {
    const a = planOn(selected('good_behavior', MON), catalog, MON);
    assert.equal(a.kind === 'plan' && a.proposal, null);
  });

  it('FR-4.6a — 화~금에도 같은 제안이 계속 노출된다', () => {
    const state = advanceProposals(ready(), catalog, MON);
    const seen = [TUE, WED, THU, FRI].map((d) => {
      const a = planOn(state, catalog, d);
      return a.kind === 'plan' ? a.proposal : null;
    });
    for (const p of seen) assert.deepEqual(p, state.proposals[0]);
  });

  it('ADR-6 — planOn 이 제안을 생성하지 않는다', () => {
    const state = ready();
    // 조건은 충족되어 있다. 적재만 하지 않은 상태다.
    assert.notEqual(proposeSwitchForCurrent(state, catalog, MON), null);
    const a = planOn(state, catalog, MON);
    assert.equal(a.kind === 'plan' && a.proposal, null);
    assert.deepEqual(state.proposals, []);
  });

  it('NFR-2 / FR-5.5 — planOn 호출 후 원본 state 가 불변이다', () => {
    const state = advanceProposals(ready(), catalog, MON);
    const before = snapshot(state);
    for (const d of WEEK) planOn(state, catalog, d);
    assert.equal(snapshot(state), before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('reviewDay — rest (FR-5.3, ADR-4)', () => {
  it('활성 구간이 없으면 rest 다', () => {
    const r = reviewDay(initialState(2), catalog, MON);
    assert.equal(r.status, 'rest');
    assert.equal(r.programId, null);
    assert.equal(r.dayNumber, 0);
    assert.deepEqual(r.planned, []);
  });

  it('요일표가 빈 날은 rest 다', () => {
    const r = reviewDay(selected('good_behavior', MON), catalog, TUE);
    assert.equal(r.status, 'rest');
    assert.deepEqual(r.planned, []);
  });

  it('ADR-4 (a) — 계획된 종목이 전부 잠긴 날은 rest 다', () => {
    // 빅4 가 2단계라 브리지·핸드스탠드가 잠긴다. good_behavior 금요일은 그 둘뿐이다.
    const state = selected('good_behavior', MON);
    const agenda = planOn(state, catalog, FRI);
    assert.deepEqual(
      agenda.kind === 'plan' ? agenda.locked.map((l) => l.progressionId) : null,
      ['hspu', 'bridge'],
    );
    const r = reviewDay(state, catalog, FRI);
    assert.equal(r.status, 'rest');
    assert.deepEqual(r.planned, []);
  });

  it('ADR-4 (b) — 보조 운동만 있는 날은 rest 다', () => {
    const cat = catalogWith(ACCESSORY_ONLY);
    const state = selectProgram(initialState(2), cat, ACCESSORY_ONLY.id, MON);
    const r = reviewDay(state, cat, MON);
    assert.deepEqual(r.planned, []);
    assert.equal(r.status, 'rest');
  });
});

describe('reviewDay — missed (FR-5.3)', () => {
  it('계획이 있는데 기록이 0개면 missed 다', () => {
    const r = reviewDay(selected('good_behavior', MON), catalog, MON);
    assert.equal(r.status, 'missed');
    assert.deepEqual(r.planned, ['pushup', 'legraise']);
    assert.deepEqual(r.performed, []);
  });

  it('다른 날의 기록은 그날의 판정에 영향을 주지 않는다', () => {
    const state = recorded(
      selected('good_behavior', MON),
      { date: WED, progressionId: 'pullup' },
      { date: WED, progressionId: 'squat' },
    );
    assert.equal(reviewDay(state, catalog, MON).status, 'missed');
    assert.equal(reviewDay(state, catalog, WED).status, 'done');
  });
});

describe('reviewDay — partial (FR-5.3)', () => {
  it('계획 2종목 중 1종목만 기록되면 partial 이다', () => {
    const state = recorded(selected('good_behavior', MON), { date: MON, progressionId: 'pushup' });
    const r = reviewDay(state, catalog, MON);
    assert.equal(r.status, 'partial');
    assert.equal(r.performed.length, 1);
  });

  it('계획 3종목 중 2종목 기록이면 partial 이다', () => {
    const cat = catalogWith(TRIPLE);
    let state = selectProgram(initialState(2), cat, TRIPLE.id, MON);
    for (const id of ['pushup', 'squat'] as ProgressionId[]) {
      state = recordSession(state, cat, {
        date: MON, progressionId: id, step: 2, sets: [5, 5], kind: 'work',
      }).state;
    }
    const r = reviewDay(state, cat, MON);
    assert.deepEqual(r.planned, ['pushup', 'squat', 'legraise']);
    assert.equal(r.status, 'partial');
  });
});

describe('reviewDay — done (FR-5.3)', () => {
  const doneState = () => recorded(
    selected('good_behavior', MON),
    { date: MON, progressionId: 'pushup' },
    { date: MON, progressionId: 'legraise' },
  );

  it('계획 종목이 전부 기록되면 done 이다', () => {
    assert.equal(reviewDay(doneState(), catalog, MON).status, 'done');
  });

  it('EC-4 — 같은 종목을 2회 기록해도 done 이다', () => {
    const state = recorded(doneState(), { date: MON, progressionId: 'pushup' });
    const r = reviewDay(state, catalog, MON);
    assert.equal(r.status, 'done');
    assert.equal(r.performed.length, 3);
  });

  it('계획에 없는 종목을 추가로 기록해도 done 이다', () => {
    const state = recorded(doneState(), { date: MON, progressionId: 'squat' });
    const r = reviewDay(state, catalog, MON);
    assert.equal(r.status, 'done');
    assert.equal(r.performed.length, 3);
  });
});

describe('reviewDay — kind/outcome 을 판정에 쓰지 않는다', () => {
  it("outcome: 'abandoned' 기록도 수행으로 친다", () => {
    const state = stateAt(
      {},
      [
        hist(MON, 'pushup', { outcome: 'abandoned' }),
        hist(MON, 'legraise', { outcome: 'abandoned' }),
      ],
      [stintFixture('good_behavior', MON, MON)],
    );
    assert.equal(reviewDay(state, catalog, MON).status, 'done');
  });

  it("kind: 'consolidation' 기록도 수행으로 친다", () => {
    const state = stateAt(
      { pushup: 3, legraise: 3 },
      [
        hist(MON, 'pushup', { step: 3, performedStep: 2, kind: 'consolidation' }),
        hist(MON, 'legraise', { step: 3, performedStep: 2, kind: 'consolidation' }),
      ],
      [stintFixture('good_behavior', MON, MON)],
    );
    assert.equal(reviewDay(state, catalog, MON).status, 'done');
  });
});

describe('FR-12 — 보조 운동은 도메인 출력에 남지 않는다', () => {
  const solitary = () => stateAt(
    ALL_UNLOCKED_STEPS, [], [stintFixture('solitary_confinement', MON, MON)],
  );

  it('빅6 매핑에 없는 라벨은 planned 에 섞이지 않는다', () => {
    // solitary_confinement 월요일 = 풀업 + 스쿼트 + 악력 운동.
    const r = reviewDay(solitary(), catalog, MON);
    assert.deepEqual(r.planned, ['pullup', 'squat']);
  });

  it('DayReview 에 accessories 키 자체가 없다', () => {
    const r = reviewDay(solitary(), catalog, MON) as unknown as Record<string, unknown>;
    assert.equal('accessories' in r, false);
  });

  it('DayPlan 에도 accessories 키가 없다', () => {
    const d = planDay(solitary(), catalog, 'solitary_confinement', '월');
    assert.equal('accessories' in (d as unknown as Record<string, unknown>), false);
  });

  it('보조 운동만 수행하지 않아도 판정에 영향이 없다 — 빅6 만 보면 done 이다', () => {
    const state = recorded(
      solitary(),
      { date: MON, progressionId: 'pullup' },
      { date: MON, progressionId: 'squat' },
    );
    assert.equal(reviewDay(state, catalog, MON).status, 'done');
  });
});

describe('reviewDay — plannedExercises (W-2 (c), FR-5.1)', () => {
  it('planned 와 같은 종목 집합을 갖는다', () => {
    const state = selected('good_behavior', MON);
    const r = reviewDay(state, catalog, MON);
    assert.deepEqual(r.plannedExercises.map((e) => e.progressionId), r.planned);
  });

  it('work / goal / warmup 이 담긴다', () => {
    const state = selected('good_behavior', MON);
    const r = reviewDay(state, catalog, MON);
    const direct = planDay(state, catalog, 'good_behavior', '월');
    assert.deepEqual(r.plannedExercises, direct.exercises);
    for (const e of r.plannedExercises) {
      assert.ok(Array.isArray(e.work) && e.work.length > 0);
      assert.ok(Array.isArray(e.warmup));
      assert.ok(typeof e.goal.value === 'number');
    }
  });

  it('현재 단계 기준 재계산값이다 (한계 고정)', () => {
    // 09-07 에 5단계로 기록했고 이후 승급해 현재 7단계다.
    const state = stateAt(
      { pushup: 7, legraise: 7, squat: 7, pullup: 7 },
      [hist(MON, 'pushup', { step: 5 }), hist(MON, 'legraise', { step: 5 })],
      [stintFixture('good_behavior', MON, MON)],
    );
    const r = reviewDay(state, catalog, MON);
    const pushup = r.plannedExercises.find((e) => e.progressionId === 'pushup');
    assert.equal(pushup?.step, 7, '목표는 조회 시점의 단계로 재계산된다');
    assert.equal(r.performed[0].step, 5, '실제 기록은 그날의 단계 그대로다');
  });

  it('rest 인 날은 plannedExercises 가 빈 배열이다', () => {
    assert.deepEqual(reviewDay(selected('good_behavior', MON), catalog, TUE).plannedExercises, []);
  });

  it('활성 구간이 없으면 plannedExercises 가 빈 배열이다', () => {
    assert.deepEqual(reviewDay(initialState(2), catalog, MON).plannedExercises, []);
  });
});

describe('reviewDay — 기타 필드 (FR-5.1)', () => {
  it('programId 가 그날의 구간 프로그램이다', () => {
    assert.equal(reviewDay(selected('good_behavior', MON), catalog, WED).programId, 'good_behavior');
  });

  it('performed 에 세트별 수치·RPE·kind·outcome 이 전부 담긴다', () => {
    const record = hist(MON, 'pushup', {
      sets: [12, 9, 7], rpe: 8, kind: 'work', outcome: 'abandoned', performedStep: 2,
    });
    const state = stateAt({}, [record], [stintFixture('good_behavior', MON, MON)]);
    const r = reviewDay(state, catalog, MON);
    assert.deepEqual(r.performed, [record]);
  });

  it('과거 구간의 날짜를 조회하면 그 구간의 programId 가 나온다', () => {
    const a = selected('good_behavior', MON);
    const b = switchProgram(a, catalog, 'new_blood', '2026-09-14');
    assert.equal(reviewDay(b, catalog, THU).programId, 'good_behavior');
    assert.equal(reviewDay(b, catalog, '2026-09-14').programId, 'new_blood');
  });

  it('FR-5.5 / NFR-2 — 원본 state 가 불변이다', () => {
    const state = recorded(selected('good_behavior', MON), { date: MON, progressionId: 'pushup' });
    const before = snapshot(state);
    for (const d of WEEK) reviewDay(state, catalog, d);
    assert.equal(snapshot(state), before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('reviewRange (FR-5.2, EC-8)', () => {
  it('기간의 모든 날짜가 결과에 포함된다', () => {
    const rows = reviewRange(selected('good_behavior', MON), catalog, MON, SUN);
    assert.equal(rows.length, 7);
  });

  it('날짜 순서가 유지된다', () => {
    const rows = reviewRange(selected('good_behavior', MON), catalog, MON, SUN);
    assert.deepEqual(rows.map((r) => r.date), WEEK);
  });

  it('단일 날짜 구간은 길이 1 이다', () => {
    assert.equal(reviewRange(selected('good_behavior', MON), catalog, MON, MON).length, 1);
  });

  it('역순 구간은 빈 배열이다 (예외 아님)', () => {
    assert.deepEqual(reviewRange(selected('good_behavior', MON), catalog, SUN, MON), []);
  });

  it('EC-8 — 며칠 건너뛴 구간에서 미수행일이 전부 남는다', () => {
    const state = recorded(
      selected('good_behavior', MON),
      { date: MON, progressionId: 'pushup' },
      { date: MON, progressionId: 'legraise' },
    );
    const rows = reviewRange(state, catalog, MON, SUN);
    assert.deepEqual(
      rows.map((r) => [r.date, r.status]),
      [
        [MON, 'done'],
        [TUE, 'rest'],
        [WED, 'missed'],
        [THU, 'rest'],
        // 금요일은 hspu·bridge 가 잠겨 계획이 비므로 rest 다 (ADR-4 (a)).
        [FRI, 'rest'],
        [SAT, 'rest'],
        [SUN, 'rest'],
      ],
    );
  });

  it('EC-8 — 빅6 가 전부 해금된 상태면 금요일도 missed 로 남는다', () => {
    // 위 케이스의 금요일이 rest 인 것은 잠금 때문이다. 해금되면 계획이 생겨 missed 가 된다.
    const state = stateAt(ALL_UNLOCKED_STEPS, [], [stintFixture('good_behavior', MON, MON)]);
    const rows = reviewRange(state, catalog, MON, SUN);
    assert.deepEqual(
      rows.map((r) => [r.date, r.status]),
      [
        [MON, 'missed'], [TUE, 'rest'], [WED, 'missed'], [THU, 'rest'],
        [FRI, 'missed'], [SAT, 'rest'], [SUN, 'rest'],
      ],
    );
    assert.deepEqual(rows[4].planned, ['hspu', 'bridge']);
  });

  it('EC-8 — 3주를 통째로 건너뛴 경우에도 누락이 없다', () => {
    const state = selected('good_behavior', MON);
    const to = addDays(MON, 20);
    const rows = reviewRange(state, catalog, MON, to);
    assert.equal(rows.length, 21);
    assert.equal(state.history.length, 0);
    for (const r of rows) {
      assert.equal(r.status, r.planned.length === 0 ? 'rest' : 'missed', r.date);
    }
    // 월·수 6일이 운동일이다. 금요일은 잠겨서 rest 다.
    assert.equal(rows.filter((r) => r.status === 'missed').length, 6);
  });

  it('EC-8 — 며칠차가 건너뛴 날에도 1씩 단조 증가한다', () => {
    const rows = reviewRange(selected('good_behavior', MON), catalog, MON, addDays(MON, 20));
    assert.deepEqual(rows.map((r) => r.dayNumber), rows.map((_, i) => i + 1));
  });

  it('구간 경계를 넘는 조회에서 며칠차가 1로 리셋된다', () => {
    const a = selected('good_behavior', MON);          // 09-07 ~ 09-14
    const b = switchProgram(a, catalog, 'new_blood', '2026-09-14'); // 09-14(월) ~
    const rows = reviewRange(b, catalog, SAT, '2026-09-16');
    assert.deepEqual(
      rows.map((r) => [r.date, r.programId, r.dayNumber]),
      [
        [SAT, 'good_behavior', 6],
        [SUN, 'good_behavior', 7],
        ['2026-09-14', 'new_blood', 1],
        ['2026-09-15', 'new_blood', 2],
        ['2026-09-16', 'new_blood', 3],
      ],
    );
  });

  it('구간 시작 이전 날짜는 programId null / 며칠차 0 / rest 다', () => {
    const state = selected('good_behavior', MON);
    const rows = reviewRange(state, catalog, '2026-09-05', MON);
    assert.deepEqual(rows.slice(0, 2).map((r) => [r.programId, r.dayNumber, r.status]), [
      [null, 0, 'rest'],
      [null, 0, 'rest'],
    ]);
    assert.equal(rows[2].programId, 'good_behavior');
  });

  it('1년치 조회가 정상 동작한다 — 상한 제약이 없다', () => {
    const rows = reviewRange(selected('good_behavior', MON), catalog, MON, '2027-09-06');
    assert.equal(rows.length, 365);
  });

  it('NFR-2 — 원본 state 가 불변이다', () => {
    const state = selected('good_behavior', MON);
    const before = snapshot(state);
    reviewRange(state, catalog, MON, addDays(MON, 60));
    assert.equal(snapshot(state), before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('경계 조건', () => {
  it('구간 시작 당일은 며칠차 1 이고 계획이 정상이다', () => {
    const a = planOn(selected('good_behavior', MON), catalog, MON);
    assert.equal(a.kind === 'plan' && a.dayNumber, 1);
    assert.equal(a.kind === 'plan' && a.exercises.length, 2);
  });

  it('구간 시작 하루 전은 며칠차 0 이다', () => {
    const state = selected('new_blood', TUE); // startedAt = 목
    assert.equal(reviewDay(state, catalog, WED).dayNumber, 0);
  });

  it('구간 마감 당일은 새 구간 기준이다 (반개구간 규칙)', () => {
    const a = selected('good_behavior', MON);
    const b = switchProgram(a, catalog, 'veterano', THU);
    assert.equal(reviewDay(b, catalog, THU).programId, 'veterano');
  });

  it('하루 한 종목인 veterano 는 partial 이 될 수 없다', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [], [stintFixture('veterano', MON, MON)]);
    for (const d of [MON, TUE, WED, THU, FRI, SAT]) {
      assert.equal(reviewDay(state, catalog, d).planned.length, 1, d);
    }
    assert.equal(reviewDay(state, catalog, MON).status, 'missed');
    const done = recorded(state, { date: MON, progressionId: 'pullup' });
    assert.equal(reviewDay(done, catalog, MON).status, 'done');
  });

  it('하루 2종목인 supermax 는 3상태 전부 가능하다', () => {
    const base = stateAt(ALL_UNLOCKED_STEPS, [], [stintFixture('supermax', MON, MON)]);
    assert.equal(reviewDay(base, catalog, MON).status, 'missed');
    const one = recorded(base, { date: MON, progressionId: 'pullup' });
    assert.equal(reviewDay(one, catalog, MON).status, 'partial');
    const two = recorded(one, { date: MON, progressionId: 'squat' });
    assert.equal(reviewDay(two, catalog, MON).status, 'done');
  });

  it('reviewRange 의 from > to 는 예외 없이 빈 배열이다', () => {
    assert.doesNotThrow(() => reviewRange(initialState(2), catalog, SUN, MON));
  });
});

describe('순수성·결정성 (FR-5.5, NFR-2, NFR-5)', () => {
  it('세 함수 모두 AppState 를 반환하지 않는다', () => {
    const state = selected('good_behavior', MON);
    for (const value of [
      planOn(state, catalog, MON) as Record<string, unknown>,
      reviewDay(state, catalog, MON) as unknown as Record<string, unknown>,
    ]) {
      for (const key of ['steps', 'history', 'stints', 'proposals']) {
        assert.equal(key in value, false, key);
      }
    }
    const rows = reviewRange(state, catalog, MON, SUN) as unknown as Record<string, unknown>[];
    for (const row of rows) {
      for (const key of ['steps', 'history', 'stints', 'proposals']) {
        assert.equal(key in row, false, key);
      }
    }
  });

  it('같은 인자로 100회 호출해도 결과가 동일하다', () => {
    const state = recorded(selected('good_behavior', MON), { date: MON, progressionId: 'pushup' });
    const agenda = JSON.stringify(planOn(state, catalog, MON));
    const review = JSON.stringify(reviewDay(state, catalog, MON));
    for (let i = 0; i < 100; i += 1) {
      assert.equal(JSON.stringify(planOn(state, catalog, MON)), agenda);
      assert.equal(JSON.stringify(reviewDay(state, catalog, MON)), review);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('통합 — 선택 → 계획 → 기록 → 조회', () => {
  it('프로그램 선택부터 주간 조회까지', () => {
    const empty = initialState(2);
    assert.equal(planOn(empty, catalog, MON).kind, 'no-program');

    const state = selectProgram(empty, catalog, 'good_behavior', MON);
    const agenda = planOn(state, catalog, MON);
    assert.equal(agenda.kind, 'plan');
    if (agenda.kind !== 'plan') return;
    assert.equal(agenda.dayNumber, 1);
    assert.deepEqual(agenda.exercises.map((e) => e.progressionId), ['pushup', 'legraise']);

    const after = recorded(
      state,
      { date: MON, progressionId: 'pushup' },
      { date: MON, progressionId: 'legraise' },
    );
    assert.equal(reviewDay(after, catalog, MON).status, 'done');
    assert.equal(reviewRange(after, catalog, MON, SUN).length, 7);
  });

  it('전환 전후 날짜의 programId 와 며칠차가 정확하다', () => {
    const a = selected('new_blood', MON);
    const b = switchProgram(a, catalog, 'veterano', '2026-09-16');
    const before = reviewDay(b, catalog, '2026-09-14');
    assert.equal(before.programId, 'new_blood');
    assert.equal(before.dayNumber, 8);
    const after = reviewDay(b, catalog, '2026-09-16');
    assert.equal(after.programId, 'veterano');
    assert.equal(after.dayNumber, 1);
  });

  it('planOn 의 exercises 종목과 reviewDay 의 planned 가 일치한다', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [], [stintFixture('solitary_confinement', MON, MON)]);
    for (const d of WEEK) {
      const a = planOn(state, catalog, d);
      const r = reviewDay(state, catalog, d);
      assert.deepEqual(a.kind === 'plan' ? a.exercises.map((e) => e.progressionId) : [], r.planned, d);
    }
  });

  it('planOn 의 locked 종목이 reviewDay 의 planned 에 없다', () => {
    const state = selected('good_behavior', MON);
    const a = planOn(state, catalog, FRI);
    const locked = a.kind === 'plan' ? a.locked.map((l) => l.progressionId) : [];
    assert.equal(locked.length, 2);
    const r = reviewDay(state, catalog, FRI);
    for (const id of locked) assert.equal(r.planned.includes(id), false, id);
  });

  it('abandonChallenge 로 남긴 기록이 reviewDay 에 반영된다', () => {
    const state = selected('good_behavior', MON);
    const { state: next } = abandonChallenge(state, catalog, 'pushup', MON, [3, 1]);
    const r = reviewDay(next, catalog, MON);
    assert.equal(r.performed[0].outcome, 'abandoned');
    assert.notEqual(r.status, 'missed');
    assert.equal(r.status, 'partial');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('타임존 무관 (FR-6.3)', () => {
  const probe = new URL('./tz-probe.ts', import.meta.url).pathname;
  const run = (tz: string) => execFileSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', probe],
    { env: { ...process.env, TZ: tz }, encoding: 'utf8' },
  );

  const utc = run('UTC');

  for (const tz of ['Asia/Seoul', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    it(`${tz} 에서 planOn / reviewRange 결과가 UTC 와 동일하다`, () => {
      assert.equal(run(tz), utc);
    });
  }

  it('UTC 기준 결과 자체가 기대값과 일치한다', () => {
    const parsed = JSON.parse(utc) as {
      agendas: { date: string; weekday: string; dayNumber: number }[];
      reviews: { date: string; status: string }[];
    };
    assert.deepEqual(parsed.agendas.map((a) => a.weekday), ['월', '화', '수', '목', '금', '토', '일']);
    assert.deepEqual(parsed.agendas.map((a) => a.dayNumber), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(
      parsed.reviews.map((r) => r.status),
      ['missed', 'rest', 'missed', 'rest', 'rest', 'rest', 'rest'],
    );
  });
});
