import { RULES } from './rules.ts';
import { standardOf, stepStreak, TIER_KO } from './progress.ts';
import { getStep, topStandard, valueOf } from './catalog.ts';
import { lastSession, sessionsAt } from './history.ts';
import type {
  AppState, Catalog, PlannedExercise, ProgressionId, Step, Unit,
} from './types.ts';

/** 종목별 좌우 고지에 쓰는 부위 명칭 (FR-1.3). */
const SIDE_PART: Partial<Record<ProgressionId, string>> = {
  squat: '다리',
  pushup: '팔',
  pullup: '팔',
  hspu: '팔',
};

/**
 * perSide 단계에서 사용자에게 보여줄 고지 문구 (FR-1.2 / FR-1.3).
 *
 * 표시용 사실 문구이며 계산에 관여하지 않는다 (FR-1.5).
 * `state` / `sets` 를 인자로 받지 않으므로 구조적으로 수치에 영향을 줄 수 없다.
 * 부위 명칭이 없는 종목(legraise / bridge — 데이터에 perSide 가 없다)은 undefined 를 돌려준다.
 */
function sideNoteFor(id: ProgressionId, perSide: boolean, unit: Unit = 'reps'): string | undefined {
  if (!perSide) return undefined;
  const part = SIDE_PART[id];
  if (part === undefined) return undefined;
  const measure = unit === 'seconds' ? '유지 시간' : '횟수';
  return `양쪽 ${part}을 모두 수행하고, 적게 한 쪽의 ${measure}를 입력한다.`;
}

/** 이 단계에서 지금까지 수행한 다지기 세션 횟수. */
export function consolidationCount(
  state: AppState, id: ProgressionId, step: number,
): number {
  return sessionsAt(state, id, step).filter((r) => r.kind === 'consolidation').length;
}

/** 1단계에는 되돌아갈 단계가 없다. */
export function canConsolidate(
  state: AppState, catalog: Catalog, id: ProgressionId,
): boolean {
  return state.steps[id] > 1;
}

/**
 * 다지기 세션 목표.
 * 사용자가 도전 중 '불가능' 을 눌러 이전 단계로 내려가기를 택했을 때 그 자리에서 호출한다.
 *
 * 수행량은 이전 단계의 상급자 기준에서 시작하되, 다지기가 `consolidationBumpEvery` 회
 * 쌓일 때마다 `consolidationBumpRatio` 만큼 올린다 — 30 → 33 → 36 → 39.
 */
export function planConsolidation(
  state: AppState, catalog: Catalog, id: ProgressionId,
): PlannedExercise {
  const n = state.steps[id];
  if (n <= 1) throw new Error(`${id} 1단계에서는 다지기로 내려갈 단계가 없다`);

  const step = getStep(catalog, id, n);
  const prev = getStep(catalog, id, n - 1);
  const baseValue = valueOf(topStandard(prev));

  const done = consolidationCount(state, id, n);
  const tier = Math.floor(done / RULES.consolidationBumpEvery);
  const factor = 1 + tier * RULES.consolidationBumpRatio;
  const target = Math.round(baseValue * factor);

  const bumpNote = tier > 0
    ? ` 다지기 ${done}회 누적 — 기준 ${baseValue} 에서 ${Math.round(factor * 100)}% 로 올림.`
    : '';

  return {
    progressionId: id,
    step: n,
    performedStep: prev.n,
    stepName: prev.name,
    unit: prev.unit,
    perSide: prev.perSide === true,
    work: Array.from({ length: RULES.consolidationSets },
      () => ({ target, mode: 'fixed' as const })),
    goal: { label: 'beginner', sets: step.beginner.sets, value: valueOf(step.beginner) },
    kind: 'consolidation',
    // 다지기는 이전 단계를 실제로 수행하므로 좌우 고지도 이전 단계 기준이다.
    sideNote: sideNoteFor(id, prev.perSide === true, prev.unit),
    reason: `${n}단계 초보자 기준 ${step.beginner.sets}×${valueOf(step.beginner)} 미달로 중단. `
      + `${prev.n}단계 ${target} × ${RULES.consolidationSets}세트.` + bumpNote,
  };
}

/**
 * 한 종목의 다음 세션 목표를 계산한다.
 * 선행 조건(gate)은 여기서 보지 않는다 — schedule.ts 또는 호출자가 checkGate 로 거른다.
 */
export function planExercise(
  state: AppState, catalog: Catalog, id: ProgressionId,
): PlannedExercise {
  const n = state.steps[id];
  const step = getStep(catalog, id, n);
  const base = {
    progressionId: id,
    step: n,
    performedStep: n,
    stepName: step.name,
    unit: step.unit,
    perSide: step.perSide === true,
    sideNote: sideNoteFor(id, step.perSide === true, step.unit),
  };

  // 목표는 지금 통과 중인 기준이다 (FR-22.4). 90% 규칙도 유지 세트도 없다 —
  // 승급이 "그 기준 3회 연속" 이므로 매 세션 그 기준을 그대로 노리면 된다.
  const streak = stepStreak(state, catalog, id);
  const std = standardOf(step, streak.tier);
  const stdVal = valueOf(std);
  const need = RULES.promotionStreakRequired;

  const last = lastSession(state, id, n);
  const retry = last?.outcome === 'abandoned';
  const done = consolidationCount(state, id, n);

  // 중단은 연속을 깨지 않으므로 목표도 그대로다. 실패한 것을 같은 목표로 다시 낸다
  // (FR-22.3b / EC-54). 난도를 낮추지 않는다.
  const reason = retry
    ? `직전 세션 중단 — 같은 목표로 재도전. `
      + `${TIER_KO[streak.tier]} 기준 ${std.sets}×${stdVal} · ${streak.streak}/${need}회 연속`
      + (done > 0 ? ` (다지기 ${done}회 누적).` : '.')
    : `${TIER_KO[streak.tier]} 기준 ${std.sets}×${stdVal} · ${streak.streak}/${need}회 연속.`;

  return {
    ...base,
    // 기준 이상이면 얼마든 더 해도 된다. 다만 초과분이 연속을 앞당기지는 않는다.
    work: Array.from({ length: std.sets }, () => ({ target: stdVal, mode: 'max' as const })),
    goal: { label: streak.tier, sets: std.sets, value: stdVal },
    kind: 'work',
    reason,
  };
}

/** pairWith 가 있으면 동반 단계를 붙인다(핸드스탠드 2단계 → 1단계). */
export function withPair(
  plan: PlannedExercise, state: AppState, catalog: Catalog,
): PlannedExercise {
  const step = getStep(catalog, plan.progressionId, plan.performedStep);
  if (step.pairWith === undefined) return plan;
  const paired = getStep(catalog, plan.progressionId, step.pairWith);
  return {
    ...plan,
    paired: {
      progressionId: plan.progressionId,
      step: plan.step,
      performedStep: paired.n,
      stepName: paired.name,
      unit: paired.unit,
      perSide: paired.perSide === true,
      sideNote: sideNoteFor(plan.progressionId, paired.perSide === true, paired.unit),
      work: [{ target: valueOf(paired.intermediate), mode: 'fixed' }],
      goal: {
        label: 'intermediate',
        sets: paired.intermediate.sets,
        value: valueOf(paired.intermediate),
      },
      kind: 'work',
      reason: step.note ?? `${step.n}단계와 항상 함께 수행한다.`,
    },
  };
}
