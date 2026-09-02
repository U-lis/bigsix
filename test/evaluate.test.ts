import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySession, evaluateSession } from '../src/evaluate.ts';
import { catalog, rec, stateAt } from './helpers.ts';

test('상급자 기준 미달이면 단계를 유지한다', () => {
  const e = evaluateSession(stateAt({ pushup: 5 }), catalog, rec('pushup', 5, [19, 18]));
  assert.equal(e.promote, false);
  assert.equal(e.nextStep, 5);
  assert.equal(e.metIntermediate, true);
});

test('상급자 기준을 채우면 다음 단계로 올린다', () => {
  const e = evaluateSession(stateAt({ pushup: 5 }), catalog, rec('pushup', 5, [20, 20]));
  assert.equal(e.promote, true);
  assert.equal(e.nextStep, 6);
});

test('3세트 기준은 세 세트를 모두 채워야 한다', () => {
  const two = evaluateSession(stateAt({ pushup: 2 }), catalog, rec('pushup', 2, [40, 40]));
  assert.equal(two.promote, false);
  const three = evaluateSession(stateAt({ pushup: 2 }), catalog, rec('pushup', 2, [40, 40, 40]));
  assert.equal(three.promote, true);
});

test('다지기 세션은 승급 판정 대상이 아니다', () => {
  const e = evaluateSession(stateAt({ pushup: 5 }), catalog,
    rec('pushup', 5, [25, 25], { kind: 'consolidation', performedStep: 4 }));
  assert.equal(e.promote, false);
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

test('마스터 단계는 기준을 채워도 승급하지 않는다', () => {
  const e = evaluateSession(stateAt({ pushup: 10 }), catalog, rec('pushup', 10, [100]));
  assert.equal(e.metTop, true);
  assert.equal(e.promote, false);
  assert.equal(e.blockedBy, 'master');
  assert.equal(e.topLabel, 'elite');
});

test('RPE 평균이 임계 이상이면 기준을 채워도 승급을 보류한다', () => {
  const history = [
    rec('pushup', 5, [15, 15], { rpe: 8 }),
    rec('pushup', 5, [18, 17], { rpe: 9 }),
  ];
  const e = evaluateSession(stateAt({ pushup: 5 }, history), catalog,
    rec('pushup', 5, [20, 20], { rpe: 8 }));
  assert.equal(e.metTop, true);
  assert.equal(e.promote, false);
  assert.equal(e.blockedBy, 'rpe');
  assert.match(e.notes[0], /승급 보류/);
});

test('RPE 가 낮으면 정상 승급한다', () => {
  const history = [
    rec('pushup', 5, [15, 15], { rpe: 6 }),
    rec('pushup', 5, [18, 17], { rpe: 7 }),
  ];
  const e = evaluateSession(stateAt({ pushup: 5 }, history), catalog,
    rec('pushup', 5, [20, 20], { rpe: 7 }));
  assert.equal(e.promote, true);
});

test('RPE 표본이 부족하면 거부권은 작동하지 않는다', () => {
  const e = evaluateSession(stateAt({ pushup: 5 }, [rec('pushup', 5, [18, 17], { rpe: 10 })]),
    catalog, rec('pushup', 5, [20, 20], { rpe: 10 }));
  assert.equal(e.promote, true, '2회분만으로는 보류하지 않는다');
});

test('RPE 를 입력하지 않으면 거부권이 없다', () => {
  const history = [rec('pushup', 5, [15, 15]), rec('pushup', 5, [18, 17])];
  const e = evaluateSession(stateAt({ pushup: 5 }, history), catalog, rec('pushup', 5, [20, 20]));
  assert.equal(e.promote, true);
});

test('applySession 은 원본을 건드리지 않고 새 상태를 만든다', () => {
  const before = stateAt({ pushup: 5 });
  const { state, evaluation } = applySession(before, catalog, rec('pushup', 5, [20, 20]));
  assert.equal(evaluation.promote, true);
  assert.equal(state.steps.pushup, 6);
  assert.equal(state.history.length, 1);
  assert.equal(before.steps.pushup, 5, '원본 불변');
  assert.equal(before.history.length, 0);
});

test('세트를 더 많이 해도 상위 N개로 판정한다', () => {
  const e = evaluateSession(stateAt({ pushup: 5 }), catalog, rec('pushup', 5, [20, 8, 20]));
  assert.equal(e.promote, true);
});
