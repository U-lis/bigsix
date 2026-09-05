import type { AppState, ProgressionId, SessionRecord } from './types.ts';

/**
 * 판정용 히스토리 뷰 (FR-18.7 / ADR-16).
 *
 * 자유 운동(`kind === 'free'`)은 승급·유지·강등·다음 목표 계산 어디에도 영향을
 * 주지 않는다. 그 필터는 이 함수 **하나**에 집중한다 — 네 곳에 조건을 흩뿌리지
 * 않는다. 판정하는 코드는 이 함수를 통해서만 히스토리를 본다.
 *
 * 조회(`reviewDay` 의 `performed`, `sessionsAt` 자체)는 이 필터를 쓰지 않는다.
 * 자유 운동 기록도 이력이므로 조회 결과에는 남아야 한다 (FR-18.8).
 */
export function judgingHistory(history: SessionRecord[]): SessionRecord[] {
  return history.filter((r) => r.kind !== 'free');
}

/**
 * `state` 를 판정용 뷰로 좁힌다. 자유 운동을 제외한 나머지는 그대로다.
 * 원본을 변형하지 않는다 (얕은 복사 + 새 배열).
 */
export function judgingState(state: AppState): AppState {
  return { ...state, history: judgingHistory(state.history) };
}

/** 해당 종목·단계의 기록만, 시간순. */
export function sessionsAt(
  state: AppState, id: ProgressionId, step: number,
): SessionRecord[] {
  return state.history.filter((r) => r.progressionId === id && r.step === step);
}

export function lastSession(
  state: AppState, id: ProgressionId, step: number,
): SessionRecord | undefined {
  return sessionsAt(state, id, step).at(-1);
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * 세션이 기준을 충족했는지.
 * 세트 수가 기준 이상이고, 그중 상위 `sets` 개가 모두 기준값 이상이어야 한다.
 */
export function meetsStandard(sets: number[], stdSets: number, stdValue: number): boolean {
  if (sets.length < stdSets) return false;
  const top = [...sets].sort((a, b) => b - a).slice(0, stdSets);
  return top.every((v) => v >= stdValue);
}
