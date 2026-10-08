// SPEC5 Phase 3 — `planFinish` · `executeFinish` 는 룬을 쓰지 않는 순수 함수다
// (ADR-44 / NFR-39). FR-42.3~7 · FR-44.2 · EC-89~96 · EC-100~102 를 검증한다.
//
// localStorage · 룬 · 브라우저 전역을 쓰지 않으므로 node 환경으로 충분하다.

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import {
  planFinish,
  executeFinish,
  type FinishOp,
  type FinishPlan,
} from '../../../src/lib/ui/session/finish.ts';
import { draftKey, type SessionDraft } from '../../../src/lib/ui/state/storage.ts';
import type { ProgressionId, SessionTarget } from '../../../src/lib/domain/types.ts';
import { catalog, stateAt } from '../helpers.ts';

// ── 작은 조립기 ───────────────────────────────────────────────────────────

function target(sets: number, value: number): SessionTarget {
  const work = Array.from({ length: sets }, () => ({ target: value, mode: 'fixed' as const }));
  return {
    goal: { label: 'intermediate', sets, value },
    work,
  };
}

function workDraft(
  progressionId: ProgressionId,
  opts: {
    step?: number;
    startedAt?: string;
    sets?: number[];
    rpes?: (number | null | undefined)[];
    targetSets?: number;
    targetValue?: number;
    abandoned?: boolean;
  } = {},
): SessionDraft {
  const step = opts.step ?? 3;
  const sets = opts.sets ?? [];
  const rpes = opts.rpes ?? [];
  const draft: SessionDraft = {
    startedAt: opts.startedAt ?? '2026-10-08',
    progressionId,
    step,
    performedStep: step,
    kind: 'work',
    workSets: sets.map((v, i) => {
      const r = rpes[i];
      return r === undefined || r === null ? { value: v } : { value: v, rpe: r };
    }),
    target: target(opts.targetSets ?? 2, opts.targetValue ?? 20),
  };
  if (opts.abandoned) draft.abandoned = true;
  return draft;
}

function consolDraft(
  progressionId: ProgressionId,
  opts: {
    step?: number;
    startedAt?: string;
    sets?: number[];
    targetSets?: number;
    targetValue?: number;
  } = {},
): SessionDraft {
  const step = opts.step ?? 3;
  return {
    startedAt: opts.startedAt ?? '2026-10-08',
    progressionId,
    step,
    performedStep: step - 1,
    kind: 'consolidation',
    workSets: (opts.sets ?? []).map((v) => ({ value: v })),
    target: target(opts.targetSets ?? 3, opts.targetValue ?? 15),
  };
}

function freeDraft(
  progressionId: ProgressionId,
  opts: { step?: number; startedAt?: string; sets?: number[] } = {},
): SessionDraft {
  const step = opts.step ?? 3;
  return {
    startedAt: opts.startedAt ?? '2026-10-08',
    progressionId,
    step,
    performedStep: step,
    kind: 'free',
    workSets: (opts.sets ?? []).map((v) => ({ value: v })),
  };
}

const NOW = '2026-10-08T10:00:00+09:00';

// ── planFinish ────────────────────────────────────────────────────────────

describe('planFinish — 빈 칸 제외 (EC-89)', () => {
  it('workSets 가 비어 있고 abandoned 아님 → 그룹 자체가 생기지 않는다', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', { sets: [] }),
    };
    const plan = planFinish(drafts, ['pushup']);
    assert.deepEqual(plan.groups, []);
  });

  it('consolidation 칸이 비어도 그룹이 생기지 않는다', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'consolidation')]: consolDraft('pushup', { sets: [] }),
    };
    const plan = planFinish(drafts, ['pushup']);
    assert.deepEqual(plan.groups, []);
  });

  it('free 칸이 비어도 그룹이 생기지 않는다', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'free')]: freeDraft('pushup', { sets: [] }),
    };
    const plan = planFinish(drafts, ['pushup']);
    assert.deepEqual(plan.groups, []);
  });
});

