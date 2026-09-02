import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canConsolidate, consolidationCount, planConsolidation, planExercise, planWarmup, withPair } from '../src/plan.ts';
import { catalog, rec, stateAt, targets } from './helpers.ts';

// 푸시업 5단계: 초보 1×5 / 중급 2×10 / 상급 2×20
// 푸시업 2단계: 초보 1×10 / 중급 2×20 / 상급 3×40  (3세트 분기)

test('새 단계 첫 세션은 초보자 기준에 도전한다', () => {
  const p = planExercise(stateAt({ pushup: 5 }), catalog, 'pushup');
  assert.deepEqual(targets(p), ['5+']);
  assert.equal(p.goal.label, 'beginner');
  assert.equal(p.kind, 'work');
});

test('도전에 실패해도 다음 계획은 다시 초보자 기준 도전이다', () => {
  const s = stateAt({ pushup: 5 }, [rec('pushup', 5, [3], { outcome: 'abandoned' })]);
  const p = planExercise(s, catalog, 'pushup');
  assert.equal(p.kind, 'work');
  assert.deepEqual(targets(p), ['5+']);
  assert.match(p.reason, /도전 2회차/);
});

test('다지기는 이전 단계 상급자 기준 2세트로 시작한다', () => {
  const s = stateAt({ pushup: 5 }, [rec('pushup', 5, [3], { outcome: 'abandoned' })]);
  const p = planConsolidation(s, catalog, 'pushup');
  assert.equal(p.kind, 'consolidation');
  assert.equal(p.performedStep, 4, '실제로 수행하는 단계는 4단계');
  assert.equal(p.step, 5, '훈련 중인 단계는 5단계 그대로');
  assert.equal(p.stepName.ko, '하프 푸시업');
  assert.deepEqual(targets(p), ['25', '25']); // 4단계 상급자 2×25
});

test('다지기 3회마다 수행량이 기준의 10%씩 올라간다', () => {
  const cons = (n: number) => {
    const history = Array.from({ length: n }, (_, i) =>
      rec('pushup', 5, [30, 30], { kind: 'consolidation', performedStep: 4, date: 'd' + i }));
    return planConsolidation(stateAt({ pushup: 5 }, history), catalog, 'pushup').work[0].target;
  };
  // 기준 25 → 25 / 27.5→28 / 30 / 32.5→33
  assert.deepEqual([0, 1, 2].map(cons), [25, 25, 25]);
  assert.deepEqual([3, 4, 5].map(cons), [28, 28, 28]);
  assert.equal(cons(6), 30);
  assert.equal(cons(9), 33);
});

test('기준이 30이면 30 → 33 → 36 → 39 로 올라간다', () => {
  // 브리지 4단계(초보 1×8)의 이전 단계 = 3단계 상급자 3×30
  const cons = (n: number) => {
    const history = Array.from({ length: n }, (_, i) =>
      rec('bridge', 4, [30, 30], { kind: 'consolidation', performedStep: 3, date: 'd' + i }));
    return planConsolidation(stateAt({ bridge: 4 }, history), catalog, 'bridge').work[0].target;
  };
  assert.deepEqual([0, 3, 6, 9].map(cons), [30, 33, 36, 39]);
});

test('다지기 횟수는 해당 단계의 것만 센다', () => {
  const s = stateAt({ pushup: 5 }, [
    rec('pushup', 4, [25, 25], { kind: 'consolidation' }),
    rec('pushup', 5, [25, 25], { kind: 'consolidation' }),
  ]);
  assert.equal(consolidationCount(s, 'pushup', 5), 1);
  assert.equal(consolidationCount(s, 'pushup', 4), 1);
});

test('1단계에서는 다지기로 내려갈 곳이 없다', () => {
  const s = stateAt({ pushup: 1 });
  assert.equal(canConsolidate(s, catalog, 'pushup'), false);
  assert.throws(() => planConsolidation(s, catalog, 'pushup'), /내려갈 단계가 없다/);
  assert.equal(canConsolidate(stateAt({ pushup: 2 }), catalog, 'pushup'), true);
});

