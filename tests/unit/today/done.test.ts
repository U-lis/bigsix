// SPEC5 Phase 7 — `done.ts` 는 룬 없는 순수 함수다 (ADR-49 · ADR-50 · ADR-51 /
// FR-46 / EC-102~104). localStorage · 브라우저 전역을 쓰지 않으므로 node 환경.

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import {
  doneResultLabel,
  doneSetShortfall,
  recordedToday,
  syncDoneDrafts,
  type SyncAction,
} from '../../../src/lib/ui/today/done.ts';
import {
  draftKey,
  type SessionDraft,
} from '../../../src/lib/ui/state/storage.ts';
import { planFinish, executeFinish } from '../../../src/lib/ui/session/finish.ts';
import type {
  ProgressionId,
  SessionRecord,
  SessionTarget,
} from '../../../src/lib/domain/types.ts';
import { catalog, stateAt } from '../helpers.ts';

// ── 조립기 ────────────────────────────────────────────────────────────────

function rec(
  id: ProgressionId,
  step: number,
  opts: {
    date?: string;
    kind?: 'work' | 'consolidation' | 'free';
    outcome?: 'completed' | 'abandoned';
    sets?: number[];
    performedStep?: number;
    promotedTo?: number;
    blockedBy?: 'rpe' | 'master';
    target?: SessionTarget;
    setRpes?: (number | null)[];
    completedAt?: string;
  } = {},
): SessionRecord {
  const base: SessionRecord = {
    date: opts.date ?? '2026-10-12',
    progressionId: id,
    step,
    sets: opts.sets ?? [10, 10],
    kind: opts.kind ?? 'work',
  };
  if (opts.performedStep !== undefined) base.performedStep = opts.performedStep;
  if (opts.outcome !== undefined) base.outcome = opts.outcome;
  if (opts.promotedTo !== undefined) base.promotedTo = opts.promotedTo;
  if (opts.blockedBy !== undefined) base.blockedBy = opts.blockedBy;
  if (opts.target !== undefined) base.target = opts.target;
  if (opts.setRpes !== undefined) base.setRpes = opts.setRpes;
  if (opts.completedAt !== undefined) base.completedAt = opts.completedAt;
  return base;
}

function targetOf(sets: number, value: number): SessionTarget {
  const work = Array.from({ length: sets }, () => ({ target: value, mode: 'fixed' as const }));
  return { goal: { label: 'intermediate', sets, value }, work };
}

function workDraftFor(
  id: ProgressionId,
  opts: {
    startedAt?: string;
    step?: number;
    sets?: number[];
    targetSets?: number;
    targetValue?: number;
    abandoned?: boolean;
  } = {},
): SessionDraft {
  const step = opts.step ?? 3;
  const draft: SessionDraft = {
    startedAt: opts.startedAt ?? '2026-10-12',
    progressionId: id,
    step,
    performedStep: step,
    kind: 'work',
    workSets: (opts.sets ?? []).map((v) => ({ value: v })),
    target: targetOf(opts.targetSets ?? 2, opts.targetValue ?? 20),
  };
  if (opts.abandoned === true) draft.abandoned = true;
  return draft;
}

function freeDraftFor(
  id: ProgressionId,
  opts: { startedAt?: string; step?: number; sets?: number[] } = {},
): SessionDraft {
  const step = opts.step ?? 3;
  return {
    startedAt: opts.startedAt ?? '2026-10-12',
    progressionId: id,
    step,
    performedStep: step,
    kind: 'free',
    workSets: (opts.sets ?? []).map((v) => ({ value: v })),
  };
}

const TODAY = '2026-10-12';

// ── recordedToday ─────────────────────────────────────────────────────────

