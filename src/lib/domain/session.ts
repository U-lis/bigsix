import { applySession, type Evaluation } from './evaluate.ts';
import { canConsolidate, planConsolidation } from './plan.ts';
import type {
  AppState, Catalog, IsoDate, PlannedExercise, ProgressionId, SessionInput, SessionRecord,
} from './types.ts';

/**
 * 세션 진행 흐름 (FR-7).
 *
 * 이 모듈은 계산을 하지 않는다. 기존 함수를 연결할 뿐이다.
 * 다지기 목표 계산은 `plan.ts` 의 `canConsolidate` / `planConsolidation` /
 * `consolidationCount` 에 이미 있고, 여기서 재구현하지 않는다 (FR-7.3).
 * 승급 판정은 `evaluate.ts` 의 `evaluateSession` 이 한다.
 *
 * 상태를 돌려주는 함수는 전부 `applySession` 을 경유한다.
 * 상태를 객체 리터럴로 다시 조립하지 않는다 — `stints` / `proposals` 를 잃지 않기 위함이다 (C-2).
 */

export interface AbandonResult {
  state: AppState;
  record: SessionRecord;
  /** 이전 단계로 내려갈 수 있는가. 1단계면 false (FR-7.4 / EC-9). */
  canConsolidate: boolean;
  /** 다지기 계획. 계획일 뿐 기록이 아니다. 내려갈 단계가 없으면 null. */
  consolidation: PlannedExercise | null;
}

/**
 * 도전 중 '불가능' 을 눌렀을 때 (FR-7.1).
 *
 * 세션을 `outcome: 'abandoned'` 로 기록하고, 이전 단계 다지기가 가능한지 판정한다.
 * 가능하면 다지기 **계획**을 함께 돌려준다.
 *
 * 다지기 세션을 자동으로 기록하지 않는다 (FR-7.2).
 * 다지기 수행 여부는 사용자가 확인을 거쳐 결정하며, 승인했을 때
 * 호출자가 `recordConsolidation` 을 부른다.
 *
 * 1단계에서는 내려갈 단계가 없다 (EC-9 / FR-7.4).
 * `canConsolidate` 로 먼저 걸러 `planConsolidation` 을 호출하지 않으므로 예외가 나지 않고,
 * 단계는 그대로 유지된다.
 */
export function abandonChallenge(
  state: AppState,
  catalog: Catalog,
  progressionId: ProgressionId,
  date: IsoDate,
  sets: number[],
  rpe?: number,
): AbandonResult {
  const input: SessionInput = {
    date,
    progressionId,
    step: state.steps[progressionId],
    sets,
    kind: 'work',
    outcome: 'abandoned',
  };
  // 값이 없을 때 undefined 를 명시 대입하지 않는다 — 필드 자체를 만들지 않는다.
  if (rpe !== undefined) input.rpe = rpe;

  const applied = applySession(state, catalog, input);

  const possible = canConsolidate(applied.state, catalog, progressionId);
  return {
    state: applied.state,
    record: applied.record,
    canConsolidate: possible,
    consolidation: possible ? planConsolidation(applied.state, catalog, progressionId) : null,
  };
}

/**
 * 세션 하나를 기록한다 (FR-7.5).
 *
 * `applySession` 에 그대로 위임한다. 아무 제약도 넣지 않는 것이 사양이다.
 * 같은 날 같은 종목을 두 번 이상 기록할 수 있고, 각 기록은 독립적으로 판정된다 (EC-4 / A-1).
 * 날짜 순서도 검증하지 않는다.
 */
export function recordSession(
  state: AppState, catalog: Catalog, input: SessionInput,
): { state: AppState; evaluation: Evaluation; record: SessionRecord } {
  return applySession(state, catalog, input);
}

/**
 * 사용자가 승인한 다지기 세션을 기록한다 (FR-7.2).
 *
 * `step` 은 훈련 중인 단계 그대로 두고 `performedStep` 만 하나 내린다.
 * `step` 을 내리면 `sessionsAt` 기반 조회가 전부 어긋난다.
 *
 * `evaluateSession` 이 `kind: 'consolidation'` 을 승급 판정 대상에서 제외하므로
 * 단계는 유지되고 `promotedTo` 는 채워지지 않는다.
 *
 * 1단계에서는 수행할 이전 단계가 없으므로 예외를 던진다.
 * 조용히 `performedStep: 0` 인 잘못된 기록을 남기지 않는다.
 */
export function recordConsolidation(
  state: AppState,
  catalog: Catalog,
  progressionId: ProgressionId,
  date: IsoDate,
  sets: number[],
  rpe?: number,
): { state: AppState; record: SessionRecord } {
  const step = state.steps[progressionId];
  if (step <= 1) {
    throw new Error(`${progressionId} ${step}단계에서는 다지기로 내려갈 단계가 없다`);
  }

  const input: SessionInput = {
    date,
    progressionId,
    step,
    performedStep: step - 1,
    sets,
    kind: 'consolidation',
  };
  if (rpe !== undefined) input.rpe = rpe;

  const applied = applySession(state, catalog, input);
  return { state: applied.state, record: applied.record };
}
