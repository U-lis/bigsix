import { test } from 'vitest';
import assert from 'node:assert/strict';
import { abandonChallenge, recordConsolidation, recordSession } from '../../src/lib/domain/session.ts';
import { applySession } from '../../src/lib/domain/evaluate.ts';
import { canConsolidate, consolidationCount, planConsolidation } from '../../src/lib/domain/plan.ts';
import { catalog, rec, stateAt } from './helpers.ts';
import type {
  AppState, ProgramStint, ProgressionId, SessionInput, SessionRecord, SwitchProposal,
} from '../../src/lib/domain/types.ts';

// 푸시업 5단계: 초보 1×5 / 중급 2×10 / 상급 2×20
// 푸시업 4단계: 상급 2×25  → 다지기 기준값 25
// 푸시업 2단계: 초보 1×10 / 상급 3×40

// --- 로컬 픽스처 (test/helpers.ts 는 수정하지 않는다) ---

/** 특정 종목만 n단계인 상태. */
function atStep(id: ProgressionId, n: number, history: SessionRecord[] = []): AppState {
  return stateAt({ [id]: n }, history);
}

/** 같은 단계에서 다지기가 n회 누적된 history 를 얹은 상태. */
function withConsolidations(
  state: AppState, id: ProgressionId, step: number, n: number,
): AppState {
  const extra = Array.from({ length: n }, (_, i) =>
    rec(id, step, [25, 25], { kind: 'consolidation', performedStep: step - 1, date: `2026-08-0${i + 1}` }));
  return { ...state, history: [...state.history, ...extra] };
}

/** 구간 1개 + pending 제안 1건이 담긴 상태 (C-2 검증용). */
function stateWithSideData(id: ProgressionId, n: number): AppState {
  const stint: ProgramStint = {
    programId: 'good-behavior',
    selectedAt: '2026-09-01',
    startedAt: '2026-09-02',
    endedAt: null,
  };
  const proposal: SwitchProposal = {
    proposedAt: '2026-09-07',
    fromProgramId: 'good-behavior',
    toProgramId: 'veteran',
    status: 'pending',
    resolvedAt: null,
  };
  return stateAt({ [id]: n }, [], [stint], [proposal]);
}

const ALL_IDS: ProgressionId[] =
  ['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'];

// =====================================================================
// abandonChallenge — 기록 (FR-7.1)
// =====================================================================

test("abandonChallenge 는 outcome: 'abandoned' 인 work 세션으로 기록한다", () => {
  const r = abandonChallenge(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [3, 2]);
  assert.equal(r.record.outcome, 'abandoned');
  assert.equal(r.record.kind, 'work');
  assert.deepEqual(r.record.sets, [3, 2]);
});

test('abandonChallenge 는 history 에 1건만 추가한다', () => {
  const s = atStep('pushup', 5);
  const r = abandonChallenge(s, catalog, 'pushup', '2026-09-07', [3, 2]);
  assert.equal(r.state.history.length, s.history.length + 1);
  assert.equal(r.state.history.at(-1), r.record);
});

test('abandonChallenge 후 단계가 유지된다 (승급도 강등도 없다)', () => {
  const s = atStep('pushup', 5);
  const r = abandonChallenge(s, catalog, 'pushup', '2026-09-07', [3, 2]);
  assert.equal(r.state.steps.pushup, 5);
});

test('abandonChallenge 는 상급자 기준을 채운 세트여도 승급시키지 않는다', () => {
  const r = abandonChallenge(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [20, 20]);
  assert.equal(r.record.promotedTo, undefined);
  assert.equal(r.state.steps.pushup, 5);
});

test('abandonChallenge 의 record.date 는 인자로 준 날짜다', () => {
  const r = abandonChallenge(atStep('pushup', 5), catalog, 'pushup', '2026-09-11', [3]);
  assert.equal(r.record.date, '2026-09-11');
});

test('abandonChallenge 에 rpe 를 넘기면 기록에 남는다', () => {
  const r = abandonChallenge(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [3], 9);
  assert.equal(r.record.rpe, 9);
});

