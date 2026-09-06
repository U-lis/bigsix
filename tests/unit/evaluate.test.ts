import { test } from 'vitest';
import assert from 'node:assert/strict';
import { applySession, evaluateSession } from '../../src/lib/domain/evaluate.ts';
import { planExercise } from '../../src/lib/domain/plan.ts';
import { catalog, onePassFromPromotion, rec, stateAt, topSets } from './helpers.ts';
import type {
  ProgramStint, SessionInput, SessionRecord, SwitchProposal,
} from '../../src/lib/domain/types.ts';

/** applySession 에 넘길 입력. 파생 필드가 없는 SessionInput 이다. */
function input(
  progressionId: SessionInput['progressionId'], step: number, sets: number[],
  extra: Partial<SessionInput> = {},
): SessionInput {
  return { date: '2026-09-02', progressionId, step, sets, kind: 'work', ...extra };
}

/**
 * 푸시업 5단계에서 마지막 기준 3연속 직전까지 채운 history (8세션).
 * `rpes` 를 주면 **뒤쪽 세션들**에 그 RPE 를 입힌다 — 거부권 창(최근 3회)을 겨냥한다.
 */
function ready(rpes: (number | undefined)[] = []): SessionRecord[] {
  const h = onePassFromPromotion('pushup', 5);
  rpes.forEach((rpe, i) => {
    const at = h.length - rpes.length + i;
    h[at] = rpe === undefined ? h[at] : { ...h[at], rpe };
  });
  return h;
}

/** 마지막 기준을 정확히 채우는 세션. 이것이 3연속을 완성한다. */
const finish = (extra: Partial<SessionInput> = {}) =>
  rec('pushup', 5, topSets('pushup', 5), extra);

const stints: ProgramStint[] = [
  { programId: 'new_blood', selectedAt: '2026-01-05', startedAt: '2026-01-05', endedAt: '2026-03-01' },
  { programId: 'good_behavior', selectedAt: '2026-03-02', startedAt: '2026-03-02', endedAt: null },
];

const proposals: SwitchProposal[] = [
  { proposedAt: '2026-08-31', fromProgramId: 'good_behavior', toProgramId: 'veterano',
    status: 'pending', resolvedAt: null },
  { proposedAt: '2026-05-04', fromProgramId: 'new_blood', toProgramId: 'good_behavior',
    status: 'declined', resolvedAt: '2026-05-04' },
  { proposedAt: '2026-06-01', fromProgramId: 'new_blood', toProgramId: 'good_behavior',
    status: 'declined', resolvedAt: '2026-06-01' },
];

// ---------------------------------------------------------------------------
// 동작 보존 회귀 — 기존 evaluate.test.ts 에서 이관 (NFR-3)
// ---------------------------------------------------------------------------

test('상급자 기준 미달이면 단계를 유지한다', () => {
  const e = evaluateSession(stateAt({ pushup: 5 }), catalog, rec('pushup', 5, [19, 18]));
  assert.equal(e.promote, false);
  assert.equal(e.nextStep, 5);
  assert.equal(e.metIntermediate, true);
});

test('FR-22 상급자 기준을 한 번 채운다고 승급하지 않는다', () => {
  const e = evaluateSession(stateAt({ pushup: 5 }), catalog, rec('pushup', 5, [20, 20]));
  assert.equal(e.promote, false);
  assert.equal(e.nextStep, 5);
  // 초보자 구간의 1회 연속일 뿐이다. 기준을 넘겼다고 tier 가 건너뛰지 않는다.
  assert.deepEqual(e.streak, { tier: 'beginner', streak: 1 });
});

test('FR-22 마지막 기준을 3회 연속 채우면 다음 단계로 올린다', () => {
  const st = stateAt({ pushup: 5 }, onePassFromPromotion('pushup', 5));
  const e = evaluateSession(st, catalog, rec('pushup', 5, topSets('pushup', 5)));
  assert.equal(e.promote, true);
  assert.equal(e.nextStep, 6);
  assert.deepEqual(e.streak, { tier: 'progression', streak: 3 });
});

test('3세트 기준은 세 세트를 모두 채워야 한다', () => {
  const st = stateAt({ pushup: 2 }, onePassFromPromotion('pushup', 2));
  const two = evaluateSession(st, catalog, rec('pushup', 2, [40, 40]));
  assert.equal(two.promote, false, '세트 수가 모자라면 연속이 끊긴다');
  const three = evaluateSession(st, catalog, rec('pushup', 2, [40, 40, 40]));
  assert.equal(three.promote, true);
});

