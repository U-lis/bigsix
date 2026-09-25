/**
 * 종목별 추이 계산 (FR-25.1~4 / EC-57).
 *
 * 룬 없는 순수 함수만. `localStorage` · 브라우저 상태에 닿지 않는다.
 *
 * FR-25.3: 목표 충족 여부는 **저장된 목표(`record.target`)로만** 판정한다.
 *          목표가 없는 옛 세션은 `meetsGoal === undefined` — 화면에서 "—" (EC-57).
 *          재계산으로 채워 넣지 않는다.
 * FR-25.4: `stepBoundary` 는 이전(시간순) 세션의 `performedStep` 과 달라진 첫
 *          세션에 붙는다. 승급 · 다지기 · 강등 모두 이 신호로 화면에서 구분된다.
 */

import { meetsStandard } from '$lib/domain';
import type {
  AppState, IsoDate, ProgressionId, SessionRecord, StandardLabel,
} from '$lib/domain/types';

export interface ProgressionRow {
  date: IsoDate;
  /** 훈련 중인 단계. 다지기여도 그대로. */
  step: number;
  /** 실제로 수행한 단계. 다지기면 step - 1. */
  performedStep: number;
  /** 세트별 실제 수행값. */
  sets: number[];
  /** `sets` 배열 합계. */
  total: number;
  /** 저장된 목표(`record.target.goal`). 없으면 undefined — 화면 "—". */
  goal?: { label: StandardLabel; sets: number; value: number };
  /** 저장된 목표 기준 충족 여부. 목표가 없으면 undefined — 화면 "—" (FR-25.3 · EC-57). */
  meetsGoal?: boolean;
  /** 세션 대표 RPE (`record.rpe`). 없으면 undefined. */
  rpe?: number;
  kind: 'work' | 'consolidation' | 'free';
  outcome?: 'completed' | 'abandoned';
  /** 이 세션 결과로 올라간 단계. 승급하지 않았으면 undefined. */
  promotedTo?: number;
  /** 이전 세션과 `performedStep` 이 달라졌다 (FR-25.4). 첫 세션은 false. */
  stepBoundary: boolean;
}

/**
 * 화면 진입 시 기본 선택 종목 (FR-25.1).
 * 마지막 세션의 종목, 기록이 아예 없으면 `'pushup'`.
 */
export function defaultProgressionId(state: AppState): ProgressionId {
  if (state.history.length === 0) return 'pushup';
  return state.history[state.history.length - 1].progressionId;
}

/**
 * 종목 하나의 세션 추이 (FR-25.2). 결과는 **최근 세션부터**.
 *
 * `state.history` 는 시간순(오래된 것 먼저)이므로 시간순으로 훑으며
 * `stepBoundary` 를 계산한 다음 뒤집는다.
 */
export function buildProgressionRows(
  state: AppState, id: ProgressionId,
): ProgressionRow[] {
  const own: SessionRecord[] = state.history.filter((r) => r.progressionId === id);
  const rows: ProgressionRow[] = [];
  let prevPerformedStep: number | null = null;
  for (const r of own) {
    const performedStep = r.performedStep ?? r.step;
    const stepBoundary = prevPerformedStep !== null && prevPerformedStep !== performedStep;
    prevPerformedStep = performedStep;
    const total = r.sets.reduce((a, b) => a + b, 0);
    const row: ProgressionRow = {
      date: r.date,
      step: r.step,
      performedStep,
      sets: r.sets,
      total,
      kind: r.kind,
      stepBoundary,
    };
    if (r.target) {
      row.goal = r.target.goal;
      row.meetsGoal = meetsStandard(r.sets, r.target.goal.sets, r.target.goal.value);
    }
    if (r.rpe !== undefined) row.rpe = r.rpe;
    if (r.outcome !== undefined) row.outcome = r.outcome;
    if (r.promotedTo !== undefined) row.promotedTo = r.promotedTo;
    rows.push(row);
  }
  // 최근 세션부터.
  rows.reverse();
  return rows;
}