describe('planFinish — work 칸 (FR-42.4 / EC-91)', () => {
  it('실제 세트가 목표 이하 → op `work` 하나 (전체 세트)', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', {
        sets: [20, 18],
        rpes: [7, 8],
        targetSets: 2,
      }),
    };
    const plan = planFinish(drafts, ['pushup']);
    assert.equal(plan.groups.length, 1);
    const g = plan.groups[0];
    assert.equal(g.draftKey, draftKey('pushup', 'work'));
    assert.equal(g.ops.length, 1);
    const op = g.ops[0];
    assert.equal(op.kind, 'work');
    assert.deepEqual(op.sets, [20, 18]);
    assert.deepEqual(op.setRpes, [7, 8]);
    assert.equal(op.date, '2026-10-08');
    assert.equal(op.progressionId, 'pushup');
    assert.equal(op.step, 3);
    assert.equal(op.performedStep, 3);
  });

  it('실제 세트가 목표 초과 → op `work`(앞 N) + op `free`(나머지, performedStep = draft.performedStep)', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', {
        sets: [20, 18, 15],
        rpes: [7, 8, 9],
        targetSets: 2,
      }),
    };
    const plan = planFinish(drafts, ['pushup']);
    assert.equal(plan.groups.length, 1);
    const ops = plan.groups[0].ops;
    assert.equal(ops.length, 2);
    assert.equal(ops[0].kind, 'work');
    assert.deepEqual(ops[0].sets, [20, 18]);
    assert.deepEqual(ops[0].setRpes, [7, 8]);
    assert.equal(ops[1].kind, 'free');
    assert.deepEqual(ops[1].sets, [15]);
    assert.deepEqual(ops[1].setRpes, [9]);
    // 자유 운동의 수행 단계 = draft.performedStep (= step)
    assert.equal(ops[1].performedStep, 3);
    assert.equal(ops[1].step, 3);
  });
});

describe('planFinish — abandon (FR-41.2 / EC-95)', () => {
  it('abandoned === true 인 work 칸 → op `abandon` 하나 (전체 세트)', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', {
        sets: [20, 18, 15],
        abandoned: true,
      }),
    };
    const plan = planFinish(drafts, ['pushup']);
    assert.equal(plan.groups.length, 1);
    const ops = plan.groups[0].ops;
    assert.equal(ops.length, 1);
    assert.equal(ops[0].kind, 'abandon');
    assert.deepEqual(ops[0].sets, [20, 18, 15]);
  });

  it('abandoned === true 이고 세트 0개 → op `abandon` 하나 (sets=[]) (EC-95)', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', {
        sets: [],
        abandoned: true,
      }),
    };
    const plan = planFinish(drafts, ['pushup']);
    assert.equal(plan.groups.length, 1);
    const ops = plan.groups[0].ops;
    assert.equal(ops.length, 1);
    assert.equal(ops[0].kind, 'abandon');
    assert.deepEqual(ops[0].sets, []);
    assert.deepEqual(ops[0].setRpes, []);
  });
});

describe('planFinish — consolidation (EC-92)', () => {
  it('consolidation 칸 목표 3세트, 실제 5세트 → op `consolidation`(앞 3) + op `free`(나머지, performedStep = step - 1)', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'consolidation')]: consolDraft('pushup', {
        step: 3,
        sets: [15, 15, 15, 12, 10],
        targetSets: 3,
      }),
    };
    const plan = planFinish(drafts, ['pushup']);
    assert.equal(plan.groups.length, 1);
    const ops = plan.groups[0].ops;
    assert.equal(ops.length, 2);
    assert.equal(ops[0].kind, 'consolidation');
    assert.deepEqual(ops[0].sets, [15, 15, 15]);
    assert.equal(ops[1].kind, 'free');
    assert.deepEqual(ops[1].sets, [12, 10]);
    // consolidation 초과 세트의 수행 단계는 step - 1
    assert.equal(ops[1].performedStep, 2);
    assert.equal(ops[1].step, 2);
  });

  it('consolidation 세트가 목표 이하 → op `consolidation` 하나', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'consolidation')]: consolDraft('pushup', {
        step: 3,
        sets: [15, 15],
        targetSets: 3,
      }),
    };
    const plan = planFinish(drafts, ['pushup']);
    const ops = plan.groups[0].ops;
    assert.equal(ops.length, 1);
    assert.equal(ops[0].kind, 'consolidation');
    assert.deepEqual(ops[0].sets, [15, 15]);
  });
});