test('세트를 더 많이 해도 상위 N개로 판정한다', () => {
  const st = stateAt({ pushup: 5 }, onePassFromPromotion('pushup', 5));
  const e = evaluateSession(st, catalog, rec('pushup', 5, [20, 8, 20]));
  assert.equal(e.promote, true);
});

test('승급은 수행 횟수로만 판정한다 — 심박수는 쓰지 않는다', () => {
  // 판정에 쓰이는 주관 지표는 RPE 뿐이다. 필드 이름을 grep 하는 대신,
  // 기록에 무엇이 더 붙든 수행 횟수가 같으면 판정이 같다는 것을 직접 본다.
  const base = stateAt({ pushup: 5 }, onePassFromPromotion('pushup', 5));
  const plain = evaluateSession(base, catalog, rec('pushup', 5, topSets('pushup', 5)));
  const noisy = evaluateSession(base, catalog, rec('pushup', 5, topSets('pushup', 5), {
    date: '2030-12-31', performedStep: 5,
    ...({ heartRate: 190, hr: 190 } as Record<string, number>),
  }));
  assert.equal(plain.promote, noisy.promote);
  assert.equal(plain.nextStep, noisy.nextStep);
  assert.deepEqual(plain.streak, noisy.streak);
  assert.equal(plain.promote, true, '이 시나리오가 실제로 승급을 만드는지도 함께 고정한다');
});

test('다지기 세션은 승급 판정 대상이 아니다', () => {
  const e = evaluateSession(stateAt({ pushup: 5 }), catalog,
    rec('pushup', 5, [25, 25], { kind: 'consolidation', performedStep: 4 }));
  assert.equal(e.promote, false);
  assert.equal(e.metTop, false);
  assert.equal(e.metBeginner, false, '이전 단계 수치를 현재 단계 기준으로 재지 않는다');
  assert.match(e.notes[0], /4단계를 다지는 세션/);
});

test('사용자가 중단한 도전은 승급하지 않는다', () => {
  const e = evaluateSession(stateAt({ pushup: 5 }), catalog,
    rec('pushup', 5, [3], { outcome: 'abandoned' }));
  assert.equal(e.promote, false);
  assert.equal(e.nextStep, 5);
  assert.match(e.notes[0], /중단한 도전/);
});

test('기준을 채운 세션이라도 중단으로 기록되면 승급하지 않는다', () => {
  const e = evaluateSession(stateAt({ pushup: 5 }), catalog,
    rec('pushup', 5, [20, 20], { outcome: 'abandoned' }));
  assert.equal(e.metTop, true);
  assert.equal(e.promote, false);
  assert.equal(e.nextStep, 5);
});

test('마스터 단계는 기준을 채워도 승급하지 않는다', () => {
  const st = stateAt({ pushup: 10 }, onePassFromPromotion('pushup', 10));
  const e = evaluateSession(st, catalog, rec('pushup', 10, topSets('pushup', 10)));
  assert.equal(e.metTop, true);
  assert.equal(e.promote, false);
  assert.equal(e.blockedBy, 'master');
  assert.equal(e.topLabel, 'elite');
  assert.equal(e.nextStep, 10, '10단계는 더 올라갈 단계가 없다');
});

test('RPE 평균이 임계 이상이면 기준을 채워도 승급을 보류한다', () => {
  const e = evaluateSession(stateAt({ pushup: 5 }, ready([8, 9])), catalog, finish({ rpe: 8 }));
  assert.equal(e.metTop, true);
  assert.equal(e.promote, false);
  assert.equal(e.blockedBy, 'rpe');
  assert.match(e.notes[0], /승급 보류/);
});

test('RPE 평균이 정확히 8.0 이면 보류한다 (경계 포함)', () => {
  const e = evaluateSession(stateAt({ pushup: 5 }, ready([8, 8])), catalog, finish({ rpe: 8 }));
  assert.equal(e.promote, false);
  assert.equal(e.blockedBy, 'rpe');
});

test('RPE 평균이 8 미만이면 승급한다', () => {
  // 8 + 8 + 7 = 23 / 3 = 7.67
  const e = evaluateSession(stateAt({ pushup: 5 }, ready([8, 8])), catalog, finish({ rpe: 7 }));
  assert.equal(e.promote, true);
  assert.equal(e.blockedBy, undefined);
});

test('RPE 가 낮으면 정상 승급한다', () => {
  const e = evaluateSession(stateAt({ pushup: 5 }, ready([6, 7])), catalog, finish({ rpe: 7 }));
  assert.equal(e.promote, true);
});

