export * from './types.ts';
export { RULES } from './rules.ts';
export { fromJSON, getProgression, getStep, topStandard, topLabel, valueOf } from './catalog.ts';
export { checkGate, unlockedProgressions, type GateResult } from './gate.ts';
export { setStep, MIN_STEP, MAX_STEP } from './steps.ts';
export { sessionsAt, lastSession, mean, meetsStandard } from './history.ts';
export { planExercise, planConsolidation, canConsolidate, consolidationCount, withPair } from './plan.ts';
export { evaluateSession, applySession, type Evaluation } from './evaluate.ts';
/** 요일 미리보기용 저수준 API. 날짜 기반 진입점은 `planOn` (Phase 4). */
export { planDay, planWeek, getProgram, listPrograms } from './schedule.ts';
export { weekdayOf, addDays, diffDays, dateRange, isMonday } from './date.ts';
export {
  describeProgram, describePrograms, firstTrainingDay, selectProgram, switchProgram,
  currentStint, stintAt, dayNumber, dayNumberOn, type ProgramDescription,
} from './program.ts';
export {
  proposeSwitch, proposeSwitchForCurrent, advanceProposals, commitProposal,
  activeProposal, declineProposal, markAccepted,
  PROGRAM_ORDER, nextProgramId, MAINTENANCE_SESSIONS,
  maintenanceCount, promotionBaselineIndex, effectiveFloorIndex, lastSetbackIndex, programProgressions,
  type ProposeOptions,
} from './proposal.ts';
export {
  abandonChallenge, recordSession, recordConsolidation, type AbandonResult,
} from './session.ts';
/** 날짜 기반 진입점 (FR-5, FR-6). 조회는 상태를 바꾸지 않는다. */
export { planOn, reviewDay, reviewRange } from './calendar.ts';

import { RULES } from './rules.ts';
import { switchProgram } from './program.ts';
import { activeProposal, markAccepted } from './proposal.ts';
import type { AppState, Catalog, IsoDate, ProgressionId } from './types.ts';

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

/**
 * 전환 제안 승인 (FR-4.8).
 * 3B 의 제안 상태 갱신과 3A 의 구간 전환을 잇는 배선이다.
 *
 * 노출 중인 제안이 없으면 상태를 그대로 돌려준다 (no-op, 예외 없음).
 *
 * **요일 검사를 하지 않는다.** 월요일 제약은 제안 *생성*(FR-4.6)에만 붙는다.
 * 승인일이 월요일이 아니어도 그날부터 새 구간이 시작되며,
 * 새 구간의 `startedAt` 은 `switchProgram` 이 첫 운동일 규칙(FR-2.6)으로 계산한다 —
 * 승인일이 새 루틴의 휴식일이면 다음 운동일이 1일차가 된다.
 *
 * 순서는 `markAccepted` 가 먼저다. 전환을 먼저 하면 `activeProposal` 이
 * 가리키는 대상이 바뀌어 제안이 미결로 남는다.
 * `steps` 와 `history` 는 손대지 않는다 (FR-3.5).
 */
export function acceptProposal(
  state: AppState, catalog: Catalog, onDate: IsoDate,
): AppState {
  const proposal = activeProposal(state);
  if (proposal === null) return state;
  return switchProgram(markAccepted(state, onDate), catalog, proposal.toProgramId, onDate);
}
