/**
 * 「오늘 운동 마치기」 플래너·실행기 (ADR-44 / NFR-39).
 *
 * SPEC5 Phase 3 — 기록 규칙을 두 **순수 함수**로 쪼갠다.
 *   - `planFinish(drafts, agendaOrder, scope?)` → `FinishPlan`
 *       drafts 맵을 그대로 보고 「무엇을 기록할지」만 결정한다. 시스템 시각을
 *       읽지 않는다 — 단위 테스트에서 결정적으로 돈다 (R-5).
 *   - `executeFinish(state, catalog, plan, nowIsoLocal)` → `{ nextState, perDraft }`
 *       플랜의 그룹을 순서대로 도메인에 적용한다. 각 그룹은 원자적 — op 하나라도
 *       throw 하면 그 그룹은 통째로 버리고 다음 그룹부터 다시 원래 상태 위에서
 *       계속한다 (FR-42.6 / EC-96).
 *
 * 룬을 import 하지 않는다. SSR 에서도 돌고 `tests/unit/session/finish.test.ts` 가
 * 직접 호출한다.
 *
 * 「추가 세트는 자유 운동」 분리 (J-2 / EC-91 / EC-92):
 *   - work 칸 M > N → 앞 N 세트는 work op, 나머지 (M−N) 세트는 free op
 *     (performedStep = draft.performedStep)
 *   - consolidation 칸 M > N → 앞 N 세트는 consolidation op, 나머지는 free op
 *     (performedStep = draft.step − 1)
 *   - abandon 칸: 전체 세트를 abandon op 하나로 (0세트도 포함 — EC-95)
 *   - free 칸: 전체 세트를 free op 하나로
 *   - 세트 0개인 비-abandon 칸: op 없음, DraftOps 자체를 만들지 않는다 (EC-89)
 *
 * 그룹 순서 (ADR-44):
 *   - agendaOrder 에 따른 종목 순
 *   - 한 종목 안에서 work → consolidation
 *   - free 칸은 전체 마지막 (종목 간에도 agendaOrder 순으로)
 *   - agendaOrder 에 없는 종목은 뒤에 안정 순서로 붙인다
 *
 * extras 규약 (ADR-23): `undefined` 필드는 **명시 대입하지 않는다**. `applyExtras`
 * 와 `applySession` 이 record 로 스프레드할 때 `key: undefined` 가 실리면 안 되기
 * 때문이다 — 이 모듈이 만든 extras · SessionInput 도 같은 규약을 지킨다.
 */

import {
  abandonChallenge,
  applySession,
  recordConsolidation,
} from '$lib/domain';
import type {
  AppState,
  Catalog,
  IsoDate,
  ProgressionId,
  SessionExtras,
  SessionInput,
  SessionTarget,
} from '$lib/domain/types';
import type { SessionDraft, SetEntry } from '$lib/ui/state/storage';

// ── 타입 ──────────────────────────────────────────────────────────────────

export type OpKind = 'work' | 'consolidation' | 'abandon' | 'free';

/**
 * 플래너가 만들어 실행기에 넘기는 단위 작업 (ADR-44).
 *
 * 한 draft 가 생성하는 op 개수:
 *   - work (미중단, M ≤ N): 1 — op `work`
 *   - work (미중단, M > N): 2 — op `work` + op `free`
 *   - work (중단): 1 — op `abandon`
 *   - consolidation (M ≤ N): 1 — op `consolidation`
 *   - consolidation (M > N): 2 — op `consolidation` + op `free`
 *   - free: 1 — op `free`
 *
 * `target` 은 자유 운동 op 에는 두지 않는다 (도메인 관례: 자유 운동은 target 이
 * 없다, `types.ts:84`).
 */
export interface FinishOp {
  kind: OpKind;
  progressionId: ProgressionId;
  /** 훈련 중인 단계. work op 의 `applySession.step` 에 그대로 쓰인다. */
  step: number;
  /**
   * 실제 수행 단계. free op 의 `applySession.step` 에도 쓰인다 (FR-18.4 — 자유
   * 운동은 사용자가 고른 단계 그대로다).
   *
   * work (미중단) 초과분이 만든 free op → draft.performedStep (= step).
   * consolidation 초과분이 만든 free op → draft.step − 1.
   */
  performedStep: number;
  sets: number[];
  setRpes: (number | null)[];
  /** 시작 시점의 목표 스냅샷. 자유 운동 op 에는 없다. */
  target?: SessionTarget;
  /** op 의 기록 날짜 = draft.startedAt (EC-97 — 날 넘긴 칸은 그 날짜로 기록). */
  date: IsoDate;
}

