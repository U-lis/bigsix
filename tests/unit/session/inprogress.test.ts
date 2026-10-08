// @vitest-environment happy-dom
//
// SPEC5 Phase 2 — 스토어 drafts 맵 API (FR-39 · FR-41.2 · ADR-41 · ADR-42 · ADR-45 ·
// EC-94 · EC-99 · EC-100).
// localStorage 를 만지므로 happy-dom 환경.

import { afterEach, beforeEach, describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { inProgress } from '../../../src/lib/ui/session/session.svelte.ts';
import {
  draftKey,
  readInProgress,
  type SessionDraft,
} from '../../../src/lib/ui/state/storage.ts';
import type { PlannedExercise } from '../../../src/lib/domain/types.ts';
import { catalog, stateAt } from '../helpers.ts';

function plan(progressionId: PlannedExercise['progressionId'], step = 3): PlannedExercise {
  return {
    progressionId,
    step,
    performedStep: step,
    stepName: { en: 'name', ko: '이름' },
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
  inProgress.discardAll();
});

afterEach(() => {
  window.localStorage.clear();
  inProgress.discardAll();
});

// ── beginWork · getDraft (FR-39.1 / ADR-41) ───────────────────────────────

describe('beginWork · getDraft — 칸 시작과 조회', () => {
  it('beginWork 로 시작한 칸이 getDraft 로 읽힌다', () => {
    inProgress.beginWork('2026-10-08', plan('pushup', 3));
    const d = inProgress.getDraft('pushup', 'work');
    assert.ok(d !== undefined);
    assert.equal(d!.kind, 'work');
    assert.equal(d!.progressionId, 'pushup');
    assert.equal(d!.step, 3);
    // target 스냅샷 (FR-39.3 / ADR-22).
    assert.deepEqual(d!.target?.goal.sets, 2);
    assert.equal(d!.workSets.length, 0);
    assert.equal(d!.abandoned, undefined);
  });

  it('getDraft(onDate) — startedAt 과 다른 날짜는 undefined', () => {
    inProgress.beginWork('2026-10-08', plan('pushup'));
    assert.equal(inProgress.getDraft('pushup', 'work', '2026-10-08')?.progressionId, 'pushup');
    assert.equal(inProgress.getDraft('pushup', 'work', '2026-10-09'), undefined);
  });
});

// ── FR-39.2 · EC-99/100: 재진입 시 기존 세트 보호 ──────────────────────────

describe('beginWork — 키 충돌 시 덮어쓰지 않음 (EC-99 / EC-100 / FR-39.2)', () => {
  it('이미 칸이 있는 키로 beginWork 를 다시 호출해도 기존 세트가 지워지지 않는다', () => {
    inProgress.beginWork('2026-10-08', plan('pushup'));
    inProgress.pushSet(draftKey('pushup', 'work'), { value: 20 });
    inProgress.pushSet(draftKey('pushup', 'work'), { value: 18 });

    // 다시 begin — 플랜이 다른 goal 을 들고 와도 기존 칸을 덮지 않는다.
    const other = plan('pushup');
    other.goal = { label: 'beginner', sets: 2, value: 10 };
    inProgress.beginWork('2026-10-08', other);

    const d = inProgress.getDraft('pushup', 'work');
    assert.equal(d!.workSets.length, 2);
    // target 도 처음 begin 시점 스냅샷이 보존된다.
    assert.equal(d!.target?.goal.value, 20);
  });
});

describe('beginWork — stale 키 충돌: 어제 칸이 오늘 칸을 막는다', () => {
  it('어제 날짜로 시작된 칸이 있으면 오늘 beginWork 가 false 를 돌려준다', () => {
    // 어제 날짜로 칸을 열고 세트를 쌓는다.
    inProgress.beginWork('2026-10-07', plan('pushup'));
    inProgress.pushSet(draftKey('pushup', 'work'), { value: 10 });

    // 오늘 날짜로 beginWork 를 호출하면 기존 칸이 막는다.
    const started = inProgress.beginWork('2026-10-08', plan('pushup'));
    assert.equal(started, false, 'beginWork 가 false 를 반환해야 한다');

    // 어제 칸이 그대로 남아 있다 (세트 보존).
    const d = inProgress.getDraft('pushup', 'work');
    assert.equal(d!.startedAt, '2026-10-07');
    assert.equal(d!.workSets.length, 1, '어제 세트가 지워지면 안 된다');
  });

  it('어제 칸이 없으면 오늘 beginWork 가 true 를 돌려준다', () => {
    const started = inProgress.beginWork('2026-10-08', plan('pushup'));
    assert.equal(started, true, 'beginWork 가 true 를 반환해야 한다');
    assert.equal(inProgress.getDraft('pushup', 'work')?.startedAt, '2026-10-08');
  });
});

// ── FR-39.2 두 종목 독립 ─────────────────────────────────────────────────

describe('두 종목이 각각의 칸에서 독립적으로 쌓인다 (FR-39.2)', () => {
  it('pushup 과 squat 의 세트가 서로 간섭하지 않는다', () => {
    inProgress.beginWork('2026-10-08', plan('pushup'));
    inProgress.beginWork('2026-10-08', plan('squat'));
    inProgress.pushSet(draftKey('pushup', 'work'), { value: 20 });
    inProgress.pushSet(draftKey('squat', 'work'), { value: 15 });
    inProgress.pushSet(draftKey('pushup', 'work'), { value: 18 });

    const dp = inProgress.getDraft('pushup', 'work');
    const ds = inProgress.getDraft('squat', 'work');
    assert.equal(dp!.workSets.length, 2);
    assert.equal(ds!.workSets.length, 1);
    assert.equal(dp!.workSets[0].value, 20);
    assert.equal(ds!.workSets[0].value, 15);
  });
});

// ── pushSet / updateSet / removeSet 불변성 (R-3) ──────────────────────────

describe('pushSet / updateSet / removeSet — 불변 spread 로 workSets 변경', () => {
  it('세 호출이 순서대로 반영된다', () => {
    const key = draftKey('pushup', 'work');
    inProgress.beginWork('2026-10-08', plan('pushup'));

    inProgress.pushSet(key, { value: 20, rpe: 7 });
    inProgress.pushSet(key, { value: 18 });
    inProgress.pushSet(key, { value: 16 });
    assert.equal(inProgress.getDraft('pushup', 'work')!.workSets.length, 3);

    inProgress.updateSet(key, 1, { value: 19, rpe: 8 });
    assert.deepEqual(inProgress.getDraft('pushup', 'work')!.workSets[1], { value: 19, rpe: 8 });

    inProgress.removeSet(key, 0);
    const after = inProgress.getDraft('pushup', 'work')!.workSets;
    assert.equal(after.length, 2);
    assert.equal(after[0].value, 19);
    assert.equal(after[1].value, 16);
  });

  it('존재하지 않는 키는 무시한다', () => {
    inProgress.pushSet('ghost:work', { value: 1 });
    inProgress.updateSet('ghost:work', 0, { value: 2 });
    inProgress.removeSet('ghost:work', 0);
    assert.deepEqual(inProgress.drafts, {});
  });

  it('각 변경이 새 draft 객체를 돌려준다 — 참조 동일성이 끊긴다 (R-3)', () => {
    const key = draftKey('pushup', 'work');
    inProgress.beginWork('2026-10-08', plan('pushup'));
    const before = inProgress.getDraft('pushup', 'work')!;
    inProgress.pushSet(key, { value: 20 });
    const after = inProgress.getDraft('pushup', 'work')!;
    assert.notEqual(before, after, 'draft 참조가 바뀌어야 Svelte 반응성이 돈다');
    assert.notEqual(before.workSets, after.workSets);
  });
});

// ── markAbandoned (EC-94 / ADR-45) ────────────────────────────────────────

describe('markAbandoned — 플래그 토글만 (ADR-45 / EC-94)', () => {
  it('true 로 세우고 다시 false 로 되돌릴 수 있다', () => {
    const key = draftKey('pushup', 'work');
    inProgress.beginWork('2026-10-08', plan('pushup'));
    inProgress.pushSet(key, { value: 10 });
    inProgress.markAbandoned(key, true);
    assert.equal(inProgress.getDraft('pushup', 'work')!.abandoned, true);
    // 세트는 보존된다.
    assert.equal(inProgress.getDraft('pushup', 'work')!.workSets.length, 1);

    inProgress.markAbandoned(key, false);
    assert.equal(inProgress.getDraft('pushup', 'work')!.abandoned, false);
    assert.equal(inProgress.getDraft('pushup', 'work')!.workSets.length, 1);
  });
});

// ── discardDraft / discardAll ────────────────────────────────────────────

describe('discardDraft / discardAll', () => {
  it('discardDraft 는 지정 키만 지운다', () => {
    inProgress.beginWork('2026-10-08', plan('pushup'));
    inProgress.beginWork('2026-10-08', plan('squat'));
    inProgress.discardDraft(draftKey('pushup', 'work'));
    assert.equal(inProgress.getDraft('pushup', 'work'), undefined);
    assert.ok(inProgress.getDraft('squat', 'work') !== undefined);
  });

  it('discardAll 뒤 drafts 는 빈 객체다', () => {
    inProgress.beginWork('2026-10-08', plan('pushup'));
    inProgress.beginWork('2026-10-08', plan('squat'));
    inProgress.discardAll();
    assert.deepEqual(inProgress.drafts, {});
  });
});

// ── beginFree · beginConsolidation ───────────────────────────────────────

describe('beginFree — 자유 운동 칸 (FR-18.1)', () => {
  it('target 이 없고 performedStep === step', () => {
    inProgress.beginFree('2026-10-08', 'pushup', 4);
    const d = inProgress.getDraft('pushup', 'free');
    assert.ok(d);
    assert.equal(d!.kind, 'free');
    assert.equal(d!.step, 4);
    assert.equal(d!.performedStep, 4);
    assert.equal(d!.target, undefined);
  });
});

describe('beginConsolidation — 다지기 칸 (ADR-45)', () => {
  it('planConsolidation 결과를 target 으로 저장하고 linkedTo 를 기록한다', () => {
    // 사용자가 pushup 3 단계에서 abandon 한 상황을 가정 — step > 1 이어야 다지기 가능.
    const state = stateAt({ pushup: 3 });
    const workKey = draftKey('pushup', 'work');
    inProgress.beginConsolidation('2026-10-08', state, catalog, 'pushup', workKey);
    const d = inProgress.getDraft('pushup', 'consolidation');
    assert.ok(d);
    assert.equal(d!.kind, 'consolidation');
    // 다지기는 이전 단계를 수행한다.
    assert.equal(d!.performedStep, 2);
    assert.equal(d!.step, 3);
    assert.equal(d!.linkedTo, workKey);
    assert.ok(d!.target !== undefined, 'target 스냅샷이 저장돼야 한다');
    assert.ok(d!.target!.work.length >= 1);
  });

  it('키 충돌 시 덮어쓰지 않는다', () => {
    const state = stateAt({ pushup: 3 });
    const workKey = draftKey('pushup', 'work');
    inProgress.beginConsolidation('2026-10-08', state, catalog, 'pushup', workKey);
    inProgress.pushSet(draftKey('pushup', 'consolidation'), { value: 5 });
    inProgress.beginConsolidation('2026-10-08', state, catalog, 'pushup', workKey);
    const d = inProgress.getDraft('pushup', 'consolidation');
    assert.equal(d!.workSets.length, 1, '기존 세트가 지워지면 안 된다');
  });
});

// ── 저장 라운드트립 — 모든 변경이 writeInProgress 로 흐른다 ─────────────────

describe('persist — 모든 변경이 localStorage 로 흐른다', () => {
  it('비면 clearInProgress, 그 외는 writeInProgress', () => {
    inProgress.beginWork('2026-10-08', plan('pushup'));
    const r1 = readInProgress();
    assert.equal(r1.status, 'ok');
    inProgress.discardAll();
    const r2 = readInProgress();
    assert.equal(r2.status, 'empty');
  });

  it('두 종목이 공존하는 상태가 봉투에 그대로 저장된다', () => {
    inProgress.beginWork('2026-10-08', plan('pushup'));
    inProgress.beginWork('2026-10-08', plan('squat'));
    const r = readInProgress();
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') {
      assert.deepEqual(
        Object.keys(r.value).sort(),
        [draftKey('pushup', 'work'), draftKey('squat', 'work')].sort(),
      );
    }
  });
});

