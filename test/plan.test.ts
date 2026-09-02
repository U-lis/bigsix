import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planExercise, planWarmup, withPair } from '../src/plan.ts';
import { catalog, rec, stateAt, targets } from './helpers.ts';

// 푸시업 5단계: 초보 1×5 / 중급 2×10 / 상급 2×20
// 푸시업 2단계: 초보 1×10 / 중급 2×20 / 상급 3×40  (3세트 분기)

test('새 단계 첫 세션은 초보자 기준에 도전한다', () => {
  const p = planExercise(stateAt({ pushup: 5 }), catalog, 'pushup');
  assert.deepEqual(targets(p), ['5+']);
  assert.equal(p.goal.label, 'beginner');
  assert.equal(p.kind, 'work');
});

test('초보자 기준 미달이면 이전 단계 상급자 기준으로 2세트 다진다', () => {
  const s = stateAt({ pushup: 5 }, [rec('pushup', 5, [3])]);
  const p = planExercise(s, catalog, 'pushup');
  assert.equal(p.kind, 'consolidation');
  assert.deepEqual(targets(p), ['25', '25']); // 4단계 상급자 2×25
  assert.match(p.reason, /4단계 상급자 기준 25/);
});

test('다지기 세션 다음에는 다시 초보자 기준에 도전한다', () => {
  const s = stateAt({ pushup: 5 }, [
    rec('pushup', 5, [3]),
    rec('pushup', 5, [25, 25], { kind: 'consolidation' }),
  ]);
  const p = planExercise(s, catalog, 'pushup');
  assert.equal(p.kind, 'work');
  assert.deepEqual(targets(p), ['5+']);
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
  assert.equal(p.paired?.step, 1);
  assert.equal(p.paired?.stepName.ko, '월 헤드스탠드');
  assert.equal(p.unit, 'seconds');
  const p3 = withPair(planExercise(stateAt({ hspu: 3 }), catalog, 'hspu'), s, catalog);
  assert.equal(p3.paired, undefined);
});

test('한쪽 팔/다리 기준 단계는 perSide 로 표시된다', () => {
  assert.equal(planExercise(stateAt({ pushup: 7 }), catalog, 'pushup').perSide, true);
  assert.equal(planExercise(stateAt({ pushup: 6 }), catalog, 'pushup').perSide, false);
});
