import { test } from 'vitest';
import assert from 'node:assert/strict';
import { canConsolidate, consolidationCount, planConsolidation, planExercise, withPair } from '../../src/lib/domain/plan.ts';
import { planDay } from '../../src/lib/domain/schedule.ts';
import { catalog, rec, stateAt, targets } from './helpers.ts';

// 푸시업 5단계 초보자 기준(1×5)을 채우는 세션. 연속을 한 칸 올린다.
const pass5 = () => rec('pushup', 5, [5]);

// 푸시업 5단계: 초보 1×5 / 중급 2×10 / 상급 2×20
// 푸시업 2단계: 초보 1×10 / 중급 2×20 / 상급 3×40  (3세트 분기)

test('새 단계 첫 세션은 초보자 기준에 도전한다', () => {
  const p = planExercise(stateAt({ pushup: 5 }), catalog, 'pushup');
  assert.deepEqual(targets(p), ['5+']);
  assert.equal(p.goal.label, 'beginner');
  assert.equal(p.kind, 'work');
});

test('FR-22.3b 중단하면 다음 계획은 같은 목표로 재도전이다', () => {
  const s = stateAt({ pushup: 5 }, [rec('pushup', 5, [3], { outcome: 'abandoned' })]);
  const p = planExercise(s, catalog, 'pushup');
  assert.equal(p.kind, 'work');
  assert.deepEqual(targets(p), ['5+'], '난도를 낮추지 않는다');
  assert.match(p.reason, /재도전/);
  assert.match(p.reason, /0\/3회 연속/, '중단은 연속을 깨지도 올리지도 않는다');
});