test('RPE 표본이 부족하면 거부권은 작동하지 않는다', () => {
  const e = evaluateSession(stateAt({ pushup: 5 }, ready([10])), catalog, finish({ rpe: 10 }));
  assert.equal(e.promote, true, '2회분만으로는 보류하지 않는다');
});

test('RPE 를 입력하지 않으면 거부권이 없다', () => {
  const e = evaluateSession(stateAt({ pushup: 5 }, ready()), catalog, finish());
  assert.equal(e.promote, true);
});

test('RPE 미입력 세션은 거부권 창에 들어가지 않는다', () => {
  // RPE 가 있는 work 세션은 2개뿐이므로 창(3)이 차지 않는다 → 거부권 없음.
  const e = evaluateSession(stateAt({ pushup: 5 }, ready([10, undefined])), catalog,
    finish({ rpe: 10 }));
  assert.equal(e.promote, true);
});

test('다지기 세션은 RPE 거부권 창에 들어가지 않는다', () => {
  const history = [
    ...ready(),
    rec('pushup', 5, [25, 25], { kind: 'consolidation', performedStep: 4, rpe: 10 }),
    rec('pushup', 5, [25, 25], { kind: 'consolidation', performedStep: 4, rpe: 10 }),
  ];
  const e = evaluateSession(stateAt({ pushup: 5 }, history), catalog, finish({ rpe: 10 }));
  assert.equal(e.promote, true, 'work 세션 RPE 만 창에 들어간다');
});

// ---------------------------------------------------------------------------
// applySession — 반환 형태 (ADR-3, FR-8)
// ---------------------------------------------------------------------------

test('applySession 은 state / evaluation / record 세 키를 돌려준다', () => {
  const result = applySession(stateAt({ pushup: 5 }), catalog, input('pushup', 5, [20, 20]));
  assert.deepEqual(Object.keys(result).sort(), ['evaluation', 'record', 'state']);
});

test('history 마지막 원소가 반환된 record 와 같다', () => {
  const { state, record } = applySession(
    stateAt({ pushup: 5 }), catalog, input('pushup', 5, [20, 20]));
  assert.equal(state.history.length, 1);
  assert.deepEqual(state.history.at(-1), record);
});

test('history 에 들어가는 것은 input 이 아니라 파생 필드가 붙은 record 다', () => {
  const inp = input('pushup', 5, topSets('pushup', 5));
  const { state } = applySession(stateAt({ pushup: 5 }, ready()), catalog, inp);
  assert.equal(state.history.at(-1)!.promotedTo, 6);
  assert.equal((inp as unknown as Record<string, unknown>).promotedTo, undefined, '입력 객체는 변형되지 않는다');
});

test('applySession 은 원본을 건드리지 않고 새 상태를 만든다', () => {
  const before = stateAt({ pushup: 5 }, ready());
  const beforeLen = before.history.length;
  const { state, evaluation } = applySession(
    before, catalog, input('pushup', 5, topSets('pushup', 5)));
  assert.equal(evaluation.promote, true);
  assert.equal(state.steps.pushup, 6);
  assert.equal(state.history.length, beforeLen + 1);
  assert.equal(before.steps.pushup, 5, '원본 steps 불변');
  assert.equal(before.history.length, beforeLen, '원본 history 불변');
  assert.notEqual(state, before);
  assert.notEqual(state.steps, before.steps);
  assert.notEqual(state.history, before.history);
});

// ---------------------------------------------------------------------------
// 필드 보존 (C-2) — 타입 검사가 없으므로 이 테스트가 유일한 방어선이다
// ---------------------------------------------------------------------------

test('applySession 후 stints 가 입력과 동일하다', () => {
  const before = stateAt({ pushup: 5 }, [], stints);
  const { state } = applySession(before, catalog, input('pushup', 5, [20, 20]));
  assert.notEqual(state.stints, undefined);
  assert.equal(state.stints.length, 2);
  assert.deepEqual(state.stints, stints);
});

test('applySession 후 proposals 가 입력과 동일하다', () => {
  const before = stateAt({ pushup: 5 }, [], [], proposals);
  const { state } = applySession(before, catalog, input('pushup', 5, [20, 20]));
  assert.equal(state.proposals.length, 3);
  assert.deepEqual(state.proposals.map((p) => p.status), ['pending', 'declined', 'declined']);
  assert.deepEqual(state.proposals, proposals);
});

test('반환 상태가 AppState 의 네 필드를 모두 가진다', () => {
  const { state } = applySession(
    stateAt({ pushup: 5 }, [], stints, proposals), catalog, input('pushup', 5, [20, 20]));
  assert.deepEqual(Object.keys(state).sort(), ['history', 'proposals', 'steps', 'stints'].sort());
});