test('abandonChallenge 에 rpe 를 생략하면 record.rpe 가 undefined 다', () => {
  const r = abandonChallenge(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [3]);
  assert.equal(r.record.rpe, undefined);
  assert.equal('rpe' in r.record, false, 'undefined 를 명시 대입하지 않는다');
});

test('NFR-2 abandonChallenge 는 원본 state 를 변형하지 않는다', () => {
  const s = atStep('pushup', 5);
  const snapshot = JSON.parse(JSON.stringify(s));
  abandonChallenge(s, catalog, 'pushup', '2026-09-07', [3, 2]);
  assert.deepEqual(s, snapshot);
});

// =====================================================================
// abandonChallenge — 다지기 계획 (FR-7.2, FR-7.3)
// =====================================================================

test('2단계 이상에서는 canConsolidate 가 true 이고 다지기 계획이 나온다', () => {
  const r = abandonChallenge(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [3, 2]);
  assert.equal(r.canConsolidate, true);
  assert.notEqual(r.consolidation, null);
});

test("다지기 계획의 kind 는 'consolidation' 이다", () => {
  const r = abandonChallenge(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [3, 2]);
  assert.equal(r.consolidation!.kind, 'consolidation');
});

test('다지기 계획의 performedStep 은 step - 1 이다', () => {
  const r = abandonChallenge(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [3, 2]);
  assert.equal(r.consolidation!.performedStep, 4);
});

test('다지기 계획의 step 은 훈련 중인 단계 그대로다', () => {
  const r = abandonChallenge(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [3, 2]);
  assert.equal(r.consolidation!.step, 5);
});

test('FR-7.3 다지기 계획이 planConsolidation 직접 호출 결과와 완전히 동일하다', () => {
  const s = atStep('pushup', 5);
  const r = abandonChallenge(s, catalog, 'pushup', '2026-09-07', [3, 2]);
  // 포기 기록이 반영된 상태 기준으로 계획된다.
  const direct = planConsolidation(r.state, catalog, 'pushup');
  assert.deepEqual(r.consolidation, direct, '재구현이 아니라 위임이다');
  assert.deepEqual(r.consolidation!.work, direct.work);
  assert.deepEqual(r.consolidation!.goal, direct.goal);
  assert.deepEqual(r.consolidation!.warmup, direct.warmup);
  assert.equal(r.consolidation!.reason, direct.reason);
});

test('FR-7.3 다지기 3회 누적 시 10% 증량이 session.ts 경유에서도 그대로 작동한다', () => {
  const base = planConsolidation(atStep('pushup', 5), catalog, 'pushup').work[0].target;
  assert.equal(base, 25, '4단계 상급자 기준 25');

  const s = withConsolidations(atStep('pushup', 5), 'pushup', 5, 3);
  const r = abandonChallenge(s, catalog, 'pushup', '2026-09-07', [3, 2]);
  assert.equal(r.consolidation!.work[0].target, Math.round(base * 1.1));
  assert.match(r.consolidation!.reason, /다지기 3회 누적/);
});

// --- 다지기 자동 기록 금지 (FR-7.2) ---

test('abandonChallenge 는 다지기 세션을 history 에 넣지 않는다', () => {
  const s = atStep('pushup', 5);
  const r = abandonChallenge(s, catalog, 'pushup', '2026-09-07', [3, 2]);
  assert.equal(r.state.history.length, 1);
  assert.equal(r.state.history.filter((x) => x.kind === 'consolidation').length, 0);
});

test('반환된 consolidation 은 계획(PlannedExercise)이지 기록(SessionRecord)이 아니다', () => {
  const r = abandonChallenge(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [3, 2]);
  const c = r.consolidation!;
  // 계획에만 있는 필드
  assert.ok(Array.isArray(c.work));
  assert.ok(Array.isArray(c.warmup));
  assert.ok(typeof c.reason === 'string');
  // 기록에만 있는 필드는 없다
  assert.equal((c as unknown as Record<string, unknown>).date, undefined);
  assert.equal((c as unknown as Record<string, unknown>).sets, undefined);
});