// ── init — 부팅 복원 ──────────────────────────────────────────────────────

describe('init — 외부에서 받은 drafts 맵을 받아들인다', () => {
  it('init(null) → 빈 맵', () => {
    inProgress.init(null);
    assert.deepEqual(inProgress.drafts, {});
  });

  it('init(map) → 그대로 반영', () => {
    const key = draftKey('pushup', 'work');
    const d: SessionDraft = {
      startedAt: '2026-10-01',
      progressionId: 'pushup',
      step: 3,
      performedStep: 3,
      kind: 'work',
      workSets: [{ value: 20 }],
    };
    inProgress.init({ [key]: d });
    assert.deepEqual(inProgress.drafts, { [key]: d });
  });
});

// ── finish — Phase 3 플래너·실행기 결선 ──────────────────────────────────
//
// 자세한 플래너·실행기 규칙은 `finish.test.ts` 가 검증한다. 여기서는 스토어가
// 두 함수를 올바르게 엮고, 성공한 칸만 drafts 에서 지우는지만 확인한다 (FR-42.6).

describe('finish — 플래너·실행기 결선', () => {
  it('성공한 칸만 drafts 에서 제거된다', () => {
    const key = draftKey('pushup', 'work');
    inProgress.beginWork('2026-10-08', plan('pushup', 3));
    inProgress.pushSet(key, { value: 20 });
    inProgress.pushSet(key, { value: 20 });

    const state = stateAt({ pushup: 3 });
    const { nextState, perDraft } = inProgress.finish(state, catalog, '2026-10-08T10:00:00+09:00');

    assert.equal(perDraft.length, 1);
    assert.equal(perDraft[0].ok, true);
    assert.equal(inProgress.getDraft('pushup', 'work'), undefined);
    assert.equal(nextState.history.length, 1);
  });

  it('실패한 칸은 drafts 에 남아 재시도 가능하다 (FR-42.6)', () => {
    // squat 를 1 단계로 두어 consolidation 칸이 recordConsolidation 에서 throw 하게 한다.
    const state = stateAt({ squat: 1 });
    inProgress.init({
      [draftKey('squat', 'consolidation')]: {
        startedAt: '2026-10-08',
        progressionId: 'squat',
        step: 1,
        performedStep: 0,
        kind: 'consolidation',
        workSets: [{ value: 10 }, { value: 10 }],
        target: {
          goal: { label: 'beginner', sets: 2, value: 10 },
          work: [
            { target: 10, mode: 'fixed' },
            { target: 10, mode: 'fixed' },
          ],
        },
      },
    });

    const { perDraft } = inProgress.finish(state, catalog, '2026-10-08T10:00:00+09:00');
    const consolResult = perDraft.find((r) => r.draftKey === draftKey('squat', 'consolidation'));
    assert.ok(consolResult !== undefined);
    assert.equal(consolResult!.ok, false);
    // 실패 칸은 남아 있다.
    assert.ok(inProgress.getDraft('squat', 'consolidation') !== undefined);
  });
});
