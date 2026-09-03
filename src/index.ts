export * from './types.ts';
export { RULES } from './rules.ts';
export { fromJSON, loadCatalog, getProgression, getStep, topStandard, topLabel, valueOf } from './catalog.ts';
export { checkGate, unlockedProgressions, type GateResult } from './gate.ts';
export { sessionsAt, lastSession, mean, meetsStandard } from './history.ts';
export { planExercise, planWarmup, planConsolidation, canConsolidate, consolidationCount, withPair } from './plan.ts';
export { evaluateSession, applySession, type Evaluation } from './evaluate.ts';
/** 요일 미리보기용 저수준 API. 날짜 기반 진입점은 `planOn` (Phase 4). */
export { planDay, planWeek, getProgram, listPrograms } from './schedule.ts';
export { weekdayOf, addDays, diffDays, dateRange, isMonday } from './date.ts';

import { RULES } from './rules.ts';
import type { AppState, ProgressionId } from './types.ts';

/**
 * 책 권고대로 전 종목 2단계에서 시작하는 초기 상태 (FR-10).
 * `stints` 가 빈 배열이라는 것은 **프로그램 미선택 상태**를 뜻한다.
 */
export function initialState(startStep: number = RULES.startStep): AppState {
  const ids: ProgressionId[] = ['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'];
  return {
    steps: Object.fromEntries(ids.map((id) => [id, startStep])) as AppState['steps'],
    history: [],
    stints: [],
    proposals: [],
  };
}
