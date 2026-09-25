import { RULES } from './rules.ts';
import { getProgression } from './catalog.ts';
import { BIG_FOUR, type AppState, type Catalog, type ProgressionId } from './types.ts';

export interface GateResult {
  unlocked: boolean;
  /** 잠겨 있을 때, 아직 조건을 못 채운 빅4 종목들. */
  blocking: { progressionId: ProgressionId; currentStep: number; needStep: number }[];
  reason: string;
}

/** 필요한 최소 currentStep. */
function neededStep(): number {
  return RULES.gateRequiresCompletion ? RULES.gateStep + 1 : RULES.gateStep;
}

/**
 * 브리지·핸드스탠드는 빅4를 전부 6단계 완료하기 전에는 시작하지 않는다.
 * 빅4 자체는 항상 열려 있다.
 */
export function checkGate(state: AppState, catalog: Catalog, id: ProgressionId): GateResult {
  if (getProgression(catalog, id).requires === null) {
    return { unlocked: true, blocking: [], reason: '선행 조건 없음' };
  }
  const need = neededStep();
  const blocking = BIG_FOUR
    .filter((b) => state.steps[b] < need)
    .map((b) => ({ progressionId: b, currentStep: state.steps[b], needStep: need }));

  if (blocking.length === 0) {
    return { unlocked: true, blocking: [], reason: `빅4 전부 ${RULES.gateStep}단계 완료` };
  }
  const names = blocking
    .map((b) => `${getProgression(catalog, b.progressionId).name.ko} ${b.currentStep}단계`)
    .join(', ');
  return {
    unlocked: false,
    blocking,
    reason: `빅4 ${RULES.gateStep}단계 완료 필요 — 미달: ${names}`,
  };
}

export function unlockedProgressions(state: AppState, catalog: Catalog): ProgressionId[] {
  return catalog.progressions
    .map((p) => p.id)
    .filter((id) => checkGate(state, catalog, id).unlocked);
}