describe('planFinish — free 칸', () => {
  it('free 칸 → op `free` 하나 (전체 세트)', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'free')]: freeDraft('pushup', {
        step: 3,
        sets: [10, 10, 10],
      }),
    };
    const plan = planFinish(drafts, ['pushup']);
    const ops = plan.groups[0].ops;
    assert.equal(ops.length, 1);
    assert.equal(ops[0].kind, 'free');
    assert.deepEqual(ops[0].sets, [10, 10, 10]);
    assert.equal(ops[0].step, 3);
    assert.equal(ops[0].performedStep, 3);
    // 자유 운동 op 에는 target 필드 자체가 없다 (undefined 명시 대입 금지).
    assert.ok(!('target' in ops[0]), 'free op 에는 target 필드가 없어야 한다');
  });
});

describe('planFinish — target 필드 처리 (undefined 명시 대입 금지)', () => {
  it('target 이 있는 work 칸의 op 는 target 을 담는다', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', { sets: [20, 20], targetSets: 2 }),
    };
    const plan = planFinish(drafts, ['pushup']);
    assert.ok(plan.groups[0].ops[0].target !== undefined);
  });
});

describe('planFinish — target 없는 칸 (undefined, v4 마이그레이션 경우)', () => {
  it('work 칸에 target 이 없으면 N=M, 전체 세트가 정규 op 하나로 (throw 없음, 세트 손실 없음)', () => {
    // v4 마이그레이션으로 target 필드가 아예 없는 draft 를 흉내낸다 (RISK-6).
    // `target` 키 자체가 없어야 draft.target?.work.length ?? M 분기가 M 을 쓴다.
    const draft: SessionDraft = {
      startedAt: '2026-10-08',
      progressionId: 'pushup',
      step: 3,
      performedStep: 3,
      kind: 'work',
      workSets: [{ value: 20 }, { value: 18 }, { value: 15 }],
    };
    assert.ok(!('target' in draft), 'draft 에 target 키가 없어야 한다');
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: draft,
    };
    const plan = planFinish(drafts, ['pushup']);
    assert.equal(plan.groups.length, 1);
    const ops = plan.groups[0].ops;
    assert.equal(ops.length, 1, '세트 손실 없이 op 하나');
    assert.equal(ops[0].kind, 'work');
    assert.deepEqual(ops[0].sets, [20, 18, 15]);
    // free op 가 끼어들지 않는다.
    assert.ok(!ops.some((o) => o.kind === 'free'), 'free op 가 생기지 않아야 한다');
    // op 에도 target 이 실리지 않는다 (undefined 명시 대입 금지).
    assert.ok(!('target' in ops[0]), 'op 에도 target 필드가 없어야 한다');
  });

  it('consolidation 칸에 target 이 없으면 N=M, 전체 세트가 다지기 op 하나로 (throw 없음, 세트 손실 없음)', () => {
    const draft: SessionDraft = {
      startedAt: '2026-10-08',
      progressionId: 'pushup',
      step: 3,
      performedStep: 2,
      kind: 'consolidation',
      workSets: [{ value: 15 }, { value: 15 }, { value: 12 }],
    };
    assert.ok(!('target' in draft), 'draft 에 target 키가 없어야 한다');
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'consolidation')]: draft,
    };
    const plan = planFinish(drafts, ['pushup']);
    assert.equal(plan.groups.length, 1);
    const ops = plan.groups[0].ops;
    assert.equal(ops.length, 1, '세트 손실 없이 op 하나');
    assert.equal(ops[0].kind, 'consolidation');
    assert.deepEqual(ops[0].sets, [15, 15, 12]);
    assert.ok(!ops.some((o) => o.kind === 'free'), 'free op 가 생기지 않아야 한다');
    assert.ok(!('target' in ops[0]), 'op 에도 target 필드가 없어야 한다');
  });
});

