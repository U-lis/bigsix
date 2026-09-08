import { checkGate } from './gate.ts';
import type { AppState, Catalog, ProgressionId } from './types.ts';

/** 훈련 단계의 허용 범위 (FR-13.2). */
export const MIN_STEP = 1;
export const MAX_STEP = 10;

/**
 * 종목의 훈련 단계를 수동으로 세팅한다 (FR-13).
 *
 * 쓰이는 곳은 둘이다 — 첫 실행에서 시작 단계를 고를 때(FR-3.5)와, 부상 복귀·오입력
 * 정정·프로그램 전환 후 수준 조정(FR-8.5)이다. 같은 API 를 쓴다.
 *
 * **`history` 를 손대지 않는다** (FR-13.4). 대신 조정 시점의 `history.length` 를
 * `adjustedAtSessionIndex[id]` 에 앵커로 남기고, 승급·유지 판정이 그 인덱스 이상인
 * 세션만 보게 한다 (FR-13.3, `proposal.ts` 의 `effectiveFloorIndex` 참조).
 * 앵커가 없으면 조정 전 세션이 유지 횟수에 섞여 전환 제안이 잘못 뜬다.
 * 이것은 데이터 삭제가 아니라 판정 범위 축소이며, 프로그램 전환의 `floorDate` 와 같은 방식이다.
 *
 * 잠긴 종목은 세팅할 수 없다 (FR-13.2 / EC-27). 조정으로 해금을 우회할 수 없다 (FR-13.5).
 *
 * 무리하게 높은 단계로 올리는 것은 막지 않는다 (FR-13.6). '불가능' → 다지기 → 강등
 * 경로로 스스로 내려온다는 것이 사용자 결정이다.
 */
export function setStep(
  state: AppState, catalog: Catalog, id: ProgressionId, step: number,
): AppState {
  if (!Number.isInteger(step) || step < MIN_STEP || step > MAX_STEP) {
    throw new Error(`단계는 ${MIN_STEP}~${MAX_STEP} 의 정수여야 한다: ${step}`);
  }
  const gate = checkGate(state, catalog, id);
  if (!gate.unlocked) {
    throw new Error(`잠긴 종목은 단계를 조정할 수 없다: ${id} — ${gate.reason}`);
  }
  return {
    ...state,
    steps: { ...state.steps, [id]: step },
    adjustedAtSessionIndex: {
      ...(state.adjustedAtSessionIndex ?? {}),
      [id]: state.history.length,
    },
  };
}