test('applySession 을 10회 연속 적용해도 stints / proposals 가 살아 있다', () => {
  let state = stateAt({ pushup: 5 }, [], stints, proposals);
  for (let i = 0; i < 10; i += 1) {
    state = applySession(state, catalog, input('pushup', state.steps.pushup, [1],
      { date: `2026-09-${String(i + 1).padStart(2, '0')}` })).state;
  }
  assert.equal(state.history.length, 10);
  assert.deepEqual(state.stints, stints, '누적 호출에서도 stints 가 소실되지 않는다');
  assert.deepEqual(state.proposals, proposals, '누적 호출에서도 proposals 가 소실되지 않는다');
});

// ---------------------------------------------------------------------------
// promotedTo (FR-8)
// ---------------------------------------------------------------------------

test('승급 시 record.promotedTo 가 채워진다', () => {
  const { evaluation, record } = applySession(
    stateAt({ pushup: 5 }, ready()), catalog, input('pushup', 5, topSets('pushup', 5)));
  assert.equal(evaluation.promote, true);
  assert.equal(record.promotedTo, evaluation.nextStep);
  assert.equal(record.promotedTo, 6);
});

test('미승급 시 promotedTo 필드가 아예 없다', () => {
  const { record } = applySession(stateAt({ pushup: 5 }), catalog, input('pushup', 5, [19, 18]));
  assert.equal(record.promotedTo, undefined);
  assert.equal('promotedTo' in record, false, 'undefined 를 명시 대입하지 않는다');
});

test('SessionInput 에는 promotedTo / blockedBy 필드가 없다 — 엔진만 채운다', () => {
  const inp = input('pushup', 5, [20, 20]);
  assert.equal('promotedTo' in inp, false);
  assert.equal('blockedBy' in inp, false);
});

test('1단계에서 상급자 기준 충족 시 promotedTo 는 2 다', () => {
  const { record } = applySession(
    stateAt({ pushup: 1 }, onePassFromPromotion('pushup', 1)), catalog,
    input('pushup', 1, topSets('pushup', 1)));
  assert.equal(record.promotedTo, 2);
});

test('9단계에서 충족하면 promotedTo 는 10 이다', () => {
  const { record } = applySession(
    stateAt({ pushup: 9 }, onePassFromPromotion('pushup', 9)), catalog,
    input('pushup', 9, topSets('pushup', 9)));
  assert.equal(record.promotedTo, 10);
});

// ---------------------------------------------------------------------------
// blockedBy (EC-11)
// ---------------------------------------------------------------------------

test('EC-11 RPE 거부권으로 보류된 세션은 promotedTo 가 없고 blockedBy 가 rpe 다', () => {
  const { evaluation, record, state } = applySession(
    stateAt({ pushup: 5 }, ready([8, 9])), catalog,
    input('pushup', 5, topSets('pushup', 5), { rpe: 8 }));
  assert.equal(evaluation.promote, false);
  assert.equal(record.promotedTo, undefined);
  assert.equal(record.blockedBy, 'rpe');
  assert.equal(state.steps.pushup, 5, '단계는 오르지 않는다');
});

test('마스터 단계에서 기준 충족 시 blockedBy 가 master 다', () => {
  const { record } = applySession(
    stateAt({ pushup: 10 }, onePassFromPromotion('pushup', 10)), catalog,
    input('pushup', 10, topSets('pushup', 10)));
  assert.equal(record.promotedTo, undefined);
  assert.equal(record.blockedBy, 'master');
});

test('기준 미달일 때는 blockedBy 도 없다', () => {
  const { record } = applySession(stateAt({ pushup: 5 }), catalog, input('pushup', 5, [19, 18]));
  assert.equal(record.blockedBy, undefined);
  assert.equal('blockedBy' in record, false,
    'blockedBy 는 "기준은 채웠으나 막혔다" 를 뜻하지, 단순 미달을 뜻하지 않는다');
});

test('중단한 도전에는 blockedBy 가 붙지 않는다', () => {
  const { record } = applySession(
    stateAt({ pushup: 5 }), catalog, input('pushup', 5, [20, 20], { outcome: 'abandoned' }));
  assert.equal(record.promotedTo, undefined);
  assert.equal(record.blockedBy, undefined);
});

test('다지기 세션에는 promotedTo 도 blockedBy 도 붙지 않는다', () => {
  const { evaluation, record } = applySession(stateAt({ pushup: 5 }), catalog,
    input('pushup', 5, [25, 25], { kind: 'consolidation', performedStep: 4 }));
  assert.equal(evaluation.metTop, false);
  assert.equal(evaluation.promote, false);
  assert.equal(record.promotedTo, undefined);
  assert.equal(record.blockedBy, undefined);
});