describe('planFinish — 그룹 순서 (agendaOrder, free 는 마지막)', () => {
  it('agendaOrder [pushup, squat], pushup:work + squat:work + pushup:free 가 있으면 pushup:work → squat:work → pushup:free', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'free')]: freeDraft('pushup', { sets: [10] }),
      [draftKey('squat', 'work')]: workDraft('squat', { sets: [20, 20] }),
      [draftKey('pushup', 'work')]: workDraft('pushup', { sets: [20, 20] }),
    };
    const plan = planFinish(drafts, ['pushup', 'squat']);
    const keys = plan.groups.map((g) => g.draftKey);
    assert.deepEqual(keys, [
      draftKey('pushup', 'work'),
      draftKey('squat', 'work'),
      draftKey('pushup', 'free'),
    ]);
  });

  it('한 종목 안에서 work → consolidation 순, 그 다음 다른 종목, free 는 전체 마지막', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('squat', 'free')]: freeDraft('squat', { sets: [10] }),
      [draftKey('pushup', 'consolidation')]: consolDraft('pushup', { sets: [15, 15] }),
      [draftKey('pushup', 'work')]: workDraft('pushup', { sets: [20, 20] }),
      [draftKey('squat', 'work')]: workDraft('squat', { sets: [20, 20] }),
    };
    const plan = planFinish(drafts, ['pushup', 'squat']);
    const keys = plan.groups.map((g) => g.draftKey);
    assert.deepEqual(keys, [
      draftKey('pushup', 'work'),
      draftKey('pushup', 'consolidation'),
      draftKey('squat', 'work'),
      draftKey('squat', 'free'),
    ]);
  });
});

describe('planFinish — scope filter (FR-44.2)', () => {
  it('scope: date → startedAt === date 인 칸만 포함', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', {
        sets: [20, 20],
        startedAt: '2026-10-07',
      }),
      [draftKey('squat', 'work')]: workDraft('squat', {
        sets: [20, 20],
        startedAt: '2026-10-08',
      }),
    };
    const plan = planFinish(drafts, ['pushup', 'squat'], {
      kind: 'date',
      date: '2026-10-07',
    });
    assert.equal(plan.groups.length, 1);
    assert.equal(plan.groups[0].draftKey, draftKey('pushup', 'work'));
  });

});

describe('planFinish — setRpes 슬라이스 (op 의 세트에 맞게 잘림)', () => {
  it('work 2 + free 1 → setRpes 가 각 op 의 세트 수에 맞게 분리된다', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', {
        sets: [20, 18, 15],
        rpes: [6, 7, 8],
        targetSets: 2,
      }),
    };
    const plan = planFinish(drafts, ['pushup']);
    const ops = plan.groups[0].ops;
    assert.deepEqual(ops[0].setRpes, [6, 7]);
    assert.deepEqual(ops[1].setRpes, [8]);
  });

  it('일부 세트의 rpe 가 undefined 면 null 로 바뀐다', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', {
        sets: [20, 18, 15],
        rpes: [6, undefined, 8],
        targetSets: 2,
      }),
    };
    const plan = planFinish(drafts, ['pushup']);
    const ops = plan.groups[0].ops;
    assert.deepEqual(ops[0].setRpes, [6, null]);
    assert.deepEqual(ops[1].setRpes, [8]);
  });
});

// ── executeFinish ─────────────────────────────────────────────────────────

