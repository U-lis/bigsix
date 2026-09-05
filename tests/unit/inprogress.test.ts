// @vitest-environment happy-dom
//
// 진행 중 세션 스토어 (FR-2, FR-6.7a/7b, EC-7 / EC-7a / EC-17 / EC-25).
// localStorage 를 만지므로 happy-dom 환경.

import { afterEach, beforeEach, describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { inProgress, isStaleStartedAt, maxSetRpe } from '../../src/lib/ui/session.svelte.ts';
import {
  IN_PROGRESS_KEY,
  readInProgress,
  writeInProgress,
  type InProgressSession,
  type SetEntry,
} from '../../src/lib/ui/storage.ts';
import { initialState } from '../../src/lib/domain/index.ts';
import type { AppState, PlannedExercise } from '../../src/lib/domain/types.ts';
import { catalog, stateAt, ALL_UNLOCKED_STEPS } from './helpers.ts';

// ── 공통 헬퍼 ─────────────────────────────────────────────────────────────

function makePlan(): PlannedExercise {
  return {
    progressionId: 'pushup',
    step: 3,
    performedStep: 3,
    stepName: { en: 'Kneeling Pushup', ko: '무릎 대고 팔굽혀펴기' },
    unit: 'reps',
    perSide: false,
    work: [
      { target: 20, mode: 'fixed' },
      { target: 20, mode: 'fixed' },
    ],
    goal: { label: 'intermediate', sets: 2, value: 20 },
    kind: 'work',
    reason: '테스트',
  };
}

beforeEach(() => {
  window.localStorage.clear();
  inProgress.discard();
});

afterEach(() => {
  window.localStorage.clear();
  inProgress.discard();
});

// ── FR-2.3 세트마다 저장 ──────────────────────────────────────────────────

describe('pushWorkSet — FR-2.3 세트마다 저장', () => {
  it('push 3회 호출하면 localStorage 에 3번 반영된다', () => {
    inProgress.begin('2026-09-05', makePlan());
    // begin 자체가 초기 저장을 한 번 한다.
    assert.ok(window.localStorage.getItem(IN_PROGRESS_KEY) !== null);

    inProgress.pushWorkSet({ value: 20 });
    let saved = readInProgress();
    assert.equal(saved.status, 'ok');
    if (saved.status === 'ok') assert.equal(saved.value.workSets.length, 1);

    inProgress.pushWorkSet({ value: 18 });
    saved = readInProgress();
    if (saved.status === 'ok') assert.equal(saved.value.workSets.length, 2);

    inProgress.pushWorkSet({ value: 16 });
    saved = readInProgress();
    if (saved.status === 'ok') assert.equal(saved.value.workSets.length, 3);
  });
});

// ── FR-2.4 / EC-17 재실행 복원 ─────────────────────────────────────────────

describe('init — FR-2.4 / EC-17 재실행 복원', () => {
  it('writeInProgress → 새 store init 하면 값이 유지된다', () => {
    const s: InProgressSession = {
      startedAt: '2026-09-05',
      progressionId: 'pushup',
      step: 3,
      performedStep: 3,
      kind: 'work',
      workSets: [{ value: 20, rpe: 7 }],
    };
    writeInProgress(s);
    inProgress.init(readInProgress().status === 'ok' ? s : null);
    assert.deepEqual(inProgress.value, s);
  });
});

// ── FR-2.5 완료 시 제거 & FR-2.8/D-7 시작 날짜 유지 ────────────────────────

describe('finalize — FR-2.5 / FR-2.8 / D-7 / EC-7', () => {
  it('finalize 후 진행 중 데이터가 제거되고 SessionRecord.date == 시작 날짜', () => {
    inProgress.begin('2026-09-05', makePlan());
    inProgress.pushWorkSet({ value: 20 });
    inProgress.pushWorkSet({ value: 18 });
    // 오늘이 이미 다음날로 넘어갔다고 가정 — todayClock 은 여기서 필요 없다.
    const state: AppState = stateAt({ pushup: 3 });
    const result = inProgress.finalize(state, catalog);
    // 시작 날짜로 기록됨 (완료 날짜가 아니라).
    assert.equal(result.record.date, '2026-09-05');
    // history 에 반영.
    assert.equal(result.nextState.history.length, 1);
    // 진행 중 데이터 제거.
    assert.equal(inProgress.value, null);
    assert.equal(window.localStorage.getItem(IN_PROGRESS_KEY), null);
  });
});

// ── FR-6.7a 세션 RPE = 세트 RPE 최댓값 (EC-25) ────────────────────────────

describe('maxSetRpe — FR-6.7a / EC-25 세트마다 다른 RPE', () => {
  it('[7, 9, 8] → 9', () => {
    const entries: SetEntry[] = [
      { value: 20, rpe: 7 },
      { value: 20, rpe: 9 },
      { value: 20, rpe: 8 },
    ];
    assert.equal(maxSetRpe(entries), 9);
  });

  it('전부 없으면 undefined (0 아님)', () => {
    const entries: SetEntry[] = [{ value: 20 }, { value: 20 }];
    assert.equal(maxSetRpe(entries), undefined);
  });

  it('일부만 있으면 있는 값들의 최댓값', () => {
    const entries: SetEntry[] = [{ value: 20 }, { value: 20, rpe: 6 }, { value: 20 }];
    assert.equal(maxSetRpe(entries), 6);
  });
});

describe('finalize — 세트 RPE 최댓값이 SessionRecord.rpe 로 (FR-6.7a)', () => {
  it('세트 RPE [7, 9, 8] → SessionRecord.rpe === 9', () => {
    inProgress.begin('2026-09-05', makePlan());
    inProgress.pushWorkSet({ value: 20, rpe: 7 });
    inProgress.pushWorkSet({ value: 18, rpe: 9 });
    inProgress.pushWorkSet({ value: 16, rpe: 8 });
    const result = inProgress.finalize(stateAt({ pushup: 3 }), catalog);
    assert.equal(result.record.rpe, 9);
  });

  it('세트 RPE 전무 → SessionRecord.rpe 필드 자체 없음', () => {
    inProgress.begin('2026-09-05', makePlan());
    inProgress.pushWorkSet({ value: 20 });
    inProgress.pushWorkSet({ value: 18 });
    const result = inProgress.finalize(stateAt({ pushup: 3 }), catalog);
    assert.equal('rpe' in result.record, false);
  });
});

// ── FR-6.7b 세트별 RPE 는 진행 중에는 있고, 완료 후 소실 ──────────────────

describe('세트별 RPE — FR-6.7b / L-8', () => {
  it('진행 중 세션에는 세트별 RPE 가 보존된다', () => {
    inProgress.begin('2026-09-05', makePlan());
    inProgress.pushWorkSet({ value: 20, rpe: 7 });
    inProgress.pushWorkSet({ value: 18, rpe: 9 });
    // 저장된 상태에서 세트별 RPE 가 확인된다.
    const saved = readInProgress();
    assert.equal(saved.status, 'ok');
    if (saved.status === 'ok') {
      assert.equal(saved.value.workSets[0].rpe, 7);
      assert.equal(saved.value.workSets[1].rpe, 9);
    }
  });

  it('완료된 세션 기록에는 세션 RPE 최댓값 하나만 남는다', () => {
    inProgress.begin('2026-09-05', makePlan());
    inProgress.pushWorkSet({ value: 20, rpe: 7 });
    inProgress.pushWorkSet({ value: 18, rpe: 9 });
    const result = inProgress.finalize(stateAt({ pushup: 3 }), catalog);
    // SessionRecord 는 세션당 RPE 하나만 갖는다.
    assert.equal(result.record.rpe, 9);
    // 세트별 원본은 남지 않는다 — 도메인 기록 모델이 표현하지 못함.
    // (SessionRecord.sets 는 값 배열이지 RPE 배열이 아니다.)
    assert.deepEqual(result.record.sets, [20, 18]);
  });
});

// ── FR-2.9 / EC-7a 시작 날짜가 오늘이 아님 ────────────────────────────────

describe('isStaleStartedAt — FR-2.9 / EC-7a', () => {
  it('시작 날짜가 오늘이 아니면 true', () => {
    const s: InProgressSession = {
      startedAt: '2026-09-05',
      progressionId: 'pushup',
      step: 3,
      performedStep: 3,
      kind: 'work',
      workSets: [],
    };
    assert.equal(isStaleStartedAt(s, '2026-09-06'), true);
  });

  it('같으면 false', () => {
    const s: InProgressSession = {
      startedAt: '2026-09-05',
      progressionId: 'pushup',
      step: 3,
      performedStep: 3,
      kind: 'work',
      workSets: [],
    };
    assert.equal(isStaleStartedAt(s, '2026-09-05'), false);
  });

  it('세션이 없으면 false', () => {
    assert.equal(isStaleStartedAt(null, '2026-09-05'), false);
  });
});

// ── abandon — FR-6.8 / EC-12 (승계) ──────────────────────────────────────

describe('abandon — FR-6.8 / EC-12 도메인 승계', () => {
  it('abandon → progress 데이터 제거 & canConsolidate 반환', () => {
    inProgress.begin('2026-09-05', makePlan());
    inProgress.pushWorkSet({ value: 5 });
    const result = inProgress.abandon(stateAt({ pushup: 3 }), catalog);
    assert.equal(result.canConsolidate, true); // step 3 > 1
    assert.equal(inProgress.value, null);
    assert.equal(window.localStorage.getItem(IN_PROGRESS_KEY), null);
  });

  it('1단계에서 abandon → canConsolidate=false (EC-12)', () => {
    const plan1 = { ...makePlan(), step: 1, performedStep: 1 };
    inProgress.begin('2026-09-05', plan1);
    inProgress.pushWorkSet({ value: 3 });
    const result = inProgress.abandon(stateAt({ pushup: 1 }), catalog);
    assert.equal(result.canConsolidate, false);
    assert.equal(inProgress.value, null);
  });
});

// ── EC-16 같은 종목 두 번 — 도메인 승계 ───────────────────────────────────
// tests/unit/session.test.ts 의 "같은 날 같은 종목 두 번 이상 기록" 케이스로 추적.
// 여기서는 UI 스토어가 그 계약을 막지 않는지만 확인.

describe('같은 종목 두 번 — EC-16 (session.test.ts 승계)', () => {
  it('finalize 후 다시 begin 이 가능하다', () => {
    inProgress.begin('2026-09-05', makePlan());
    inProgress.pushWorkSet({ value: 20 });
    inProgress.pushWorkSet({ value: 18 });
    inProgress.finalize(stateAt({ pushup: 3 }), catalog);
    // 같은 종목으로 다시 시작.
    inProgress.begin('2026-09-05', makePlan());
    assert.ok(inProgress.value !== null);
  });
});

// ── ALL_UNLOCKED_STEPS 는 미사용 경고 방지용 (import 만 유지) ─────────────
void ALL_UNLOCKED_STEPS;
void initialState;
