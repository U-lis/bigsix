import { checkGate } from './gate.ts';
import { planExercise, withPair } from './plan.ts';
import type {
  AccessoryItem, AppState, Catalog, DayPlan, PlannedExercise, Program, ProgressionId, Weekday,
} from './types.ts';

/** 프로그램 표의 한국어 종목명 → 종목 id. 여기에 없으면 보조 운동으로 분류한다. */
export const LABEL_TO_ID: Record<string, ProgressionId> = {
  '푸시업': 'pushup',
  '스쿼트': 'squat',
  '풀업': 'pullup',
  '레그 레이즈': 'legraise',
  '브리지': 'bridge',
  '핸드스탠드 푸시업': 'hspu',
};

export function getProgram(catalog: Catalog, id: string): Program {
  const p = catalog.programs.find((x) => x.id === id);
  if (!p) throw new Error(`알 수 없는 프로그램: ${id}`);
  return p;
}

export function listPrograms(catalog: Catalog): Program[] {
  return catalog.programs;
}

/** 하루치 계획. 프로그램이 정한 종목 목록에 현재 단계별 목표를 채워 넣는다. */
export function planDay(
  state: AppState, catalog: Catalog, programId: string, weekday: Weekday,
): DayPlan {
  const program = getProgram(catalog, programId);
  const entries = program.schedule[weekday] ?? [];

  const exercises: PlannedExercise[] = [];
  const accessories: AccessoryItem[] = [];
  const locked: DayPlan['locked'] = [];

  for (const [label, prescription] of entries) {
    const id = LABEL_TO_ID[label];
    if (id === undefined) {
      accessories.push({ name: label, prescription });
      continue;
    }
    const gate = checkGate(state, catalog, id);
    if (!gate.unlocked) {
      locked.push({ progressionId: id, reason: gate.reason });
      continue;
    }
    exercises.push(withPair(planExercise(state, catalog, id), state, catalog));
  }

  return {
    weekday,
    rest: entries.length === 0,
    exercises,
    accessories,
    locked,
  };
}

/** 한 주 전체. */
export function planWeek(
  state: AppState, catalog: Catalog, programId: string,
): DayPlan[] {
  const program = getProgram(catalog, programId);
  return (Object.keys(program.schedule) as Weekday[])
    .map((d) => planDay(state, catalog, programId, d));
}
