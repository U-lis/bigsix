import { test } from 'vitest';
import assert from 'node:assert/strict';
import { listPrograms, planDay, planWeek } from '../../src/lib/domain/schedule.ts';
import { catalog, stateAt } from './helpers.ts';

test('프로그램 5종이 있다', () => {
  assert.deepEqual(listPrograms(catalog).map((p) => p.id),
    ['new_blood', 'good_behavior', 'veterano', 'solitary_confinement', 'supermax']);
});

test('New Blood 는 월·목만 운동일이다', () => {
  const s = stateAt({});
  const week = planWeek(s, catalog, 'new_blood');
  assert.deepEqual(week.filter((d) => !d.rest).map((d) => d.weekday), ['월', '목']);
  assert.deepEqual(week.find((d) => d.weekday === '월')!.exercises.map((e) => e.progressionId),
    ['pushup', 'legraise']);
  assert.deepEqual(week.find((d) => d.weekday === '목')!.exercises.map((e) => e.progressionId),
    ['pullup', 'squat']);
});

test('선행 조건 미달 종목은 계획에서 빠지고 사유가 남는다', () => {
  const day = planDay(stateAt({}), catalog, 'good_behavior', '금');
  assert.equal(day.exercises.length, 0);
  assert.deepEqual(day.locked.map((l) => l.progressionId), ['hspu', 'bridge']);
  assert.match(day.locked[0].reason, /빅4 6단계 완료 필요/);
  assert.equal(day.rest, false, '휴식일이 아니라 잠긴 것');
});

test('해금되면 같은 날에 계획이 채워진다', () => {
  const s = stateAt({ pushup: 7, squat: 7, pullup: 7, legraise: 7, bridge: 1, hspu: 1 });
  const day = planDay(s, catalog, 'good_behavior', '금');
  assert.deepEqual(day.exercises.map((e) => e.progressionId), ['hspu', 'bridge']);
  assert.equal(day.locked.length, 0);
});

test('FR-12 — 빅6에 없는 보조 운동은 계획에 남지 않는다', () => {
  const s = stateAt({ pushup: 7, squat: 7, pullup: 7, legraise: 7 });
  const day = planDay(s, catalog, 'solitary_confinement', '월');
  // 월요일 요일표는 풀업 + 스쿼트 + 악력 운동이다. 악력 운동은 조용히 건너뛴다.
  assert.deepEqual(day.exercises.map((e) => e.progressionId), ['pullup', 'squat']);
  assert.equal('accessories' in (day as unknown as Record<string, unknown>), false);
});

test('Veterano 는 하루 한 종목, 일요일 휴식', () => {
  const s = stateAt({ pushup: 7, squat: 7, pullup: 7, legraise: 7 });
  const week = planWeek(s, catalog, 'veterano');
  assert.deepEqual(week.map((d) => d.exercises.length), [1, 1, 1, 1, 1, 1, 0]);
  assert.equal(week.at(-1)!.rest, true);
});

test('휴식일은 rest 로 표시된다', () => {
  assert.equal(planDay(stateAt({}), catalog, 'new_blood', '일').rest, true);
});
