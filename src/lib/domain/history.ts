import type { AppState, ProgressionId, SessionRecord } from './types.ts';

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