describe('recordedToday', () => {
  it('history 가 빈 배열이면 빈 배열을 반환한다', () => {
    assert.deepEqual(recordedToday([], TODAY, 'pushup'), []);
  });

  it('다른 날짜의 기록은 포함하지 않는다', () => {
    const h: SessionRecord[] = [rec('pushup', 3, { date: '2026-10-11' })];
    assert.deepEqual(recordedToday(h, TODAY, 'pushup'), []);
  });

  it('다른 종목의 기록은 포함하지 않는다', () => {
    const h: SessionRecord[] = [rec('squat', 3)];
    assert.deepEqual(recordedToday(h, TODAY, 'pushup'), []);
  });

  it('kind === "free" 기록은 제외한다', () => {
    const h: SessionRecord[] = [rec('pushup', 3, { kind: 'free' })];
    assert.deepEqual(recordedToday(h, TODAY, 'pushup'), []);
  });

  it('kind === "work" 기록은 포함한다', () => {
    const h: SessionRecord[] = [rec('pushup', 3, { kind: 'work' })];
    const got = recordedToday(h, TODAY, 'pushup');
    assert.equal(got.length, 1);
    assert.equal(got[0].kind, 'work');
  });

  it('outcome === "abandoned" (kind === "work") 기록은 포함한다', () => {
    const h: SessionRecord[] = [rec('pushup', 3, { outcome: 'abandoned', sets: [] })];
    const got = recordedToday(h, TODAY, 'pushup');
    assert.equal(got.length, 1);
    assert.equal(got[0].outcome, 'abandoned');
  });

  it('kind === "consolidation" 기록은 포함한다', () => {
    const h: SessionRecord[] = [rec('pushup', 3, { kind: 'consolidation', performedStep: 2 })];
    const got = recordedToday(h, TODAY, 'pushup');
    assert.equal(got.length, 1);
    assert.equal(got[0].kind, 'consolidation');
  });

  it('오늘 같은 종목의 기록이 두 개이면 삽입 순서로 두 개를 반환한다', () => {
    const h: SessionRecord[] = [
      rec('pushup', 3, { sets: [10, 10] }),
      rec('pushup', 3, { sets: [12, 12] }),
    ];
    const got = recordedToday(h, TODAY, 'pushup');
    assert.equal(got.length, 2);
    assert.deepEqual(got[0].sets, [10, 10]);
    assert.deepEqual(got[1].sets, [12, 12]);
  });

  it('work + consolidation + free 가 섞여 있으면 free 를 제외한 두 개만 반환한다', () => {
    const h: SessionRecord[] = [
      rec('pushup', 3, { kind: 'work' }),
      rec('pushup', 3, { kind: 'free' }),
      rec('pushup', 3, { kind: 'consolidation', performedStep: 2 }),
    ];
    const got = recordedToday(h, TODAY, 'pushup');
    assert.equal(got.length, 2);
    assert.equal(got[0].kind, 'work');
    assert.equal(got[1].kind, 'consolidation');
  });
});

// ── doneResultLabel ───────────────────────────────────────────────────────

describe('doneResultLabel', () => {
  it('promotedTo 가 있는 기록 → "{progName}: {step}단계 → {promotedTo}단계 (승급)" 를 반환한다', () => {
    const r = rec('pushup', 3, { promotedTo: 4 });
    assert.equal(doneResultLabel('푸시업', r), '푸시업: 3단계 → 4단계 (승급)');
  });

  it('blockedBy === "rpe" 인 기록 → "{progName}: {step}단계 (보류 · rpe)" 를 반환한다', () => {
    const r = rec('pushup', 3, { blockedBy: 'rpe' });
    assert.equal(doneResultLabel('푸시업', r), '푸시업: 3단계 (보류 · rpe)');
  });

  it('blockedBy === "master" 인 기록 → "{progName}: {step}단계 (보류 · master)" 를 반환한다', () => {
    const r = rec('pushup', 10, { blockedBy: 'master' });
    assert.equal(doneResultLabel('푸시업', r), '푸시업: 10단계 (보류 · master)');
  });

  it('outcome === "abandoned" 인 기록 → "{progName}: {step}단계 중단" 을 반환한다', () => {
    const r = rec('pushup', 3, { outcome: 'abandoned', sets: [] });
    assert.equal(doneResultLabel('푸시업', r), '푸시업: 3단계 중단');
  });

  it('위 조건에 해당하지 않는 기록 → "{progName}: {step}단계 기록" 을 반환한다', () => {
    const r = rec('pushup', 3);
    assert.equal(doneResultLabel('푸시업', r), '푸시업: 3단계 기록');
  });

  it('함수 호출 후 record 인자가 변경되지 않는다', () => {
    const r = rec('pushup', 3, { promotedTo: 4, sets: [10, 10] });
    const snapshot = JSON.parse(JSON.stringify(r));
    doneResultLabel('푸시업', r);
    assert.deepEqual(r, snapshot);
  });
});

