import { addDays, diffDays, weekdayOf } from './date.ts';
import { getProgram, LABEL_TO_ID, planDay } from './schedule.ts';
import { WEEKDAYS } from './types.ts';
import type {
  AppState, Catalog, IsoDate, ProgramStint, ProgressionId, Weekday,
} from './types.ts';

/**
 * 프로그램 하나의 설명 (FR-2.3).
 * 모든 필드는 카탈로그에서 파생 계산한다. `data/progressions.json` 에 중복 저장하지 않는다.
 */
export interface ProgramDescription {
  id: string;
  name: { en: string; ko: string };
  frequency: string;
  /** 7요일 중 요일표가 비어 있지 않은 요일 수. */
  trainingDays: number;
  /** `7 - trainingDays`. */
  restDays: number;
  /** 요일표에 등장하는 빅6 종목. 중복 제거·정렬. */
  progressionIds: ProgressionId[];
  note?: string;
}

/** 프로그램 설명을 카탈로그에서 파생 계산한다 (FR-2.3). */
export function describeProgram(catalog: Catalog, programId: string): ProgramDescription {
  const program = getProgram(catalog, programId);

  let trainingDays = 0;
  const ids = new Set<ProgressionId>();

  for (const weekday of WEEKDAYS) {
    const entries = program.schedule[weekday] ?? [];
    if (entries.length > 0) trainingDays += 1;
    for (const [label] of entries) {
      const id = LABEL_TO_ID[label];
      // 빅6 매핑에 없는 라벨은 건너뛴다. planDay 와 같은 판정을 쓴다 (FR-12.3).
      if (id === undefined) continue;
      ids.add(id);
    }
  }

  const description: ProgramDescription = {
    id: program.id,
    name: program.name,
    frequency: program.frequency,
    trainingDays,
    restDays: WEEKDAYS.length - trainingDays,
    progressionIds: [...ids].sort(),
  };
  if (program.note !== undefined) description.note = program.note;
  return description;
}

/** 5종 전부를 카탈로그 순서대로 설명한다 (FR-2.2 / FR-2.3). */
export function describePrograms(catalog: Catalog): ProgramDescription[] {
  return catalog.programs.map((p) => describeProgram(catalog, p.id));
}

/** 그 요일이 이 프로그램의 운동일인지. */
function isTrainingWeekday(
  schedule: Record<Weekday, [string, string][]>, weekday: Weekday,
): boolean {
  return (schedule[weekday] ?? []).length > 0;
}

/**
 * `from` 부터 최대 7일을 전방 탐색해 첫 운동일을 찾는다 (FR-2.6).
 * `from` 자신이 운동일이면 `from` 을 그대로 돌려준다.
 * 5종 전부가 주 2~6일 운동이므로 실제로는 예외에 도달하지 않는다. 방어적 확인이다.
 */
export function firstTrainingDay(
  catalog: Catalog, programId: string, from: IsoDate,
): IsoDate {
  const program = getProgram(catalog, programId);
  for (let i = 0; i < WEEKDAYS.length; i += 1) {
    const date = addDays(from, i);
    if (isTrainingWeekday(program.schedule, weekdayOf(date))) return date;
  }
  throw new Error(`${programId} 의 요일표에 운동일이 없다: ${from} 부터 7일 안에 찾지 못했다`);
}

/**
 * 프로그램 구간을 새로 시작한다. `selectProgram` / `switchProgram` 이 공유하는 유일한 구현이다.
 * 활성 구간이 있으면 `onDate` 로 마감하고 새 구간을 push 한다.
 * `steps` 와 `history` 는 손대지 않는다 (FR-3.5). 인자 `state` 를 변형하지 않는다 (NFR-2).
 */
function beginStint(
  state: AppState, catalog: Catalog, programId: string, onDate: IsoDate,
): AppState {
  // 알 수 없는 프로그램이면 여기서 예외가 전파된다. 조용히 넘어가지 않는다.
  getProgram(catalog, programId);

  const stints = state.stints.map((s) =>
    (s.endedAt === null ? { ...s, endedAt: onDate } : s));

  stints.push({
    programId,
    selectedAt: onDate,
    startedAt: firstTrainingDay(catalog, programId, onDate),
    endedAt: null,
  });

  return { ...state, stints };
}