test('FR-22.3a 중단해도 쌓인 연속은 유지된다', () => {
  const s = stateAt({ pushup: 5 }, [
    pass5(), pass5(), rec('pushup', 5, [3], { outcome: 'abandoned' }),
  ]);
  assert.match(planExercise(s, catalog, 'pushup').reason, /2\/3회 연속/);
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

test('중단·다지기를 거쳐도 초보자 3연속을 채우면 중급자로 넘어간다', () => {
  const s = stateAt({ pushup: 5 }, [
    pass5(),
    rec('pushup', 5, [3], { outcome: 'abandoned' }),
    rec('pushup', 5, [25, 25], { kind: 'consolidation', performedStep: 4 }),
    pass5(), pass5(),
  ]);
  const p = planExercise(s, catalog, 'pushup');
  assert.equal(p.goal.label, 'intermediate');
  assert.deepEqual(targets(p), ['10+', '10+']);
});

test('FR-22 초보자 3연속을 채우면 중급자 기준이 목표가 된다', () => {
  const s = stateAt({ pushup: 5 }, [pass5(), pass5(), pass5()]);
  const p = planExercise(s, catalog, 'pushup');
  assert.deepEqual(targets(p), ['10+', '10+'], '중급자 2×10 을 그대로 노린다');
  assert.equal(p.goal.label, 'intermediate');
  assert.match(p.reason, /중급자 기준 2×10 · 0\/3회 연속/);
});

test('FR-22.3 미달하면 연속만 0 이 되고 목표는 그 기준에 머문다 (EC-49)', () => {
  const s = stateAt({ pushup: 5 }, [pass5(), pass5(), pass5(), rec('pushup', 5, [1])]);
  const p = planExercise(s, catalog, 'pushup');
  assert.equal(p.goal.label, 'intermediate', '초보자로 되돌아가지 않는다');
  assert.match(p.reason, /0\/3회 연속/);
});

test('FR-22 중급자 3연속을 채우면 상급자 기준이 목표가 된다', () => {
  const inter = () => rec('pushup', 5, [10, 10]);
  const s = stateAt({ pushup: 5 }, [
    pass5(), pass5(), pass5(), inter(), inter(), inter(),
  ]);
  const p = planExercise(s, catalog, 'pushup');
  assert.deepEqual(targets(p), ['20+', '20+']);
  assert.equal(p.goal.label, 'progression');
});

test('FR-22 상급자가 3세트인 단계는 세 세트가 목표다', () => {
  const beg = () => rec('pushup', 2, [10]);
  const inter = () => rec('pushup', 2, [20, 20]);
  const s = stateAt({ pushup: 2 }, [
    beg(), beg(), beg(), inter(), inter(), inter(),
  ]);
  const p = planExercise(s, catalog, 'pushup');
  assert.deepEqual(targets(p), ['40+', '40+', '40+']);
  assert.equal(p.goal.sets, 3);
});

test('FR-20 계획에 워밍업이 없다', () => {
  // 워밍업은 책에 없는 규칙이었고, 낮은 단계의 승급 기준을 그대로 준비운동 분량으로
  // 써서 본세트의 4~7배가 나왔다. 개념째 제거했다.
  const p = planExercise(stateAt({ pushup: 2 }), catalog, 'pushup');
  assert.equal('warmup' in (p as unknown as Record<string, unknown>), false);
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

// ---------------------------------------------------------------------------
// FR-1: 좌우 고지 sideNote
// ---------------------------------------------------------------------------

test('perSide 단계의 스쿼트 고지는 "다리" 를 쓴다', () => {
  const p = planExercise(stateAt({ squat: 7 }), catalog, 'squat');
  assert.equal(p.perSide, true);
  assert.match(p.sideNote!, /다리/);
  assert.match(p.sideNote!, /적게 한 쪽/);
  assert.doesNotMatch(p.sideNote!, /팔/);
});

test('perSide 단계의 푸시업 고지는 "팔" 을 쓴다', () => {
  const p = planExercise(stateAt({ pushup: 7 }), catalog, 'pushup');
  assert.equal(p.sideNote, '양쪽 팔을 모두 수행하고, 적게 한 쪽의 횟수를 입력한다.');
});

test('perSide 단계의 풀업 고지는 "팔" 을 쓴다', () => {
  assert.match(planExercise(stateAt({ pullup: 7 }), catalog, 'pullup').sideNote!, /양쪽 팔/);
});

test('perSide 단계의 핸드스탠드 푸시업 고지는 "팔" 을 쓴다', () => {
  assert.match(planExercise(stateAt({ hspu: 7 }), catalog, 'hspu').sideNote!, /양쪽 팔/);
});

test('perSide 가 아닌 단계는 sideNote 가 undefined 다', () => {
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const p = planExercise(stateAt({ pushup: n }), catalog, 'pushup');
    assert.equal(p.perSide, false);
    assert.equal(p.sideNote, undefined, `${n}단계`);
  }
});

test('레그레이즈와 브리지는 모든 단계에서 sideNote 가 undefined 다', () => {
  for (const id of ['legraise', 'bridge'] as const) {
    for (let n = 1; n <= 10; n += 1) {
      assert.equal(planExercise(stateAt({ [id]: n }), catalog, id).sideNote, undefined,
        `${id} ${n}단계`);
    }
  }
});

test('sideNote 가 붙는 (종목, 단계) 조합은 정확히 16개다', () => {
  const found: string[] = [];
  for (const prog of catalog.progressions) {
    for (let n = 1; n <= 10; n += 1) {
      const p = planExercise(stateAt({ [prog.id]: n }), catalog, prog.id);
      if (p.sideNote !== undefined) found.push(`${prog.id}:${n}`);
    }
  }
  const expected = ['pushup', 'squat', 'pullup', 'hspu']
    .flatMap((id) => [7, 8, 9, 10].map((n) => `${id}:${n}`));
  assert.equal(found.length, 16);
  assert.deepEqual(found.sort(), expected.sort());
});

test('현재 데이터의 perSide 단계는 모두 reps 이므로 고지는 "횟수" 를 쓴다', () => {
  for (const prog of catalog.progressions) {
    for (const step of prog.steps) {
      if (step.perSide !== true) continue;
      assert.equal(step.unit, 'reps', `${prog.id} ${step.n}단계`);
      const p = planExercise(stateAt({ [prog.id]: step.n }), catalog, prog.id);
      assert.match(p.sideNote!, /횟수/);
      assert.doesNotMatch(p.sideNote!, /유지 시간/);
    }
  }
});

test('다지기의 sideNote 는 이전 단계 기준이다', () => {
  // 8단계에서 다지기 → 실제 수행은 7단계(perSide)
  const p = planConsolidation(stateAt({ pushup: 8 }), catalog, 'pushup');
  assert.equal(p.performedStep, 7);
  assert.equal(p.perSide, true);
  assert.match(p.sideNote!, /양쪽 팔/);
});

test('이전 단계가 perSide 가 아니면 다지기의 sideNote 도 undefined 다', () => {
  // 7단계에서 다지기 → 실제 수행은 6단계(perSide 아님)
  const p = planConsolidation(stateAt({ pushup: 7 }), catalog, 'pushup');
  assert.equal(p.performedStep, 6);
  assert.equal(p.perSide, false);
  assert.equal(p.sideNote, undefined);
});

test('동반 단계에도 sideNote 가 채워진다', () => {
  const s = stateAt({ hspu: 2 });
  const p = withPair(planExercise(s, catalog, 'hspu'), s, catalog);
  assert.equal(p.paired?.performedStep, 1);
  // 1단계는 perSide 가 아니다 → 동반 단계 고지도 없다
  assert.equal(p.paired?.perSide, false);
  assert.equal(p.paired?.sideNote, undefined);
  assert.equal('sideNote' in p.paired!, true, 'sideNote 필드 자체는 존재한다');
});

test('sideNote 는 state / history 와 무관하게 (종목, 단계) 로만 결정된다', () => {
  const empty = planExercise(stateAt({ pushup: 7 }), catalog, 'pushup');
  const beg7 = () => rec('pushup', 7, [5]);
  const busy = planExercise(stateAt({ pushup: 7 }, [
    beg7(), beg7(), beg7(),
    rec('pushup', 7, [20, 20], { kind: 'consolidation', performedStep: 6 }),
  ]), catalog, 'pushup');
  assert.notDeepEqual(
    [empty.goal.label, empty.reason], [busy.goal.label, busy.reason],
    '판정 경로는 서로 다르다',
  );
  assert.equal(empty.sideNote, busy.sideNote, '고지는 동일하다');
});

// FR-1.5 — sideNote 는 수치 계산에 관여하지 않는다
test('sideNote 가 붙어도 work / goal / reason 이 그대로다', () => {
  // perSide 단계 (pushup 7: 초보 1×5 / 중급 2×9 / 상급 2×20 미만은 데이터에 따름)
  const withNote = planExercise(stateAt({ pushup: 7 }, [
    rec('pushup', 7, [6, 5]),
  ]), catalog, 'pushup');
  assert.notEqual(withNote.sideNote, undefined);
  // 비-perSide 단계와 동일한 구조 필드 집합을 갖는다 (sideNote 만 값이 다르다)
  const noNote = planExercise(
    stateAt({ pushup: 5 }, [pass5(), pass5(), pass5()]), catalog, 'pushup');
  assert.deepEqual(Object.keys(withNote).sort(), Object.keys(noNote).sort());
  assert.equal(noNote.sideNote, undefined);

  // FR-22 수치 스냅샷 — 초보자 3연속 뒤에는 중급자 기준(2×10)이 그대로 목표다
  assert.deepEqual(noNote.work, [
    { target: 10, mode: 'max' }, { target: 10, mode: 'max' },
  ]);
  assert.deepEqual(noNote.goal, { label: 'intermediate', sets: 2, value: 10 });
  assert.equal(noNote.reason, '중급자 기준 2×10 · 0/3회 연속.');
});

test('sideNote 내용이 reason 에 섞이지 않는다', () => {
  for (const id of ['pushup', 'squat', 'pullup', 'hspu'] as const) {
    for (const n of [7, 8, 9, 10]) {
      const p = planExercise(stateAt({ [id]: n }), catalog, id);
      assert.doesNotMatch(p.reason, /적게 한 쪽/, `${id} ${n}단계`);
    }
  }
  const c = planConsolidation(stateAt({ pushup: 8 }), catalog, 'pushup');
  assert.doesNotMatch(c.reason, /적게 한 쪽/);
});

test('다지기의 수치는 sideNote 와 무관하게 이전 단계 상급자 기준 그대로다', () => {
  const p = planConsolidation(stateAt({ pushup: 8 }), catalog, 'pushup');
  const prev = catalog.progressions.find((x) => x.id === 'pushup')!.steps[6];
  const base = typeof prev.progression!.value === 'number' ? prev.progression!.value : 0;
  assert.deepEqual(targets(p), [String(base), String(base)]);
});

test('planDay 를 거쳐도 종목별 sideNote 가 올바르게 실린다 (DayPlan 구조 무손상)', () => {
  const s = stateAt({ pushup: 7, legraise: 7 });
  const day = planDay(s, catalog, 'good_behavior', '월');
  const byId = Object.fromEntries(day.exercises.map((e) => [e.progressionId, e]));
  assert.match(byId.pushup.sideNote!, /양쪽 팔/);
  assert.equal(byId.legraise.sideNote, undefined);
  assert.equal(day.exercises.length, 2);
  assert.deepEqual(Object.keys(day).sort(), ['exercises', 'locked', 'rest', 'weekday']);

  const wed = planDay(stateAt({ squat: 7, pullup: 7 }), catalog, 'good_behavior', '수');
  const wedById = Object.fromEntries(wed.exercises.map((e) => [e.progressionId, e]));
  assert.match(wedById.squat.sideNote!, /양쪽 다리/);
  assert.match(wedById.pullup.sideNote!, /양쪽 팔/);
});