// =====================================================================
// abandonChallenge — 1단계 (EC-9 / FR-7.4)
// =====================================================================

test('EC-9 1단계에서 포기하면 canConsolidate 가 false 다', () => {
  const r = abandonChallenge(atStep('pushup', 1), catalog, 'pushup', '2026-09-07', [2]);
  assert.equal(r.canConsolidate, false);
});

test('EC-9 1단계에서 consolidation 은 null 이고 예외가 나지 않는다', () => {
  const r = abandonChallenge(atStep('pushup', 1), catalog, 'pushup', '2026-09-07', [2]);
  assert.equal(r.consolidation, null);
  assert.equal(canConsolidate(r.state, catalog, 'pushup'), false);
});

test('EC-9 / FR-7.4 1단계는 그대로 유지된다 — 0 이나 음수가 되지 않는다', () => {
  const r = abandonChallenge(atStep('pushup', 1), catalog, 'pushup', '2026-09-07', [2]);
  assert.equal(r.state.steps.pushup, 1);
});

test('EC-9 다지기가 불가능해도 abandoned 기록 자체는 남는다', () => {
  const r = abandonChallenge(atStep('pushup', 1), catalog, 'pushup', '2026-09-07', [2]);
  assert.equal(r.state.history.length, 1);
  assert.equal(r.state.history[0].outcome, 'abandoned');
});

test('EC-9 6종목 전부 1단계에서 동일하게 동작한다', () => {
  for (const id of ALL_IDS) {
    const r = abandonChallenge(atStep(id, 1), catalog, id, '2026-09-07', [1]);
    assert.equal(r.canConsolidate, false, id);
    assert.equal(r.consolidation, null, id);
    assert.equal(r.state.steps[id], 1, id);
    assert.equal(r.record.outcome, 'abandoned', id);
  }
});

test('경계 2단계는 canConsolidate true 이고 performedStep 이 1 이다', () => {
  const r = abandonChallenge(atStep('pushup', 2), catalog, 'pushup', '2026-09-07', [3]);
  assert.equal(r.canConsolidate, true);
  assert.equal(r.consolidation!.performedStep, 1);
});

test('경계 10단계는 canConsolidate true 이고 performedStep 이 9 다', () => {
  const r = abandonChallenge(atStep('pushup', 10), catalog, 'pushup', '2026-09-07', [3]);
  assert.equal(r.canConsolidate, true);
  assert.equal(r.consolidation!.performedStep, 9);
});

// --- 입력 검증 ---