describe('executeFinish — 모든 그룹 성공', () => {
  it('두 그룹이 모두 ok 로 끝나고 nextState 가 반영된다', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', {
        sets: [20, 20],
        targetSets: 2,
      }),
      [draftKey('squat', 'work')]: workDraft('squat', {
        sets: [20, 20],
        targetSets: 2,
      }),
    };
    const plan = planFinish(drafts, ['pushup', 'squat']);
    const initial = stateAt({ pushup: 3, squat: 3 });
    const { nextState, perDraft } = executeFinish(initial, catalog, plan, NOW);
    assert.equal(perDraft.length, 2);
    for (const r of perDraft) assert.equal(r.ok, true, r.reason ?? '');
    // 두 세션 모두 history 에 기록됐다.
    assert.equal(nextState.history.length, 2);
  });
});

describe('executeFinish — 중간 그룹 실패 (FR-42.6)', () => {
  it('중간 그룹이 throw 해도 그 칸만 ok: false 로 남고 다음 그룹은 계속 실행된다', () => {
    // squat consolidation 을 step 1 로 끼워 넣는다 — recordConsolidation 이
    // "다지기로 내려갈 단계가 없다" 로 throw 한다.
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', {
        sets: [20, 20],
        targetSets: 2,
      }),
      [draftKey('squat', 'consolidation')]: consolDraft('squat', {
        step: 1,
        sets: [15, 15],
        targetSets: 3,
      }),
      [draftKey('pullup', 'free')]: freeDraft('pullup', { step: 3, sets: [10] }),
    };
    const plan = planFinish(drafts, ['pushup', 'squat', 'pullup']);
    // 그룹 순서는 pushup:work → squat:consolidation → pullup:free 여야 한다.
    assert.deepEqual(plan.groups.map((g) => g.draftKey), [
      draftKey('pushup', 'work'),
      draftKey('squat', 'consolidation'),
      draftKey('pullup', 'free'),
    ]);

    // state 는 big4 를 7단계로 올려 pullup free 가 가능하게, squat 는 1단계로
    // 두어 consolidation 이 throw 하게 한다.
    const initial = stateAt({
      pushup: 3,
      squat: 1,
      pullup: 7,
      legraise: 7,
    });

    const { nextState, perDraft } = executeFinish(initial, catalog, plan, NOW);
    assert.equal(perDraft.length, 3);
    const map: Record<string, (typeof perDraft)[number]> = {};
    for (const r of perDraft) map[r.draftKey] = r;

    assert.equal(map[draftKey('pushup', 'work')].ok, true);
    assert.equal(map[draftKey('squat', 'consolidation')].ok, false);
    assert.ok(
      typeof map[draftKey('squat', 'consolidation')].reason === 'string'
        && map[draftKey('squat', 'consolidation')].reason!.length > 0,
      'reason 이 사실 문구로 들어 있어야 한다',
    );
    assert.equal(map[draftKey('pullup', 'free')].ok, true);

    // 성공한 두 세션이 history 에 들어 있고, 실패한 그룹은 상태에 영향이 없다.
    assert.equal(nextState.history.length, 2);
    assert.ok(nextState.history.some((h) => h.progressionId === 'pushup' && h.kind === 'work'));
    assert.ok(nextState.history.some((h) => h.progressionId === 'pullup' && h.kind === 'free'));
    assert.ok(!nextState.history.some((h) => h.progressionId === 'squat'));
  });
});