// ---------------------------------------------------------------------------
// 입력 검증 / 경계 / 예외
// ---------------------------------------------------------------------------

test('sets 가 빈 배열이면 승급하지 않는다', () => {
  const { evaluation, record } = applySession(
    stateAt({ pushup: 5 }), catalog, input('pushup', 5, []));
  assert.equal(evaluation.metTop, false);
  assert.equal(evaluation.promote, false);
  assert.equal(record.promotedTo, undefined);
});

test('RPE 범위 밖 값은 엔진이 거르지 않는다 — 검증은 호출자 책임이다', () => {
  const low = applySession(stateAt({ pushup: 5 }, ready([0, 0])), catalog,
    input('pushup', 5, topSets('pushup', 5), { rpe: 0 }));
  assert.equal(low.record.promotedTo, 6, '평균 0 → 거부권 없음');

  const high = applySession(stateAt({ pushup: 5 }, ready([11, 11])), catalog,
    input('pushup', 5, topSets('pushup', 5), { rpe: 11 }));
  assert.equal(high.evaluation.blockedBy, 'rpe', '11 도 그대로 평균에 들어간다');
  assert.equal(high.evaluation.promote, false);
});

test('performedStep 없는 다지기는 step - 1 로 해석한다', () => {
  const { evaluation } = applySession(stateAt({ pushup: 5 }), catalog,
    input('pushup', 5, [25, 25], { kind: 'consolidation' }));
  assert.match(evaluation.notes[0], /4단계를 다지는 세션/);
});

test('존재하지 않는 단계 번호는 예외가 그대로 전파된다 — 조용히 실패하지 않는다', () => {
  assert.throws(
    () => applySession(stateAt({ pushup: 5 }), catalog, input('pushup', 11, [20, 20])),
    /11/,
  );
});

// ---------------------------------------------------------------------------
// 통합 — applySession → history → 재평가 없는 판정 (Phase 3B 입력 형태)
// ---------------------------------------------------------------------------

test('연속 세션에서 승급이 정확히 한 번만 기록된다', () => {
  const lead = ready();
  let state = stateAt({ pushup: 5 }, lead, stints, proposals);
  state = applySession(state, catalog,
    input('pushup', 5, topSets('pushup', 5), { date: '2026-09-01' })).state;
  state = applySession(state, catalog, input('pushup', 6, [5], { date: '2026-09-03' })).state;
  state = applySession(state, catalog, input('pushup', 6, [6, 5], { date: '2026-09-05' })).state;

  const promoted = state.history.filter((r) => r.promotedTo !== undefined);
  assert.equal(promoted.length, 1);
  assert.equal(promoted[0].promotedTo, 6);
  assert.equal(promoted[0].date, '2026-09-01');
  assert.equal(state.history.length, lead.length + 3);
});

test('승급 후 이어지는 계획의 단계가 새 단계다', () => {
  const before = stateAt({ pushup: 5 }, ready());
  const { state } = applySession(before, catalog, input('pushup', 5, topSets('pushup', 5)));
  assert.equal(state.steps.pushup, 6);
  assert.equal(planExercise(state, catalog, 'pushup').step, 6);
});

// ── FR-18 자유 운동 필터: RPE 거부권 창에서 free 배제 (ADR-16) ──────────────

test('rpeVeto 는 free 세션의 RPE 를 창에 넣지 않는다', () => {
  // 최근 세션 3개가 free 이고 RPE 9 라도, 이번 work 세션이 상급자 3연속 완성 시점이면
  // 거부권이 발동하지 않아야 한다 — 판정 창은 work 만 본다.
  // 상급자 2연속 통과분(work) + 그 뒤 free 3개(RPE 9) + 이번 세션(work, 상급자 통과).
  const lead: SessionRecord[] = onePassFromPromotion('pushup', 5); // 8세션
  const freeNoise: SessionRecord[] = [1, 2, 3].map((i) => ({
    date: `2026-09-1${i}`, progressionId: 'pushup', step: 5, sets: [20, 20], kind: 'free', rpe: 9,
  }));
  const state = stateAt({ pushup: 5 }, [...lead, ...freeNoise]);
  const { evaluation } = applySession(state, catalog, input('pushup', 5, topSets('pushup', 5)));
  // free 만 있어 rpeVeto 창이 채워지지 않으므로 승급이 성사되어야 한다.
  assert.equal(evaluation.promote, true, 'free 는 RPE 창에 포함되지 않는다');
  assert.equal(evaluation.blockedBy, undefined);
});