// ── doneSetShortfall ──────────────────────────────────────────────────────

describe('doneSetShortfall', () => {
  it('record.target 이 없으면 null 을 반환한다', () => {
    const r = rec('pushup', 3, { sets: [8] });
    assert.equal(doneSetShortfall(r, 0), null);
  });

  it('target.work[i] 가 있고 sets[i] >= target.work[i] 이면 null 을 반환한다', () => {
    const r = rec('pushup', 3, { sets: [20], target: targetOf(1, 20) });
    assert.equal(doneSetShortfall(r, 0), null);
  });

  it('sets[i] < target.work[i] 이면 "/ 목표 {target} · 미달" 형식의 문자열을 반환한다', () => {
    const r = rec('pushup', 3, { sets: [18], target: targetOf(1, 20) });
    assert.equal(doneSetShortfall(r, 0), '/ 목표 20 · 미달');
  });

  it('i 가 target.work 범위를 벗어나면 null 을 반환한다', () => {
    const r = rec('pushup', 3, { sets: [20, 18], target: targetOf(1, 20) });
    assert.equal(doneSetShortfall(r, 1), null);
  });
});

// ── syncDoneDrafts ────────────────────────────────────────────────────────

describe('syncDoneDrafts', () => {
  const history: SessionRecord[] = [
    rec('pushup', 3, { kind: 'work', performedStep: 3, sets: [20, 20] }),
  ];

  it('오늘 정규 기록이 없는 종목의 draft 는 액션에 포함하지 않는다', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('squat', 'work')]: workDraftFor('squat', { sets: [20] }),
    };
    assert.deepEqual(syncDoneDrafts(drafts, history, TODAY), []);
  });

  it('오늘 정규 기록이 있는 종목의 work draft 에 세트가 있으면 move-sets 와 remove-draft 액션을 반환한다', () => {
    const key = draftKey('pushup', 'work');
    const drafts: Record<string, SessionDraft> = {
      [key]: workDraftFor('pushup', { sets: [18, 17] }),
    };
    const actions = syncDoneDrafts(drafts, history, TODAY);
    assert.equal(actions.length, 2);
    assert.equal(actions[0].kind, 'move-sets');
    assert.equal(actions[1].kind, 'remove-draft');
    if (actions[0].kind === 'move-sets') {
      assert.equal(actions[0].fromKey, key);
      assert.equal(actions[0].toStep, 3);
      assert.deepEqual(actions[0].sets.map((s) => s.value), [18, 17]);
    }
    if (actions[1].kind === 'remove-draft') assert.equal(actions[1].key, key);
  });

  it('move-sets 의 toStep 은 마지막 정규 기록의 performedStep 이다', () => {
    const h2: SessionRecord[] = [
      rec('pushup', 3, { kind: 'work', performedStep: 3, sets: [20, 20] }),
      // 다지기 기록 — performedStep=2 가 마지막.
      rec('pushup', 3, { kind: 'consolidation', performedStep: 2, sets: [15] }),
    ];
    const key = draftKey('pushup', 'work');
    const drafts: Record<string, SessionDraft> = {
      [key]: workDraftFor('pushup', { sets: [10] }),
    };
    const actions = syncDoneDrafts(drafts, h2, TODAY);
    const move = actions.find((a) => a.kind === 'move-sets');
    assert.ok(move !== undefined);
    if (move !== undefined && move.kind === 'move-sets') {
      assert.equal(move.toStep, 2);
    }
  });

  it('세트가 없고 abandoned 가 아닌 draft → remove-draft 액션만 반환한다', () => {
    const key = draftKey('pushup', 'work');
    const drafts: Record<string, SessionDraft> = {
      [key]: workDraftFor('pushup', { sets: [] }),
    };
    const actions = syncDoneDrafts(drafts, history, TODAY);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].kind, 'remove-draft');
    if (actions[0].kind === 'remove-draft') assert.equal(actions[0].key, key);
  });

  it('abandoned: true 이고 세트가 없는 draft → remove-draft 액션만 반환한다', () => {
    const key = draftKey('pushup', 'work');
    const drafts: Record<string, SessionDraft> = {
      [key]: workDraftFor('pushup', { sets: [], abandoned: true }),
    };
    const actions = syncDoneDrafts(drafts, history, TODAY);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].kind, 'remove-draft');
  });

  it('abandoned: true 이고 세트가 있는 draft → move-sets + remove-draft 액션을 반환한다', () => {
    const key = draftKey('pushup', 'work');
    const drafts: Record<string, SessionDraft> = {
      [key]: workDraftFor('pushup', { sets: [10, 8], abandoned: true }),
    };
    const actions = syncDoneDrafts(drafts, history, TODAY);
    assert.equal(actions.length, 2);
    assert.equal(actions[0].kind, 'move-sets');
    assert.equal(actions[1].kind, 'remove-draft');
    if (actions[0].kind === 'move-sets') {
      assert.deepEqual(actions[0].sets.map((s) => s.value), [10, 8]);
    }
  });

  it('같은 종목의 free draft 가 같은 단계로 이미 있으면 move-sets 액션을 반환한다', () => {
    const fromKey = draftKey('pushup', 'work');
    const freeKey = draftKey('pushup', 'free');
    const drafts: Record<string, SessionDraft> = {
      [fromKey]: workDraftFor('pushup', { sets: [15] }),
      [freeKey]: freeDraftFor('pushup', { step: 3, sets: [12] }),
    };
    const actions = syncDoneDrafts(drafts, history, TODAY);
    const move = actions.find((a) => a.kind === 'move-sets');
    assert.ok(move !== undefined);
    if (move !== undefined && move.kind === 'move-sets') {
      assert.equal(move.fromKey, fromKey);
      assert.equal(move.toStep, 3);
    }
    // free draft 자체는 건드리지 않는다 — remove-draft 는 fromKey 뿐.
    const remove = actions.find((a) => a.kind === 'remove-draft');
    assert.ok(remove !== undefined);
    if (remove !== undefined && remove.kind === 'remove-draft') {
      assert.equal(remove.key, fromKey);
    }
  });

  it('같은 종목의 free draft 가 다른 단계로 있으면 report(step-mismatch) 액션을 반환하고 draft 를 건드리지 않는다', () => {
    const fromKey = draftKey('pushup', 'work');
    const freeKey = draftKey('pushup', 'free');
    const drafts: Record<string, SessionDraft> = {
      [fromKey]: workDraftFor('pushup', { sets: [15] }),
      [freeKey]: freeDraftFor('pushup', { step: 2, sets: [8] }),
    };
    const actions = syncDoneDrafts(drafts, history, TODAY);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].kind, 'report');
    if (actions[0].kind === 'report') {
      assert.equal(actions[0].key, fromKey);
      assert.equal(actions[0].reason, 'step-mismatch');
    }
  });

  it('수렴 — 반환된 액션 목록이 적용된 drafts 로 다시 호출하면 빈 배열을 반환한다 (멱등)', () => {
    const fromKey = draftKey('pushup', 'work');
    const drafts: Record<string, SessionDraft> = {
      [fromKey]: workDraftFor('pushup', { sets: [15] }),
    };
    const actions = syncDoneDrafts(drafts, history, TODAY);
    // 액션을 수동으로 적용 (applySync 와 동형).
    const next: Record<string, SessionDraft> = { ...drafts };
    for (const a of actions) {
      if (a.kind === 'remove-draft') delete next[a.key];
      if (a.kind === 'move-sets') {
        const from = drafts[a.fromKey];
        if (from === undefined) continue;
        next[draftKey(from.progressionId, 'free')] = {
          startedAt: from.startedAt,
          progressionId: from.progressionId,
          step: a.toStep,
          performedStep: a.toStep,
          kind: 'free',
          workSets: a.sets,
        };
      }
    }
    assert.deepEqual(syncDoneDrafts(next, history, TODAY), []);
  });

  it('세트는 잃지 않는다 — move-sets 액션의 sets 가 원래 draft 의 workSets 와 동일하다', () => {
    const fromKey = draftKey('pushup', 'work');
    const drafts: Record<string, SessionDraft> = {
      [fromKey]: workDraftFor('pushup', { sets: [20, 18, 16] }),
    };
    // workSets 는 rpe 를 가질 수도 있다.
    drafts[fromKey].workSets[0] = { value: 20, rpe: 7 };
    drafts[fromKey].workSets[1] = { value: 18, rpe: 8 };
    const actions = syncDoneDrafts(drafts, history, TODAY);
    const move = actions.find((a) => a.kind === 'move-sets');
    assert.ok(move !== undefined);
    if (move !== undefined && move.kind === 'move-sets') {
      assert.deepEqual(move.sets, drafts[fromKey].workSets);
    }
  });
});