describe('executeFinish — completedAt 이 모든 op 에 전달된다', () => {
  it('기록된 세션의 completedAt 이 nowIsoLocal 과 같다', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', {
        sets: [20, 20],
        targetSets: 2,
      }),
    };
    const plan = planFinish(drafts, ['pushup']);
    const initial = stateAt({ pushup: 3 });
    const { nextState } = executeFinish(initial, catalog, plan, NOW);
    assert.equal(nextState.history.length, 1);
    assert.equal(nextState.history[0].completedAt, NOW);
  });

  it('abandon · consolidation · work · free 네 op 전부 completedAt 이 실린다', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', {
        step: 3,
        sets: [20, 20, 15],
        targetSets: 2,
      }),
      [draftKey('squat', 'work')]: workDraft('squat', {
        step: 3,
        sets: [20, 18],
        abandoned: true,
      }),
      [draftKey('pullup', 'consolidation')]: consolDraft('pullup', {
        step: 3,
        sets: [15, 15],
        targetSets: 3,
      }),
    };
    const plan = planFinish(drafts, ['pushup', 'squat', 'pullup']);
    const initial = stateAt({ pushup: 3, squat: 3, pullup: 3 });
    const { nextState, perDraft } = executeFinish(initial, catalog, plan, NOW);
    for (const r of perDraft) assert.equal(r.ok, true, r.reason ?? '');
    for (const h of nextState.history) {
      assert.equal(h.completedAt, NOW, `${h.progressionId} ${h.kind} 의 completedAt`);
    }
  });
});

describe('executeFinish — op date 는 draft.startedAt 이다 (EC-97)', () => {
  it('어제 날짜로 시작한 칸을 오늘 마치면 기록 날짜는 어제다', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', {
        sets: [20, 20],
        startedAt: '2026-10-07',
        targetSets: 2,
      }),
    };
    const plan = planFinish(drafts, ['pushup']);
    const initial = stateAt({ pushup: 3 });
    const { nextState } = executeFinish(initial, catalog, plan, NOW);
    assert.equal(nextState.history[0].date, '2026-10-07');
  });
});

// ── FinishPlan 자체의 모양을 조용히 점검 ───────────────────────────────────

describe('FinishPlan 모양', () => {
  it('summary 는 사실만 담은 문자열이다 (R-4 / NFR-2)', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', { sets: [20, 20, 15], targetSets: 2 }),
    };
    const plan: FinishPlan = planFinish(drafts, ['pushup']);
    assert.equal(typeof plan.groups[0].summary, 'string');
    // 격려·판정·백분율 같은 요소가 섞여 있지 않음을 얕게만 확인.
    assert.ok(!/%|대단|훌륭|승급|성공|실패/.test(plan.groups[0].summary));
  });
});

// ── FR-6.7a — SessionRecord.rpe === max(setRpes) ─────────────────────────
//
// `executeFinish` 가 work op 의 setRpes 중 최댓값을 세션 RPE 로 삼아 도메인에
// 넘기는지 검증한다 (FR-6.7a). 이 값은 `evaluate.ts` 의 rpeVeto (RPE 10 이면
// 승급 보류) 가 참조하므로 null/undefined 전환 규약이 깨지면 판정이 흔들린다.

describe('executeFinish — FR-6.7a 세션 RPE = max(setRpes)', () => {
  it('work op setRpes [7, 9, 8] → SessionRecord.rpe === 9', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', {
        sets: [20, 20, 20],
        rpes: [7, 9, 8],
        targetSets: 3,
      }),
    };
    const plan = planFinish(drafts, ['pushup']);
    const initial = stateAt({ pushup: 3 });
    const { nextState } = executeFinish(initial, catalog, plan, NOW);
    assert.equal(nextState.history.length, 1);
    assert.equal(nextState.history[0].rpe, 9);
  });

  it('work op setRpes 가 모두 null/undefined → SessionRecord.rpe === undefined', () => {
    const drafts: Record<string, SessionDraft> = {
      [draftKey('pushup', 'work')]: workDraft('pushup', {
        sets: [20, 20],
        rpes: [],
        targetSets: 2,
      }),
    };
    const plan = planFinish(drafts, ['pushup']);
    const initial = stateAt({ pushup: 3 });
    const { nextState } = executeFinish(initial, catalog, plan, NOW);
    assert.equal(nextState.history.length, 1);
    assert.equal(nextState.history[0].rpe, undefined);
  });
});
