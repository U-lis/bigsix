import { RULES } from './rules.ts';
import { getStep, topLabel, topStandard, valueOf } from './catalog.ts';
import { lastSession, mean, meetsStandard, sessionsAt } from './history.ts';
import type {
  AppState, Catalog, PlannedExercise, ProgressionId, Step, TargetSet,
} from './types.ts';

/** 워밍업: 최대 2세트. 1~2단계는 1단계 중급+상급, 3단계부터는 직전 두 단계의 중급 기준. */
export function planWarmup(catalog: Catalog, id: ProgressionId, step: number): TargetSet[] {
  const sets: TargetSet[] = [];
  if (step <= 2) {
    const s1 = getStep(catalog, id, 1);
    sets.push({ target: valueOf(s1.intermediate), mode: 'fixed' });
    sets.push({ target: valueOf(topStandard(s1)), mode: 'fixed' });
  } else {
    for (const n of [step - 2, step - 1]) {
      sets.push({ target: valueOf(getStep(catalog, id, n).intermediate), mode: 'fixed' });
    }
  }
  return sets.slice(0, RULES.maxWarmupSets);
}

function carryValue(avg: number, rpe: number | undefined): number {
  const down = rpe !== undefined && rpe >= RULES.rpeDownshiftAt ? RULES.rpeDownshiftAmount : 0;
  return Math.max(1, Math.floor(avg) - down);
}

/** 이 단계에서 초보자 기준을 한 번이라도 충족한 적이 있는가(한 번 넘으면 되돌아가지 않는다). */
function hasClearedBeginner(state: AppState, id: ProgressionId, step: Step): boolean {
  return sessionsAt(state, id, step.n)
    .filter((r) => r.kind === 'work')
    .some((r) => meetsStandard(r.sets, step.beginner.sets, valueOf(step.beginner)));
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
    stepName: step.name,
    unit: step.unit,
    perSide: step.perSide === true,
    warmup: planWarmup(catalog, id, n),
  };

  const top = topStandard(step);
  const topVal = valueOf(top);
  const interVal = valueOf(step.intermediate);
  const beginVal = valueOf(step.beginner);

  const history = sessionsAt(state, id, n);
  const last = lastSession(state, id, n);
  const cleared = hasClearedBeginner(state, id, step);

  // --- 1. 아직 초보자 기준을 못 넘은 구간 ---
  if (!cleared) {
    const lastWork = history.filter((r) => r.kind === 'work').at(-1);
    const needsConsolidation = lastWork !== undefined && last?.kind === 'work';

    if (needsConsolidation && n > 1) {
      const prev = getStep(catalog, id, n - 1);
      const prevTop = valueOf(topStandard(prev));
      return {
        ...base,
        work: Array.from({ length: RULES.consolidationSets },
          () => ({ target: prevTop, mode: 'fixed' as const })),
        goal: { label: 'beginner', sets: step.beginner.sets, value: beginVal },
        kind: 'consolidation',
        reason: `${n}단계 초보자 기준 ${step.beginner.sets}×${beginVal} 미달. `
          + `${n - 1}단계 상급자 기준 ${prevTop} 으로 ${RULES.consolidationSets}세트 다진 뒤 재도전.`,
      };
    }
    return {
      ...base,
      work: [{ target: beginVal, mode: 'max' }],
      goal: { label: 'beginner', sets: step.beginner.sets, value: beginVal },
      kind: 'work',
      reason: history.length === 0
        ? `${n}단계 첫 세션. 초보자 기준 ${step.beginner.sets}×${beginVal} 도전.`
        : `이전 단계로 다진 뒤 초보자 기준 ${step.beginner.sets}×${beginVal} 재도전.`,
    };
  }

  // --- 2. 초보자 통과 이후: 직전 세션이 중급자 기준을 넘었는지로 갈린다 ---
  const lastSets = last?.sets ?? [];
  const hitInter = meetsStandard(lastSets, step.intermediate.sets, interVal);
  const goalStd = hitInter ? top : step.intermediate;
  const goalVal = hitInter ? topVal : interVal;
  const goalLabel = hitInter ? topLabel(step) : ('intermediate' as const);
  const avg = mean(lastSets);

  // 90% 규칙 — 직전 평균이 목표의 90% 이상이면 기준 자체에 도전한다.
  if (avg >= RULES.attemptThreshold * goalVal) {
    return {
      ...base,
      work: Array.from({ length: goalStd.sets },
        () => ({ target: goalVal, mode: 'fixed' as const })),
      goal: { label: goalLabel, sets: goalStd.sets, value: goalVal },
      kind: 'work',
      reason: `직전 평균 ${avg.toFixed(1)} 이 목표 ${goalVal} 의 `
        + `${Math.round(RULES.attemptThreshold * 100)}% 이상. 기준 ${goalStd.sets}×${goalVal} 직접 도전.`,
    };
  }

  const carry = carryValue(avg, last?.rpe);
  const carrySets = goalStd.sets >= 3 ? goalStd.sets - 1 : 1;
  const work: TargetSet[] = [
    ...Array.from({ length: carrySets }, () => ({ target: carry, mode: 'fixed' as const })),
    { target: goalVal, mode: 'max' as const },
  ];
  const downshifted = last?.rpe !== undefined && last.rpe >= RULES.rpeDownshiftAt;

  return {
    ...base,
    work,
    goal: { label: goalLabel, sets: goalStd.sets, value: goalVal },
    kind: 'work',
    reason: `직전 평균 ${avg.toFixed(1)}. 유지 ${carrySets}세트 ${carry}회 뒤 `
      + `마지막 세트는 ${goalVal} 까지 최대한.`
      + (downshifted ? ` (직전 RPE ${last!.rpe} — 유지 세트 ${RULES.rpeDownshiftAmount} 하향)` : ''),
  };
}

/** pairWith 가 있으면 동반 단계를 붙인다(핸드스탠드 2단계 → 1단계). */
export function withPair(
  plan: PlannedExercise, state: AppState, catalog: Catalog,
): PlannedExercise {
  const step = getStep(catalog, plan.progressionId, plan.step);
  if (step.pairWith === undefined) return plan;
  const paired = getStep(catalog, plan.progressionId, step.pairWith);
  return {
    ...plan,
    paired: {
      progressionId: plan.progressionId,
      step: paired.n,
      stepName: paired.name,
      unit: paired.unit,
      perSide: paired.perSide === true,
      warmup: [],
      work: [{ target: valueOf(paired.intermediate), mode: 'fixed' }],
      goal: {
        label: 'intermediate',
        sets: paired.intermediate.sets,
        value: valueOf(paired.intermediate),
      },
      kind: 'work',
      reason: step.note ?? `${plan.step}단계와 항상 함께 수행한다.`,
    },
  };
}
