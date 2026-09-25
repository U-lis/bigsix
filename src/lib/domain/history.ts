import type { AppState, ProgressionId, SessionRecord } from './types.ts';

/**
 * 판정용 히스토리 뷰 (FR-18.7 / ADR-16).
 *
 * 자유 운동(`kind === 'free'`)은 승급·유지·강등·다음 목표 계산 어디에도 영향을 주지 않는다.
 *
 * **`AppState` 를 받는 판정 코드는 이 함수(또는 `judgingState`)를 통한다.**
 * 다만 두 곳은 예외이며, 각자 인라인으로 같은 필터를 쓴다. 이유가 구조적이다 —
 * - `progress.ts` 의 `stepStreak`: `adjustedAtSessionIndex` 앵커가 **raw history 인덱스**라
 *   뷰로 좁히면 인덱스 정합이 깨진다
 * - `proposal.ts` 의 `sessionIndices`: `AppState` 가 아니라 `SessionRecord[]` 를 받으므로
 *   `judgingState` 로 변환할 대상이 없다
 *
 * **새 판정 경로를 만들 때 "이 함수만 쓰면 된다" 고 가정하지 마라.** raw history 를 받는
 * 함수라면 필터를 직접 넣어야 하고, 세 곳의 기준(`kind !== 'free'`)이 어긋나면 샌다.
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