/**
 * 한 draft 가 만든 작업 묶음.
 *
 * `summary` 는 사실만 담은 문자열이다 (R-4 / NFR-2) — 백분율·격려·판정 금지.
 * **종목명·단계명은 담지 않는다** — Phase 4 의 UI 레이블 모듈(`summarizeDraft`) 이
 * 종목명을 추가한다. 세트 수 사실만 적는다:
 *   - work: `정규 N세트`
 *   - work + free: `정규 N세트 · 추가 M세트`
 *   - abandon: `중단 N세트` (N=0 이면 `중단`)
 *   - consolidation: `다지기 N세트`
 *   - consolidation + free: `다지기 N세트 · 추가 M세트`
 *   - free (단독): `자유 운동 N세트`
 */
export interface DraftOps {
  draftKey: string;
  ops: FinishOp[];
  summary: string;
}

export interface FinishPlan {
  groups: DraftOps[];
}

/**
 * 기록 범위.
 *
 * - `{ kind: 'all' }` (기본): 모든 칸 (오늘 운동 마치기)
 * - `{ kind: 'date', date }`: `startedAt === date` 인 칸만 (FR-44.2 — 날 넘긴 칸을
 *   그 날짜로 기록할 때)
 */
export type FinishScope = { kind: 'all' } | { kind: 'date'; date: IsoDate };

export interface PerDraftResult {
  draftKey: string;
  ok: boolean;
  /** `ok: false` 일 때 사유 문자열. `ok: true` 면 생략. */
  reason?: string;
}

export interface FinishResult {
  nextState: AppState;
  perDraft: PerDraftResult[];
}

// ── planFinish ────────────────────────────────────────────────────────────

/**
 * drafts 맵을 보고 기록 플랜을 만든다 (ADR-44 — 플래너).
 *
 * 시스템 시각을 읽지 않는다. `completedAt` 은 실행기(`executeFinish`)가
 * `nowIsoLocal` 로 채운다 — 플래너는 결정적이어야 한다 (R-5).
 */
export function planFinish(
  drafts: Record<string, SessionDraft>,
  agendaOrder: readonly ProgressionId[],
  scope: FinishScope = { kind: 'all' },
): FinishPlan {
  // 1. scope 필터
  const filtered: [string, SessionDraft][] = [];
  for (const [key, draft] of Object.entries(drafts)) {
    if (scope.kind === 'date' && draft.startedAt !== scope.date) continue;
    filtered.push([key, draft]);
  }

  // 2. 역할별 분류
  const planned: [string, SessionDraft][] = []; // work · consolidation
  const frees: [string, SessionDraft][] = [];
  for (const entry of filtered) {
    if (entry[1].kind === 'free') frees.push(entry);
    else planned.push(entry);
  }

  // 3. agendaOrder 순으로 정렬: 종목별 work → consolidation
  const ordered: [string, SessionDraft][] = [];
  const taken = new Set<string>();
  for (const pid of agendaOrder) {
    for (const entry of planned) {
      if (entry[1].progressionId === pid && entry[1].kind === 'work' && !taken.has(entry[0])) {
        ordered.push(entry);
        taken.add(entry[0]);
      }
    }
    for (const entry of planned) {
      if (
        entry[1].progressionId === pid
        && entry[1].kind === 'consolidation'
        && !taken.has(entry[0])
      ) {
        ordered.push(entry);
        taken.add(entry[0]);
      }
    }
  }
  // agendaOrder 에 없는 종목은 뒤에 삽입 순으로 붙인다 (안전 — 플래너가 특정
  // 종목을 조용히 떨구지 않는다).
  for (const entry of planned) {
    if (!taken.has(entry[0])) {
      ordered.push(entry);
      taken.add(entry[0]);
    }
  }

  // 4. free 는 전체 마지막, 그 안에서 agendaOrder 순
  const freeOrdered: [string, SessionDraft][] = [];
  const takenFree = new Set<string>();
  for (const pid of agendaOrder) {
    for (const entry of frees) {
      if (entry[1].progressionId === pid && !takenFree.has(entry[0])) {
        freeOrdered.push(entry);
        takenFree.add(entry[0]);
      }
    }
  }
  for (const entry of frees) {
    if (!takenFree.has(entry[0])) {
      freeOrdered.push(entry);
      takenFree.add(entry[0]);
    }
  }

  const finalOrder = [...ordered, ...freeOrdered];

  // 5. 각 draft → DraftOps
  const groups: DraftOps[] = [];
  for (const [key, draft] of finalOrder) {
    const ops = planOpsForDraft(draft);
    if (ops.length === 0) continue; // EC-89
    groups.push({ draftKey: key, ops, summary: summarize(draft, ops) });
  }

  return { groups };
}