// ── planFinish 연동 (FR-46.3) ─────────────────────────────────────────────

describe('planFinish 연동 (FR-46.3)', () => {
  it('syncDoneDrafts/applySync 가 생성한 자유 운동 칸에 대해 planFinish 를 실행하면 해당 칸이 기록의 performedStep 과 동일한 단계의 free op 를 포함한다', () => {
    // 상황: pushup 이 오늘 work 로 2 세트 기록됐고, 그 뒤 사용자가 ExerciseCard 로 2 세트
    // 더 쌓은 상태 — syncDoneDrafts 가 그 세트를 free 칸으로 이전한다.
    const history: SessionRecord[] = [
      rec('pushup', 3, { kind: 'work', performedStep: 3, sets: [20, 20] }),
    ];
    const fromKey = draftKey('pushup', 'work');
    const drafts: Record<string, SessionDraft> = {
      [fromKey]: workDraftFor('pushup', { sets: [15, 15] }),
    };

    // syncDoneDrafts 가 돌려주는 액션을 수동 적용 (applySync 와 동형).
    const actions = syncDoneDrafts(drafts, history, TODAY);
    const nextDrafts: Record<string, SessionDraft> = { ...drafts };
    for (const a of actions) {
      if (a.kind === 'remove-draft') delete nextDrafts[a.key];
      if (a.kind === 'move-sets') {
        const from = drafts[a.fromKey];
        if (from === undefined) continue;
        nextDrafts[draftKey(from.progressionId, 'free')] = {
          startedAt: from.startedAt,
          progressionId: from.progressionId,
          step: a.toStep,
          performedStep: a.toStep,
          kind: 'free',
          workSets: a.sets,
        };
      }
    }

    const plan = planFinish(nextDrafts, ['pushup']);
    assert.equal(plan.groups.length, 1);
    const freeGroup = plan.groups[0];
    assert.equal(freeGroup.ops.length, 1);
    const op = freeGroup.ops[0];
    assert.equal(op.kind, 'free');
    assert.equal(op.performedStep, 3);
    // 실행도 통과하는지 (최종 state 가 free 기록을 포함한다).
    const base = stateAt({ pushup: 3 }, history);
    const { nextState } = executeFinish(base, catalog, plan, '2026-10-12T10:00:00+09:00');
    const added = nextState.history[nextState.history.length - 1];
    assert.equal(added.kind, 'free');
    assert.equal(added.progressionId, 'pushup');
    assert.equal(added.performedStep ?? added.step, 3);
  });
});

// 미사용 타입 참조 방지용 (TS6133 회피).
const _never: SyncAction[] = [];
void _never;