test('sets: [] 로 포기해도 기록은 남고 미승급이며 예외가 없다', () => {
  const r = abandonChallenge(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', []);
  assert.deepEqual(r.record.sets, []);
  assert.equal(r.record.promotedTo, undefined);
  assert.equal(r.state.steps.pushup, 5);
});

test('존재하지 않는 종목 id 는 기존 예외가 그대로 전파된다', () => {
  assert.throws(
    () => abandonChallenge(atStep('pushup', 5), catalog, 'nope' as ProgressionId, '2026-09-07', [1]),
    /알 수 없는 종목/,
  );
});

test('rpe 범위 밖 값은 검증하지 않는다', () => {
  const r = abandonChallenge(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [3], 42);
  assert.equal(r.record.rpe, 42);
});

test('빈 history 상태에서의 첫 포기도 정상 동작한다', () => {
  const s = atStep('pushup', 5);
  assert.equal(s.history.length, 0);
  const r = abandonChallenge(s, catalog, 'pushup', '2026-09-07', [3]);
  assert.equal(r.state.history.length, 1);
  assert.equal(r.canConsolidate, true);
});

// =====================================================================
// recordSession (FR-7.5, EC-4)
// =====================================================================

const work = (
  id: ProgressionId, step: number, sets: number[], date = '2026-09-07',
): SessionInput => ({ date, progressionId: id, step, sets, kind: 'work' });

test('recordSession 은 applySession 과 동일한 결과를 반환한다', () => {
  const s = atStep('pushup', 5);
  const input = work('pushup', 5, [20, 20]);
  const viaWrapper = recordSession(s, catalog, input);
  const direct = applySession(s, catalog, input);
  assert.deepEqual(viaWrapper.state, direct.state);
  assert.deepEqual(viaWrapper.evaluation, direct.evaluation);
  assert.deepEqual(viaWrapper.record, direct.record);
});

test('EC-4 / FR-7.5 같은 날 같은 종목을 두 번 기록할 수 있다', () => {
  const s = atStep('pushup', 5);
  const a = recordSession(s, catalog, work('pushup', 5, [3, 2]));
  const b = recordSession(a.state, catalog, work('pushup', 5, [4, 3]));
  assert.equal(b.state.history.length, 2);
  assert.equal(b.state.history[0].date, '2026-09-07');
  assert.equal(b.state.history[1].date, '2026-09-07');
});

test('EC-4 / FR-7.5 두 기록이 각각 독립적으로 승급 판정된다', () => {
  const s = atStep('pushup', 5);
  // 첫 세션: 상급자 기준 2×20 미달
  const a = recordSession(s, catalog, work('pushup', 5, [12, 10]));
  assert.equal(a.record.promotedTo, undefined);
  assert.equal(a.state.steps.pushup, 5);
  // 두 번째 세션: 같은 날, 기준 충족
  const b = recordSession(a.state, catalog, work('pushup', 5, [20, 20]));
  assert.equal(b.record.promotedTo, 6);
  assert.equal(b.state.steps.pushup, 6);
});

test('EC-4 첫 세션에서 승급하면 두 번째 세션의 step 이 새 단계다', () => {
  const s = atStep('pushup', 5);
  const a = recordSession(s, catalog, work('pushup', 5, [20, 20]));
  assert.equal(a.state.steps.pushup, 6);
  const b = recordSession(a.state, catalog, work('pushup', a.state.steps.pushup, [3]));
  assert.equal(a.record.step, 5);
  assert.equal(b.record.step, 6);
  assert.notEqual(a.record.step, b.record.step);
});

test('EC-4 같은 날 3회 이상도 허용된다', () => {
  let s = atStep('pushup', 5);
  for (let i = 0; i < 4; i += 1) {
    s = recordSession(s, catalog, work('pushup', 5, [3, 2])).state;
  }
  assert.equal(s.history.length, 4);
});

test('날짜 역순 기록도 거부되지 않는다 — 검증 로직이 없는 것이 사양이다', () => {
  const s = atStep('pushup', 5);
  const a = recordSession(s, catalog, work('pushup', 5, [3], '2026-09-10'));
  const b = recordSession(a.state, catalog, work('pushup', 5, [3], '2026-09-07'));
  assert.equal(b.state.history.length, 2);
  assert.equal(b.state.history[0].date, '2026-09-10');
  assert.equal(b.state.history[1].date, '2026-09-07');
});

test('NFR-2 recordSession 은 원본 state 를 변형하지 않는다', () => {
  const s = atStep('pushup', 5);
  const snapshot = JSON.parse(JSON.stringify(s));
  recordSession(s, catalog, work('pushup', 5, [20, 20]));
  assert.deepEqual(s, snapshot);
});

// =====================================================================
// recordConsolidation (FR-7.2)
// =====================================================================

test("recordConsolidation 은 kind: 'consolidation' 으로 기록한다", () => {
  const r = recordConsolidation(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [25, 25]);
  assert.equal(r.record.kind, 'consolidation');
});

test('recordConsolidation 은 step 을 유지하고 performedStep 만 하나 내린다', () => {
  const r = recordConsolidation(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [25, 25]);
  assert.equal(r.record.step, 5);
  assert.equal(r.record.performedStep, 4);
});

test('recordConsolidation 후에도 단계가 유지된다', () => {
  const r = recordConsolidation(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [25, 25]);
  assert.equal(r.state.steps.pushup, 5);
});

test('recordConsolidation 은 승급 판정 대상이 아니다', () => {
  // 5단계 상급자 기준 2×20 을 넘는 세트여도 승급하지 않는다.
  const r = recordConsolidation(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [30, 30]);
  assert.equal(r.record.promotedTo, undefined);
  assert.equal(r.state.steps.pushup, 5);
});

test('recordConsolidation 은 outcome 을 설정하지 않는다', () => {
  const r = recordConsolidation(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [25, 25]);
  assert.equal(r.record.outcome, undefined);
  assert.equal('outcome' in r.record, false);
});

test('recordConsolidation 에 rpe 를 넘기면 기록에 남는다', () => {
  const r = recordConsolidation(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [25, 25], 7);
  assert.equal(r.record.rpe, 7);
});

test('1단계에서 recordConsolidation 을 호출하면 예외를 던진다', () => {
  assert.throws(
    () => recordConsolidation(atStep('pushup', 1), catalog, 'pushup', '2026-09-07', [10]),
    /pushup 1단계에서는 다지기로 내려갈 단계가 없다/,
  );
});

test('1단계에서 예외가 난 뒤 기록이 남지 않는다', () => {
  const s = atStep('pushup', 1);
  assert.throws(() => recordConsolidation(s, catalog, 'pushup', '2026-09-07', [10]));
  assert.equal(s.history.length, 0);
});

test('기록된 다지기가 consolidationCount 에 반영되어 다음 증량 계산에 쓰인다', () => {
  let s: AppState = atStep('pushup', 5);
  for (let i = 0; i < 3; i += 1) {
    s = recordConsolidation(s, catalog, 'pushup', `2026-09-0${i + 1}`, [25, 25]).state;
  }
  assert.equal(consolidationCount(s, 'pushup', 5), 3);
  assert.equal(planConsolidation(s, catalog, 'pushup').work[0].target, Math.round(25 * 1.1));
});

test('NFR-2 recordConsolidation 은 원본 state 를 변형하지 않는다', () => {
  const s = atStep('pushup', 5);
  const snapshot = JSON.parse(JSON.stringify(s));
  recordConsolidation(s, catalog, 'pushup', '2026-09-07', [25, 25]);
  assert.deepEqual(s, snapshot);
});

// =====================================================================
// 필드 보존 (C-2) — session.ts 3함수 전부
// =====================================================================

test('C-2 abandonChallenge 후 stints / proposals 가 보존된다', () => {
  const s = stateWithSideData('pushup', 5);
  const r = abandonChallenge(s, catalog, 'pushup', '2026-09-07', [3, 2]);
  assert.notEqual(r.state.stints, undefined);
  assert.notEqual(r.state.proposals, undefined);
  assert.deepEqual(r.state.stints, s.stints);
  assert.deepEqual(r.state.proposals, s.proposals);
  assert.equal(r.state.stints.length, 1);
  assert.equal(r.state.proposals.length, 1);
});

test('C-2 recordSession 후 stints / proposals 가 보존된다', () => {
  const s = stateWithSideData('pushup', 5);
  const r = recordSession(s, catalog, work('pushup', 5, [20, 20]));
  assert.deepEqual(r.state.stints, s.stints);
  assert.deepEqual(r.state.proposals, s.proposals);
});

test('C-2 recordConsolidation 후 stints / proposals 가 보존된다', () => {
  const s = stateWithSideData('pushup', 5);
  const r = recordConsolidation(s, catalog, 'pushup', '2026-09-07', [25, 25]);
  assert.deepEqual(r.state.stints, s.stints);
  assert.deepEqual(r.state.proposals, s.proposals);
});

test('C-2 세 함수를 연속 호출해도 stints / proposals 가 보존된다', () => {
  const s = stateWithSideData('pushup', 5);
  const a = abandonChallenge(s, catalog, 'pushup', '2026-09-07', [3, 2]);
  const b = recordConsolidation(a.state, catalog, 'pushup', '2026-09-07', [25, 25]);
  const c = recordSession(b.state, catalog, work('pushup', 5, [10, 10], '2026-09-09'));
  assert.deepEqual(c.state.stints, s.stints);
  assert.deepEqual(c.state.proposals, s.proposals);
  assert.equal(c.state.history.length, 3);
});

test('C-2 세 함수의 반환 상태가 AppState 4필드를 모두 가진다', () => {
  const s = stateWithSideData('pushup', 5);
  const states: AppState[] = [
    abandonChallenge(s, catalog, 'pushup', '2026-09-07', [3]).state,
    recordSession(s, catalog, work('pushup', 5, [3])).state,
    recordConsolidation(s, catalog, 'pushup', '2026-09-07', [25, 25]).state,
  ];
  for (const st of states) {
    assert.deepEqual(Object.keys(st).sort(), ['history', 'proposals', 'steps', 'stints']);
  }
});

// =====================================================================
// 통합 — FR-7 전체 흐름
// =====================================================================

test('FR-7 흐름: 포기 → 확인 → 승인 → 다지기 수행', () => {
  const s = atStep('pushup', 5);

  const abandoned = abandonChallenge(s, catalog, 'pushup', '2026-09-07', [3, 2]);
  assert.equal(abandoned.state.history.length, 1);
  assert.equal(abandoned.canConsolidate, true);
  assert.notEqual(abandoned.consolidation, null);

  // 사용자가 승인해 다지기를 수행한다.
  const targets = abandoned.consolidation!.work.map((w) => w.target);
  const done = recordConsolidation(
    abandoned.state, catalog, 'pushup', '2026-09-07', targets);

  assert.equal(done.state.history.length, 2);
  assert.equal(done.state.history[0].outcome, 'abandoned');
  assert.equal(done.state.history[0].kind, 'work');
  assert.equal(done.state.history[1].kind, 'consolidation');
  assert.equal(done.state.history[1].performedStep, 4);
  assert.equal(done.state.steps.pushup, 5);
});

test('FR-7 흐름: 사용자가 다지기를 거절하면 포기 기록만 남는다', () => {
  const s = atStep('pushup', 5);
  const abandoned = abandonChallenge(s, catalog, 'pushup', '2026-09-07', [3, 2]);
  // recordConsolidation 을 호출하지 않는다.
  assert.equal(abandoned.state.history.length, 1);
  assert.equal(abandoned.state.steps.pushup, 5);
});

test('FR-4.3 근거: 다지기를 거절해도 abandoned 기록이 남는다', () => {
  const r = abandonChallenge(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [3, 2]);
  assert.equal(r.state.history.filter((x) => x.outcome === 'abandoned').length, 1);
});

test('FR-4.3 근거: 포기 + 다지기 수행 시 두 근거가 모두 남는다', () => {
  const a = abandonChallenge(atStep('pushup', 5), catalog, 'pushup', '2026-09-07', [3, 2]);
  const b = recordConsolidation(a.state, catalog, 'pushup', '2026-09-07', [25, 25]);
  assert.equal(b.state.history.filter((x) => x.outcome === 'abandoned').length, 1);
  assert.equal(b.state.history.filter((x) => x.kind === 'consolidation').length, 1);
});

test('포기 → 다지기 를 4회 반복하면 3회마다 10% 증량이 적용된다', () => {
  let s: AppState = atStep('pushup', 5);
  const seen: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const date = `2026-09-0${i + 1}`;
    const a = abandonChallenge(s, catalog, 'pushup', date, [3, 2]);
    assert.equal(a.canConsolidate, true);
    const target = a.consolidation!.work[0].target;
    seen.push(target);
    s = recordConsolidation(a.state, catalog, 'pushup', date, [target, target]).state;
  }
  // 4단계 상급자 기준 25 에서 시작해 3회 누적 후 10% 증량
  assert.deepEqual(seen, [25, 25, 25, Math.round(25 * 1.1)]);
  assert.equal(s.steps.pushup, 5, '흐름 전체에서 단계가 유지된다');
});