/** 한 draft 를 op 들로 쪼갠다. 세트가 비면 op 가 없다 — abandon 만 예외 (EC-95). */
function planOpsForDraft(draft: SessionDraft): FinishOp[] {
  const sets = draft.workSets.map((e) => e.value);
  const setRpes: (number | null)[] = draft.workSets.map((e) => e.rpe ?? null);
  const M = sets.length;

  if (draft.kind === 'work') {
    if (draft.abandoned === true) {
      // 중단은 세트가 0이어도 op 를 만든다 (EC-95).
      return [makeOp('abandon', draft, sets, setRpes, draft.step, draft.performedStep)];
    }
    if (M === 0) return []; // EC-89
    const N = draft.target?.work.length ?? M;
    const workSets = sets.slice(0, N);
    const workRpes = setRpes.slice(0, N);
    const ops: FinishOp[] = [
      makeOp('work', draft, workSets, workRpes, draft.step, draft.performedStep),
    ];
    if (M > N) {
      ops.push(makeFreeOp(draft, sets.slice(N), setRpes.slice(N), draft.performedStep));
    }
    return ops;
  }

  if (draft.kind === 'consolidation') {
    if (M === 0) return []; // EC-89
    const N = draft.target?.work.length ?? M;
    const consolSets = sets.slice(0, N);
    const consolRpes = setRpes.slice(0, N);
    const ops: FinishOp[] = [
      makeOp('consolidation', draft, consolSets, consolRpes, draft.step, draft.performedStep),
    ];
    if (M > N) {
      // consolidation 초과 세트의 수행 단계는 draft.step − 1 (EC-92).
      ops.push(makeFreeOp(draft, sets.slice(N), setRpes.slice(N), draft.step - 1));
    }
    return ops;
  }

  // free
  if (M === 0) return []; // EC-89
  return [makeFreeOp(draft, sets, setRpes, draft.performedStep)];
}

/** 자유 운동 op 는 target 을 담지 않는다 (도메인 관례: 자유 운동은 target 없음). */
function makeFreeOp(
  draft: SessionDraft,
  sets: number[],
  setRpes: (number | null)[],
  performedStep: number,
): FinishOp {
  const op: FinishOp = {
    kind: 'free',
    progressionId: draft.progressionId,
    // 자유 운동의 applySession 은 step 만 보므로 step === performedStep.
    step: performedStep,
    performedStep,
    sets,
    setRpes,
    date: draft.startedAt,
  };
  // target 은 명시 대입하지 않는다.
  return op;
}

function makeOp(
  kind: Exclude<OpKind, 'free'>,
  draft: SessionDraft,
  sets: number[],
  setRpes: (number | null)[],
  step: number,
  performedStep: number,
): FinishOp {
  const op: FinishOp = {
    kind,
    progressionId: draft.progressionId,
    step,
    performedStep,
    sets,
    setRpes,
    date: draft.startedAt,
  };
  if (draft.target !== undefined) op.target = draft.target;
  return op;
}

/**
 * draft 종류와 op 조합을 보고 사실 문구를 만든다.
 * 종목·단계명은 넣지 않는다 — Phase 4 UI 레이블 모듈이 종목명을 덧붙인다.
 */
function summarize(draft: SessionDraft, ops: FinishOp[]): string {
  const hasFree = ops.some((o) => o.kind === 'free');
  const freeCount = ops.find((o) => o.kind === 'free')?.sets.length ?? 0;

  if (draft.kind === 'work') {
    if (draft.abandoned === true) {
      const op = ops[0];
      if (op.sets.length === 0) return '중단';
      return `중단 ${op.sets.length}세트`;
    }
    const workCount = ops.find((o) => o.kind === 'work')?.sets.length ?? 0;
    if (hasFree) return `정규 ${workCount}세트 · 추가 ${freeCount}세트`;
    return `정규 ${workCount}세트`;
  }

  if (draft.kind === 'consolidation') {
    const consolCount = ops.find((o) => o.kind === 'consolidation')?.sets.length ?? 0;
    if (hasFree) return `다지기 ${consolCount}세트 · 추가 ${freeCount}세트`;
    return `다지기 ${consolCount}세트`;
  }

  // free 단독
  return `자유 운동 ${freeCount}세트`;
}