test('초보자 기준을 한 번 넘으면 다지기 흐름에서 빠져나온다', () => {
  const s = stateAt({ pushup: 5 }, [
    rec('pushup', 5, [3], { outcome: 'abandoned' }),
    rec('pushup', 5, [25, 25], { kind: 'consolidation', performedStep: 4 }),
    rec('pushup', 5, [6, 5]),
  ]);
  const p = planExercise(s, catalog, 'pushup');
  assert.equal(p.goal.label, 'intermediate');
  assert.deepEqual(targets(p), ['5', '10+']);
});

test('초보자 통과·중급자 미달이면 유지 1세트 + 중급자까지 최대한', () => {
  const s = stateAt({ pushup: 5 }, [rec('pushup', 5, [6, 5])]);
  const p = planExercise(s, catalog, 'pushup');
  assert.deepEqual(targets(p), ['5', '10+']); // 평균 5.5 → floor 5, 목표 중급 10
  assert.equal(p.goal.label, 'intermediate');
});

test('중급자 통과 후 상급자가 2세트면 유지 1세트 + 상급자까지 최대한', () => {
  const s = stateAt({ pushup: 5 }, [
    rec('pushup', 5, [6, 5]), rec('pushup', 5, [12, 11]),
  ]);
  const p = planExercise(s, catalog, 'pushup');
  assert.deepEqual(targets(p), ['11', '20+']); // 평균 11.5 → 11, 목표 상급 20
  assert.equal(p.goal.label, 'progression');
});

test('상급자가 3세트면 유지 2세트 + 마지막 세트 최대한', () => {
  const s = stateAt({ pushup: 2 }, [
    rec('pushup', 2, [10]), rec('pushup', 2, [22, 21, 20]),
  ]);
  const p = planExercise(s, catalog, 'pushup');
  assert.deepEqual(targets(p), ['21', '21', '40+']); // 평균 21, 목표 상급 3×40
  assert.equal(p.goal.sets, 3);
});

test('직전 평균이 목표의 90% 이상이면 기준 자체에 도전한다', () => {
  const s = stateAt({ pushup: 5 }, [
    rec('pushup', 5, [10, 10]), rec('pushup', 5, [19, 18]),
  ]);
  const p = planExercise(s, catalog, 'pushup');
  assert.deepEqual(targets(p), ['20', '20']); // 평균 18.5 >= 18
  assert.match(p.reason, /90% 이상/);
});

test('직전 RPE 9 이상이면 유지 세트 목표를 1 낮춘다', () => {
  const base = stateAt({ pushup: 5 }, [rec('pushup', 5, [6, 5])]);
  const hard = stateAt({ pushup: 5 }, [rec('pushup', 5, [6, 5], { rpe: 9 })]);
  assert.deepEqual(targets(planExercise(base, catalog, 'pushup')), ['5', '10+']);
  const p = planExercise(hard, catalog, 'pushup');
  assert.deepEqual(targets(p), ['4', '10+']);
  assert.match(p.reason, /RPE 9/);
});

test('워밍업은 최대 2세트, 3단계부터는 직전 두 단계의 중급자 기준', () => {
  // 1~2단계: 1단계 중급(2×25 → 25) + 1단계 상급(3×50 → 50)
  assert.deepEqual(planWarmup(catalog, 'pushup', 2).map((w) => w.target), [25, 50]);
  // 5단계: 3단계 중급 15 + 4단계 중급 12
  assert.deepEqual(planWarmup(catalog, 'pushup', 5).map((w) => w.target), [15, 12]);
  assert.equal(planWarmup(catalog, 'pushup', 9).length, 2);
});

test('핸드스탠드 2단계에는 1단계가 동반 단계로 붙는다', () => {
  const s = stateAt({ hspu: 2 });
  const p = withPair(planExercise(s, catalog, 'hspu'), s, catalog);
  assert.equal(p.paired?.performedStep, 1);
  assert.equal(p.paired?.step, 2, '훈련 중인 단계는 2단계 그대로');
  assert.equal(p.paired?.stepName.ko, '월 헤드스탠드');
  assert.equal(p.unit, 'seconds');
  const p3 = withPair(planExercise(stateAt({ hspu: 3 }), catalog, 'hspu'), s, catalog);
  assert.equal(p3.paired, undefined);
});

test('한쪽 팔/다리 기준 단계는 perSide 로 표시된다', () => {
  assert.equal(planExercise(stateAt({ pushup: 7 }), catalog, 'pushup').perSide, true);
  assert.equal(planExercise(stateAt({ pushup: 6 }), catalog, 'pushup').perSide, false);
});
