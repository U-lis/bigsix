import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { initialState, selectProgram } from '../../src/lib/domain/index.ts';
import { deriveTodayScreen } from '../../src/lib/ui/todayScreen.ts';
import { catalog, stateAt } from './helpers.ts';

const MON = '2026-09-07';
const TUE = '2026-09-08';
const WED = '2026-09-09';
const THU = '2026-09-10';
const FRI = '2026-09-11';

describe('deriveTodayScreen — 4상태 파생 (FR-17 / ADR-19)', () => {
  it('no-program: 프로그램 미선택이면 { kind: "no-program" }', () => {
    const s = deriveTodayScreen(initialState(2), catalog, MON);
    assert.equal(s.kind, 'no-program');
  });

  it('EC-39: no-program 이어도 리다이렉트가 아니라 안내 상태를 돌려준다 — 순수 함수', () => {
    // deriveTodayScreen 은 goto 를 호출하지 않는다. 결과 형태로 확인.
    const s = deriveTodayScreen(initialState(2), catalog, MON);
    assert.deepEqual(Object.keys(s), ['kind']);
  });

  it('rest: 요일표가 비어 있으면 { kind: "rest", nextTrainingDate }', () => {
    // new_blood 는 월/목 → 화요일에서 오늘 화면은 rest.
    const s = selectProgram(initialState(2), catalog, 'new_blood', MON);
    const r = deriveTodayScreen(s, catalog, TUE);
    assert.equal(r.kind, 'rest');
    if (r.kind === 'rest') assert.equal(r.nextTrainingDate, THU);
  });

  it('rest 인 날은 nextTrainingDate 가 채워진다 (null 케이스는 nextDoableTrainingDay 쪽에서)', () => {
    // 이 시나리오는 실 카탈로그로 만들기 어렵다 — 실질적으로는 항상 열린 날이 있다.
    // 함수 계약(null 가능성)은 nextDoableTrainingDay 테스트에서 확인.
    // 여기서는 훈련일이 있는 정상 케이스가 null 을 돌려주지 않음을 확인.
    const s = selectProgram(initialState(2), catalog, 'new_blood', MON);
    const r = deriveTodayScreen(s, catalog, TUE);
    assert.equal(r.kind, 'rest');
    if (r.kind !== 'rest') return;
    assert.notEqual(r.nextTrainingDate, null);
  });

  it('EC-37 / FR-17.5: no-doable — rest === false 인데 exercises 가 빔', () => {
    // veterano 화요일 = 브리지 단독. 빅4 가 2단계면 브리지는 잠긴다.
    const s = selectProgram(stateAt({}), catalog, 'veterano', MON);
    const r = deriveTodayScreen(s, catalog, TUE);
    assert.equal(r.kind, 'no-doable');
    if (r.kind === 'no-doable') {
      assert.equal(r.locked.length, 1);
      assert.equal(r.locked[0].progressionId, 'bridge');
      // 다음 열린 날 = 목요일 (레그레이즈)
      assert.equal(r.nextTrainingDate, THU);
    }
  });

  it('training: exercises 가 있음 → { kind: "training", agenda }', () => {
    // new_blood 월요일 = pushup / legraise.
    const s = selectProgram(stateAt({}), catalog, 'new_blood', MON);
    const r = deriveTodayScreen(s, catalog, MON);
    assert.equal(r.kind, 'training');
    if (r.kind === 'training') {
      assert.ok(r.agenda.exercises.length > 0);
      assert.equal(r.agenda.programId, 'new_blood');
      assert.equal(r.agenda.date, MON);
      assert.equal(r.agenda.weekday, '월');
    }
  });

  it('순수 함수 — state 를 변형하지 않는다', () => {
    const s = selectProgram(stateAt({}), catalog, 'veterano', MON);
    const snapshot = JSON.stringify(s);
    deriveTodayScreen(s, catalog, TUE);
    assert.equal(JSON.stringify(s), snapshot);
  });

  it('nextTrainingDate 는 오늘의 다음 날부터 훑는다 — 오늘 자체는 후보 아님', () => {
    // veterano · 빅4 2단계 · 화요일 브리지 단독 (locked, no-doable)
    // nextTrainingDate 는 오늘(TUE) 다음 날부터 찾으므로 목요일이어야 한다.
    // (오늘도 후보로 넣으면 TUE 가 잠긴 것을 무시하고 이상한 결과가 나올 수 있다.)
    const s = selectProgram(stateAt({}), catalog, 'veterano', MON);
    const r = deriveTodayScreen(s, catalog, TUE);
    assert.equal(r.kind, 'no-doable');
    if (r.kind !== 'no-doable') return;
    assert.notEqual(r.nextTrainingDate, TUE);
  });
});