/** 프로그램을 선택한다 (FR-2.1 / FR-2.4). */
export function selectProgram(
  state: AppState, catalog: Catalog, programId: string, onDate: IsoDate,
): AppState {
  return beginStint(state, catalog, programId, onDate);
}

/**
 * 프로그램을 전환한다 (FR-3.1 ~ FR-3.3).
 * 동작은 `selectProgram` 과 완전히 같다. 같은 프로그램으로 전환해도 새 구간이며,
 * 되돌아온 프로그램의 이어가기는 없다 (FR-3.3). 이름이 둘인 것은 호출자 의도 표현용이다.
 */
export function switchProgram(
  state: AppState, catalog: Catalog, programId: string, onDate: IsoDate,
): AppState {
  return beginStint(state, catalog, programId, onDate);
}

/**
 * 활성 구간에서 실제로 수행할 종목이 있는 다음 날짜 (FR-17.4 / EC-43 / ADR-19).
 *
 * 기존 `firstTrainingDay(catalog, programId, from)` 는 요일표만 보므로
 * 잠긴 종목만 있는 날을 "다음 운동일" 로 가리킬 수 있다. 이 함수는 그 오류를
 * 피하기 위해 `state` 를 받아 실제로 수행할 종목이 있는지 확인한다.
 *
 * `from` 자신도 후보다. 활성 구간이 없으면 null. 7일 안에 못 찾으면 null
 * (예외 아님, FR-17.4a / EC-43).
 *
 * `planDay` 는 잠긴 종목을 `exercises` 가 아니라 `locked` 에 넣으므로,
 * `exercises.length === 0` 인 날은 실제로 수행할 것이 없는 날이다.
 *
 * **기존 `firstTrainingDay` 는 건드리지 않는다** (ADR-19) — 프로그램 선택 화면의
 * "다음 첫 운동일이 1일차" 안내는 아직 선택 안 한 프로그램에 대한 것이므로
 * 잠금과 무관하다.
 */
export function nextDoableTrainingDay(
  state: AppState, catalog: Catalog, from: IsoDate,
): IsoDate | null {
  const stint = currentStint(state);
  if (stint === null) return null;
  for (let i = 0; i < WEEKDAYS.length; i += 1) {
    const date = addDays(from, i);
    const plan = planDay(state, catalog, stint.programId, weekdayOf(date));
    if (plan.exercises.length > 0) return date;
  }
  return null;
}

/** 진행 중인 구간. 없으면 null (프로그램 미선택 또는 전부 마감). */
export function currentStint(state: AppState): ProgramStint | null {
  const last = state.stints[state.stints.length - 1];
  return last !== undefined && last.endedAt === null ? last : null;
}

/**
 * `date` 가 속한 구간 (ADR-2).
 * 판정은 반개구간 `selectedAt <= date && (endedAt === null || date < endedAt)` 이다.
 * 전환일에는 새 구간이 우선한다 (FR-3.2). 뒤에서부터 스캔하므로 자연히 그렇게 된다.
 * 하한이 `startedAt` 이 아니라 `selectedAt` 인 것은 선택일과 첫 운동일 사이의
 * 휴식일도 그 구간에 속하기 때문이다 (FR-5.4, EC-10).
 */
export function stintAt(state: AppState, date: IsoDate): ProgramStint | null {
  for (let i = state.stints.length - 1; i >= 0; i -= 1) {
    const s = state.stints[i];
    if (diffDays(s.selectedAt, date) < 0) continue;
    if (s.endedAt === null || diffDays(date, s.endedAt) > 0) return s;
  }
  return null;
}

/**
 * 구간의 며칠차 (FR-2.7).
 * `startedAt` 당일이 1일차이고, 그 이전 날짜는 전부 0 이다 (FR-5.4, EC-10).
 * 달력 일수 기준이며 수행 기록을 보지 않는다 (A-3, EC-8).
 */
export function dayNumber(stint: ProgramStint, date: IsoDate): number {
  const n = diffDays(stint.startedAt, date) + 1;
  return n < 0 ? 0 : n;
}

/** `date` 가 속한 구간 기준 며칠차. 구간이 없으면 0 이다. */
export function dayNumberOn(state: AppState, date: IsoDate): number {
  const stint = stintAt(state, date);
  return stint === null ? 0 : dayNumber(stint, date);
}
