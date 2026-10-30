// @vitest-environment happy-dom
//
// 0.5.0 — 단계 조정 때 시작 기준(초보자 · 중급자 · 상급자)도 고른다.
// 저장 계층이 localStorage 를 만지므로 happy-dom 환경에서 돈다.

import { beforeEach, describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { getStep } from '../../src/lib/domain/catalog.ts';
import { initialState, setStep, startTier, stepStreak } from '../../src/lib/domain/index.ts';
import type { SessionRecord } from '../../src/lib/domain/types.ts';
import { adjustmentText } from '../../src/lib/ui/history/progression.ts';
import { readAppState, validateAndMigrateAppStateEnvelope, writeAppState } from '../../src/lib/ui/state/storage.ts';
import { ALL_UNLOCKED_STEPS, catalog, rec, stateAt } from './helpers.ts';

// 푸시업 5단계: 초보자 1×10 / 중급자 2×20 / 상급자 2×30
const S5 = getStep(catalog, 'pushup', 5);
const hit = (value: number, sets: number): SessionRecord =>
  rec('pushup', 5, Array.from({ length: sets }, () => value));
const base = () => stateAt({ ...ALL_UNLOCKED_STEPS, pushup: 5 });

describe('setStep — 시작 기준', () => {
  it('중급자를 고르면 중급자 0 연속에서 시작한다', () => {
    const s = setStep(base(), catalog, 'pushup', 5, '2026-10-30', 'intermediate');
    assert.deepEqual(stepStreak(s, catalog, 'pushup'), { tier: 'intermediate', streak: 0 });
    assert.deepEqual(s.adjustedTier, { pushup: 'intermediate' });
  });

  it('같은 단계에서 기준만 바꿀 수 있다 — 이력에 기준이 남는다', () => {
    const s = setStep(base(), catalog, 'pushup', 5, '2026-10-30', 'progression');
    assert.deepEqual(s.stepAdjustments, [{
      date: '2026-10-30', progressionId: 'pushup', from: 5, to: 5,
      fromTier: 'beginner', toTier: 'progression',
    }]);
    assert.equal(adjustmentText(s.stepAdjustments![0]), '5단계 초보자 → 5단계 상급자');
  });

  it('조정 뒤 세션은 고른 기준으로 판정한다 — 중급자 3연속이면 상급자로', () => {
    let s = setStep(base(), catalog, 'pushup', 5, '2026-10-30', 'intermediate');
    const v = S5.intermediate.value as number;
    s = { ...s, history: [...s.history, ...Array.from({ length: 3 }, () => hit(v, S5.intermediate.sets))] };
    assert.deepEqual(stepStreak(s, catalog, 'pushup'), { tier: 'progression', streak: 0 });
  });

  it('조정 뒤 초보자 기준만 채운 세션은 중급자 연속이 아니다', () => {
    let s = setStep(base(), catalog, 'pushup', 5, '2026-10-30', 'intermediate');
    s = { ...s, history: [...s.history, hit(S5.beginner.value as number, S5.beginner.sets)] };
    assert.deepEqual(stepStreak(s, catalog, 'pushup'), { tier: 'intermediate', streak: 0 });
  });

  it('승급하면 새 단계는 초보자부터 — 고른 기준이 넘어가지 않는다', () => {
    let s = setStep(base(), catalog, 'pushup', 5, '2026-10-30', 'progression');
    s = { ...s, steps: { ...s.steps, pushup: 6 }, history: [...s.history, rec('pushup', 5, [30, 30], { promotedTo: 6 })] };
    assert.equal(stepStreak(s, catalog, 'pushup').tier, 'beginner');
  });

  it('10단계에서 상급자를 고르면 최상급자로 맞춘다', () => {
    const s = setStep(base(), catalog, 'pushup', 10, '2026-10-30', 'progression');
    assert.equal(stepStreak(s, catalog, 'pushup').tier, 'elite');
    assert.equal(s.stepAdjustments![0].toTier, 'elite');
  });

  it('기준 없이 다시 조정하면 그 종목의 기준 키가 빠진다 — 다른 종목은 그대로', () => {
    let s = setStep(base(), catalog, 'pushup', 5, undefined, 'intermediate');
    s = setStep(s, catalog, 'squat', 3, undefined, 'progression');
    s = setStep(s, catalog, 'pushup', 4);
    assert.deepEqual(s.adjustedTier, { squat: 'progression' });
    assert.equal(stepStreak(s, catalog, 'pushup').tier, 'beginner');
  });

  it('초보자만 고른 상태는 adjustedTier 필드를 만들지 않는다', () => {
    assert.equal(setStep(base(), catalog, 'pushup', 4).adjustedTier, undefined);
  });

  it('startTier — 1~9단계 최상급자는 상급자로', () => {
    assert.equal(startTier(S5, 'elite'), 'progression');
    assert.equal(startTier(S5, undefined), 'beginner');
  });
});

describe('저장 계층 — adjustedTier', () => {
  beforeEach(() => window.localStorage.clear());

  it('라운드트립한다', () => {
    const s = setStep(initialState(), catalog, 'pushup', 3, '2026-10-30', 'intermediate');
    writeAppState(s);
    const r = readAppState();
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') assert.deepEqual(r.value.adjustedTier, { pushup: 'intermediate' });
  });

  it('기준 이름이 아닌 값이면 손상', () => {
    const bad = { ...initialState(), adjustedTier: { pushup: 'expert' } };
    assert.equal(validateAndMigrateAppStateEnvelope({ schemaVersion: 5, appState: bad }).ok, false);
    const arr = { ...initialState(), adjustedTier: [] };
    assert.equal(validateAndMigrateAppStateEnvelope({ schemaVersion: 5, appState: arr }).ok, false);
  });
});

describe('adjustmentText', () => {
  it('기준이 없는 옛 이력은 단계만 적는다', () => {
    assert.equal(
      adjustmentText({ date: '2026-10-29', progressionId: 'pushup', from: 5, to: 3 }),
      '5단계 → 3단계',
    );
  });
});