// ── executeFinish ─────────────────────────────────────────────────────────

/**
 * 플랜을 상태 위에 적용한다 (ADR-44 — 실행기).
 *
 * 각 그룹은 **원자적**이다 — op 중 하나라도 throw 하면 그룹의 중간 상태를 버리고
 * `{ ok: false, reason }` 을 기록한다. 그 뒤 그룹들은 **실패 그룹을 적용하지 않은
 * 상태** 위에서 계속 돈다 (FR-42.6 / EC-96).
 */
export function executeFinish(
  state: AppState,
  catalog: Catalog,
  plan: FinishPlan,
  nowIsoLocal: string,
): FinishResult {
  let current = state;
  const perDraft: PerDraftResult[] = [];
  for (const group of plan.groups) {
    try {
      let temp = current;
      for (const op of group.ops) {
        temp = applyOp(temp, catalog, op, nowIsoLocal);
      }
      // 그룹 전체 성공 — 커밋.
      current = temp;
      perDraft.push({ draftKey: group.draftKey, ok: true });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      perDraft.push({ draftKey: group.draftKey, ok: false, reason });
      // current 를 그대로 두고 다음 그룹 계속.
    }
  }
  return { nextState: current, perDraft };
}

/**
 * op 하나를 상태에 적용한다. 도메인 함수 중 하나로 위임한다.
 *
 * `rpe` 는 세트별 RPE 중 최댓값으로 유도한다 (FR-6.7a).
 * `extras` 와 `SessionInput` 모두 undefined 필드는 명시 대입하지 않는다 (ADR-23).
 */
function applyOp(
  state: AppState,
  catalog: Catalog,
  op: FinishOp,
  nowIsoLocal: string,
): AppState {
  const rpe = maxRpe(op.setRpes);

  if (op.kind === 'work') {
    const input: SessionInput = {
      date: op.date,
      progressionId: op.progressionId,
      step: op.step,
      performedStep: op.performedStep,
      sets: op.sets,
      kind: 'work',
    };
    if (rpe !== undefined) input.rpe = rpe;
    if (op.target !== undefined) input.target = op.target;
    input.setRpes = op.setRpes;
    input.completedAt = nowIsoLocal;
    return applySession(state, catalog, input).state;
  }

  if (op.kind === 'free') {
    // 자유 운동은 `step` 만 쓰고 target 을 담지 않는다 (FR-18.4).
    const input: SessionInput = {
      date: op.date,
      progressionId: op.progressionId,
      step: op.performedStep,
      performedStep: op.performedStep,
      sets: op.sets,
      kind: 'free',
    };
    if (rpe !== undefined) input.rpe = rpe;
    input.setRpes = op.setRpes;
    input.completedAt = nowIsoLocal;
    return applySession(state, catalog, input).state;
  }

  if (op.kind === 'consolidation') {
    const extras = buildExtras(op, nowIsoLocal);
    return recordConsolidation(
      state,
      catalog,
      op.progressionId,
      op.date,
      op.sets,
      rpe,
      extras,
    ).state;
  }

  // abandon
  const extras = buildExtras(op, nowIsoLocal);
  return abandonChallenge(
    state,
    catalog,
    op.progressionId,
    op.date,
    op.sets,
    rpe,
    extras,
  ).state;
}

function buildExtras(op: FinishOp, nowIsoLocal: string): SessionExtras {
  const extras: SessionExtras = {
    setRpes: op.setRpes,
    completedAt: nowIsoLocal,
  };
  if (op.target !== undefined) extras.target = op.target;
  return extras;
}

/** 세트별 RPE 중 최댓값. 입력된 값이 없으면 undefined. */
function maxRpe(setRpes: readonly (number | null)[]): number | undefined {
  let max: number | undefined = undefined;
  for (const r of setRpes) {
    if (r === null) continue;
    if (max === undefined || r > max) max = r;
  }
  return max;
}

// SetEntry 는 플래너가 직접 쓰지 않지만, SessionDraft 의 workSets 타입 참조로 유지.
export type { SetEntry };
