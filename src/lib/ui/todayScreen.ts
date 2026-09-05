/**
 * 오늘 화면의 4상태 파생 (FR-17.2 / ADR-19).
 *
 * `rest` 의 도메인 정의(`planOn().rest`)는 건드리지 않는다 (FR-17.5 / FR-17.6).
 * 화면 층에서 조합해 4상태로 만든다.
 *
 * - `no-program`: 프로그램 미선택
 * - `rest`: 프로그램이 쉬라고 정한 날 (요일표 비어 있음)
 * - `no-doable`: rest === false 이나 exercises 가 빔 (잠긴 종목만 배정)
 * - `training`: exercises 가 있음
 *
 * 순수 함수다. `AppState` 를 변형하지 않는다 (NFR-2).
 * 컴포넌트에서 마운트하지 않고도 단위 테스트로 4상태 분기를 검증한다 (NFR-14).
 */

import { addDays } from '../domain/date.ts';
import { planOn, nextDoableTrainingDay } from '../domain/index.ts';
import type {
  AppState, Catalog, IsoDate, PlannedExercise, ProgressionId,
  SwitchProposal, Weekday,
} from '../domain/types.ts';

export type TodayScreenState =
  | { kind: 'no-program' }
  | { kind: 'rest'; nextTrainingDate: IsoDate | null }
  | {
      kind: 'no-doable';
      locked: { progressionId: ProgressionId; reason: string }[];
      nextTrainingDate: IsoDate | null;
    }
  | { kind: 'training'; agenda: TrainingAgenda };

/**
 * training 상태에서 화면이 필요로 하는 계획 정보.
 * `DayAgenda` 의 plan 분기 중 화면에 쓰는 필드만 남긴 부분 집합.
 */
export interface TrainingAgenda {
  date: IsoDate;
  weekday: Weekday;
  programId: string;
  dayNumber: number;
  exercises: PlannedExercise[];
  locked: { progressionId: ProgressionId; reason: string }[];
  proposal: SwitchProposal | null;
}

export function deriveTodayScreen(
  state: AppState, catalog: Catalog, today: IsoDate,
): TodayScreenState {
  const agenda = planOn(state, catalog, today);
  if (agenda.kind === 'no-program') return { kind: 'no-program' };

  // 이 페이즈의 계약: nextDoableTrainingDay 는 오늘의 다음 날부터 훑는다.
  // rest / no-doable 상태 모두에서 "이 다음 언제 다시 하나?" 를 알려 준다.
  const nextTrainingDate = nextDoableTrainingDay(state, catalog, addDays(today, 1));

  if (agenda.rest) return { kind: 'rest', nextTrainingDate };
  if (agenda.exercises.length === 0) {
    return { kind: 'no-doable', locked: agenda.locked, nextTrainingDate };
  }
  return {
    kind: 'training',
    agenda: {
      date: agenda.date,
      weekday: agenda.weekday,
      programId: agenda.programId,
      dayNumber: agenda.dayNumber,
      exercises: agenda.exercises,
      locked: agenda.locked,
      proposal: agenda.proposal,
    },
  };
}
