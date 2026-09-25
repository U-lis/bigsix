import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { getStep } from '../../src/lib/domain/catalog.ts';
import { stepStreak, streakComplete } from '../../src/lib/domain/progress.ts';
import { setStep } from '../../src/lib/domain/steps.ts';
import type { AppState, SessionRecord } from '../../src/lib/domain/types.ts';
import { ALL_UNLOCKED_STEPS, catalog, rec, stateAt } from './helpers.ts';

// 푸시업 5단계: 초보자 1×10 / 중급자 2×20 / 상급자 2×30
const N = 5;
const S = getStep(catalog, 'pushup', N);
const BEG = S.beginner.value as number;
const INT = S.intermediate.value as number;
const TOP = (S.progression ?? S.elite)!.value as number;

const at = (history: SessionRecord[]): AppState =>
  stateAt({ ...ALL_UNLOCKED_STEPS, pushup: N }, history);

/** 상위 기준까지 넉넉히 채운 정상 세션. */
const hit = (value: number, sets: number, extra: Partial<SessionRecord> = {}) =>
  rec('pushup', N, Array.from({ length: sets }, () => value), extra);

describe('stepStreak — 기준 순차 통과 (FR-22.1)', () => {
  it('기록이 없으면 초보자 0 연속이다', () => {
    assert.deepEqual(stepStreak(at([]), catalog, 'pushup'), { tier: 'beginner', streak: 0 });
  });

  it('초보자 기준을 채울 때마다 연속이 는다', () => {
    const one = [hit(BEG, S.beginner.sets)];
    assert.deepEqual(stepStreak(at(one), catalog, 'pushup'), { tier: 'beginner', streak: 1 });
    assert.deepEqual(
      stepStreak(at([...one, ...one]), catalog, 'pushup'), { tier: 'beginner', streak: 2 });
  });

  it('초보자 3연속을 채우면 중급자 구간으로 넘어가고 연속이 0 이 된다', () => {
    const h = Array.from({ length: 3 }, () => hit(BEG, S.beginner.sets));
    assert.deepEqual(
      stepStreak(at(h), catalog, 'pushup'), { tier: 'intermediate', streak: 0 });
  });

  it('중급자 3연속을 채우면 상급자 구간으로 넘어간다', () => {
    const h = [
      ...Array.from({ length: 3 }, () => hit(BEG, S.beginner.sets)),
      ...Array.from({ length: 3 }, () => hit(INT, S.intermediate.sets)),
    ];
    assert.deepEqual(
      stepStreak(at(h), catalog, 'pushup'), { tier: 'progression', streak: 0 });
  });

  it('상급자 3연속을 채우면 그 상태로 멈춘다 — 승급 판정은 여기서 하지 않는다', () => {
    const top = (S.progression ?? S.elite)!;
    const h = [
      ...Array.from({ length: 3 }, () => hit(BEG, S.beginner.sets)),
      ...Array.from({ length: 3 }, () => hit(INT, S.intermediate.sets)),
      ...Array.from({ length: 3 }, () => hit(TOP, top.sets)),
    ];
    const s = stepStreak(at(h), catalog, 'pushup');
    assert.deepEqual(s, { tier: 'progression', streak: 3 });
    assert.equal(streakComplete(S, s), true);
  });

  it('한 세션에 상급자 기준을 크게 넘겨도 연속 1 일 뿐이다 (EC-52)', () => {
    const s = stepStreak(at([hit(TOP * 3, 5)]), catalog, 'pushup');
    assert.deepEqual(s, { tier: 'beginner', streak: 1 });
    assert.equal(streakComplete(S, s), false);
  });
});

describe('stepStreak — 연속이 깨지는 조건 (FR-22.3 / EC-49)', () => {
  it('끝까지 하고 미달하면 연속이 0 이 된다', () => {
    const h = [hit(BEG, S.beginner.sets), hit(BEG, S.beginner.sets), rec('pushup', N, [1])];
    assert.deepEqual(stepStreak(at(h), catalog, 'pushup'), { tier: 'beginner', streak: 0 });
  });

  it('미달해도 아래 기준으로 내려가지 않는다 — 목표는 그 기준에 머문다', () => {
    const h = [
      ...Array.from({ length: 3 }, () => hit(BEG, S.beginner.sets)),
      rec('pushup', N, [1]),
    ];
    assert.deepEqual(stepStreak(at(h), catalog, 'pushup'), { tier: 'intermediate', streak: 0 });
  });
});

describe("stepStreak — '불가능' 과 다지기는 연속을 깨지 않는다 (FR-22.3a / EC-53)", () => {
  it('중단한 세션은 연속을 유지한다', () => {
    const h = [
      hit(BEG, S.beginner.sets), hit(BEG, S.beginner.sets),
      rec('pushup', N, [2], { outcome: 'abandoned' }),
    ];
    assert.deepEqual(stepStreak(at(h), catalog, 'pushup'), { tier: 'beginner', streak: 2 });
  });

  it('다지기 세션도 연속을 유지한다', () => {
    const h = [
      hit(BEG, S.beginner.sets), hit(BEG, S.beginner.sets),
      rec('pushup', N, [30, 30], { kind: 'consolidation', performedStep: N - 1 }),
    ];
    assert.deepEqual(stepStreak(at(h), catalog, 'pushup'), { tier: 'beginner', streak: 2 });
  });

  it('중단 뒤 다시 채우면 이어서 센다 (EC-54)', () => {
    const h = [
      hit(BEG, S.beginner.sets), hit(BEG, S.beginner.sets),
      rec('pushup', N, [2], { outcome: 'abandoned' }),
      hit(BEG, S.beginner.sets),
    ];
    assert.deepEqual(stepStreak(at(h), catalog, 'pushup'), { tier: 'intermediate', streak: 0 });
  });

  it("'불가능' 을 여러 번 해도 연속은 그대로다 (EC-55)", () => {
    const h = [
      hit(BEG, S.beginner.sets),
      ...Array.from({ length: 4 }, () => rec('pushup', N, [2], { outcome: 'abandoned' })),
    ];
    assert.deepEqual(stepStreak(at(h), catalog, 'pushup'), { tier: 'beginner', streak: 1 });
  });
});

describe('stepStreak — 범위 하한', () => {
  it('다른 종목·다른 단계의 기록은 세지 않는다', () => {
    const h = [
      rec('squat', N, [100, 100, 100]),
      rec('pushup', N - 1, [100, 100, 100]),
      hit(BEG, S.beginner.sets),
    ];
    assert.deepEqual(stepStreak(at(h), catalog, 'pushup'), { tier: 'beginner', streak: 1 });
  });

  it('승급 세션 뒤에는 새 단계의 초보자 0 연속에서 다시 센다', () => {
    const h = [
      hit(BEG, S.beginner.sets), hit(BEG, S.beginner.sets),
      rec('pushup', N - 1, [100], { promotedTo: N }),
      hit(BEG, S.beginner.sets),
    ];
    assert.deepEqual(stepStreak(at(h), catalog, 'pushup'), { tier: 'beginner', streak: 1 });
  });

  it('수동 조정 앵커 이전의 세션은 세지 않는다 (FR-13.3 승계)', () => {
    const before = at([hit(BEG, S.beginner.sets), hit(BEG, S.beginner.sets)]);
    assert.equal(stepStreak(before, catalog, 'pushup').streak, 2);
    const after = setStep(before, catalog, 'pushup', N);
    assert.deepEqual(stepStreak(after, catalog, 'pushup'), { tier: 'beginner', streak: 0 });
  });
});
