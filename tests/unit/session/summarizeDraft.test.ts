// SPEC5 Phase 4 — `summarizeDraft` 는 룬을 쓰지 않는 순수 함수다
// (ADR-46 / NFR-39 / R-4 / NFR-2). FinishDialog 가 보여 줄 칸별 요약 문구를
// 「{종목} {단계}: {사실}」 꼴로 조립한다.
//
// localStorage · 룬 · 브라우저 전역을 쓰지 않으므로 node 환경으로 충분하다.
// 종목·단계명 조회는 실제 카탈로그 (`loadCatalog()`) 를 쓴다 — 가짜 카탈로그를
// 만들어 라벨 가공 규칙을 따로 가지지 않는다.

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { planFinish } from '../../../src/lib/ui/session/finish.ts';
import { summarizeDraft } from '../../../src/lib/ui/session/summarizeDraft.ts';
import { draftKey, type SessionDraft } from '../../../src/lib/ui/state/storage.ts';
import type { ProgressionId, SessionTarget } from '../../../src/lib/domain/types.ts';
import { catalog } from '../helpers.ts';

// ── 조립기 ───────────────────────────────────────────────────────────────

function target(sets: number, value: number): SessionTarget {
  const work = Array.from({ length: sets }, () => ({ target: value, mode: 'fixed' as const }));
  return { goal: { label: 'intermediate', sets, value }, work };
}

function workDraft(
  progressionId: ProgressionId,
  opts: { step?: number; sets?: number[]; targetSets?: number; abandoned?: boolean } = {},
): SessionDraft {
  const step = opts.step ?? 3;
  const draft: SessionDraft = {
    startedAt: '2026-10-08',
    progressionId,
    step,
    performedStep: step,
    kind: 'work',
    workSets: (opts.sets ?? []).map((v) => ({ value: v })),
    target: target(opts.targetSets ?? 2, 20),
  };
  if (opts.abandoned) draft.abandoned = true;
  return draft;
}

function consolDraft(
  progressionId: ProgressionId,
  opts: { step?: number; sets?: number[]; targetSets?: number } = {},
): SessionDraft {
  const step = opts.step ?? 3;
  return {
    startedAt: '2026-10-08',
    progressionId,
    step,
    performedStep: step - 1,
    kind: 'consolidation',
    workSets: (opts.sets ?? []).map((v) => ({ value: v })),
    target: target(opts.targetSets ?? 3, 15),
  };
}

function freeDraft(
  progressionId: ProgressionId,
  opts: { step?: number; sets?: number[] } = {},
): SessionDraft {
  const step = opts.step ?? 3;
  return {
    startedAt: '2026-10-08',
    progressionId,
    step,
    performedStep: step,
    kind: 'free',
    workSets: (opts.sets ?? []).map((v) => ({ value: v })),
  };
}

/** 한 draft 가 만든 그룹 하나를 꺼낸다. 요약 문구 테스트에만 쓴다. */
function groupFor(draft: SessionDraft): ReturnType<typeof planFinish>['groups'][number] {
  const key = draftKey(draft.progressionId, draft.kind);
  const plan = planFinish({ [key]: draft }, [draft.progressionId]);
  if (plan.groups.length !== 1) {
    throw new Error('테스트 조립 오류 — 그룹이 1 개가 아님');
  }
  return plan.groups[0];
}

// ── work · N세트 ─────────────────────────────────────────────────────────

describe('summarizeDraft — work 「정규 N세트」', () => {
  it('계획과 같은 세트 수 → 「{종목} {단계}: 정규 N세트」', () => {
    const d = workDraft('pushup', { step: 3, sets: [20, 20], targetSets: 2 });
    const g = groupFor(d);
    const s = summarizeDraft(catalog, d, g);
    assert.match(s, /정규 2세트/);
    assert.match(s, /푸시업/);
    assert.match(s, /3단계/);
  });
});

// ── work · 초과 세트 → 자유 운동 분리 ─────────────────────────────────────

describe('summarizeDraft — work + free 「정규 N세트 · 추가 M세트」', () => {
  it('계획 세트 수를 넘기면 → 「정규 N세트 · 추가 M세트」', () => {
    const d = workDraft('pushup', { sets: [20, 20, 18], targetSets: 2 });
    const g = groupFor(d);
    const s = summarizeDraft(catalog, d, g);
    assert.match(s, /정규 2세트 · 추가 \d+세트/);
  });
});

// ── work · 중단 ──────────────────────────────────────────────────────────

describe('summarizeDraft — abandon 「중단」', () => {
  it('중단 + 세트 2 → 「중단 2세트」', () => {
    const d = workDraft('pushup', { sets: [10, 8], abandoned: true });
    const g = groupFor(d);
    const s = summarizeDraft(catalog, d, g);
    assert.match(s, /중단 2세트/);
  });

  it('중단 + 세트 0 → 「중단」', () => {
    const d = workDraft('pushup', { sets: [], abandoned: true });
    const g = groupFor(d);
    const s = summarizeDraft(catalog, d, g);
    assert.match(s, /중단$/);
  });
});

// ── consolidation ─────────────────────────────────────────────────────────

describe('summarizeDraft — consolidation 「다지기 N세트」', () => {
  it('계획과 같은 세트 수 → 「다지기 N세트」', () => {
    const d = consolDraft('pushup', { step: 3, sets: [15, 15, 15], targetSets: 3 });
    const g = groupFor(d);
    const s = summarizeDraft(catalog, d, g);
    assert.match(s, /다지기 3세트/);
  });

  it('초과 세트 있음 → 「다지기 N세트 · 추가 M세트」', () => {
    const d = consolDraft('pushup', { step: 3, sets: [15, 15, 15, 12], targetSets: 3 });
    const g = groupFor(d);
    const s = summarizeDraft(catalog, d, g);
    assert.match(s, /다지기 3세트 · 추가 1세트/);
  });
});

// ── free ──────────────────────────────────────────────────────────────────

describe('summarizeDraft — free 단독 「자유 운동 N세트」', () => {
  it('자유 운동 3세트 → 「자유 운동 3세트」', () => {
    const d = freeDraft('pushup', { sets: [10, 10, 10] });
    const g = groupFor(d);
    const s = summarizeDraft(catalog, d, g);
    assert.match(s, /자유 운동 3세트/);
  });
});

// ── NFR-2 / R-4 — 판정 결과·격려·백분율 금지 ──────────────────────────────

describe('summarizeDraft — NFR-2 / R-4 사실만 (판정·격려·백분율 금지)', () => {
  it('문자열에 「승급」·「유지」·「통과」·「실패」·「%」 가 없다', () => {
    const samples: SessionDraft[] = [
      workDraft('pushup', { sets: [20, 20], targetSets: 2 }),
      workDraft('pushup', { sets: [20, 20, 20, 18], targetSets: 2 }),
      workDraft('pushup', { sets: [5, 3], abandoned: true }),
      consolDraft('pushup', { sets: [15, 15, 15], targetSets: 3 }),
      consolDraft('pushup', { sets: [15, 15, 15, 10], targetSets: 3 }),
      freeDraft('pushup', { sets: [10] }),
    ];
    for (const d of samples) {
      const g = groupFor(d);
      const s = summarizeDraft(catalog, d, g);
      assert.doesNotMatch(s, /승급|유지|통과|실패|성공|좋|훌륭|대단|축하|달성/, s);
      assert.doesNotMatch(s, /%|％/, s);
    }
  });
});
