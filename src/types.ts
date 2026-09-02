/** 빅6 종목 식별자. */
export type ProgressionId =
  | 'pushup' | 'squat' | 'pullup' | 'legraise' | 'bridge' | 'hspu';

/** 빅4 — 브리지·핸드스탠드의 선행 조건이 되는 네 종목. */
export const BIG_FOUR: readonly ProgressionId[] =
  ['pushup', 'squat', 'pullup', 'legraise'] as const;

/** reps = 횟수, seconds = 유지 시간(핸드스탠드 1~3단계). */
export type Unit = 'reps' | 'seconds';

/** 기준 하나. value 가 배열이면 범위(브리지 마스터 10~30회). */
export interface Standard {
  sets: number;
  value: number | [number, number];
}

export type StandardLabel = 'beginner' | 'intermediate' | 'progression' | 'elite';

export interface Step {
  n: number;
  name: { en: string; ko: string };
  unit: Unit;
  page: number;
  /** 기준 횟수가 한쪽 팔/다리 기준인지. */
  perSide?: boolean;
  /** 이 단계를 할 때 항상 함께 수행할 같은 종목의 다른 단계. */
  pairWith?: number;
  beginner: Standard;
  intermediate: Standard;
  /** 1~9단계. */
  progression?: Standard;
  /** 10단계(마스터)에서 progression 을 대신한다. */
  elite?: Standard;
  summary: string[];
  note?: string;
  conflict?: string;
}

export interface Progression {
  id: ProgressionId;
  name: { en: string; ko: string };
  /** null 이 아니면 잠금 대상. 사람이 읽는 설명이고, 실제 판정은 gate.ts 가 한다. */
  requires: string | null;
  steps: Step[];
}

export type Weekday = '월' | '화' | '수' | '목' | '금' | '토' | '일';
export const WEEKDAYS: readonly Weekday[] = ['월','화','수','목','금','토','일'] as const;

export interface Program {
  id: string;
  name: { en: string; ko: string };
  frequency: string;
  /** 요일 → [종목 한국어명, 세트 표기] 목록. 빈 배열이면 휴식일. */
  schedule: Record<Weekday, [string, string][]>;
  note?: string;
}

export interface Catalog {
  progressions: Progression[];
  programs: Program[];
}

/** 한 번의 운동 기록. */
export interface SessionRecord {
  date: string;
  progressionId: ProgressionId;
  /** 훈련 중인 단계. 다지기 기록도 이 값은 그대로 둔다. */
  step: number;
  /** 실제로 수행한 단계. 다지기면 step - 1. 생략하면 step 과 같다. */
  performedStep?: number;
  /** 세트별 실제 수행값(횟수 또는 초). */
  sets: number[];
  /** 주관적 운동 강도 1~10. 선택 입력. */
  rpe?: number;
  /** work = 정규 세션, consolidation = 이전 단계를 다지는 세션. */
  kind: 'work' | 'consolidation';
  /** abandoned = 사용자가 도중에 '불가능' 을 눌러 중단한 도전. */
  outcome?: 'completed' | 'abandoned';
}

export interface AppState {
  /** 종목별 현재 훈련 중인 단계(1~10). */
  steps: Record<ProgressionId, number>;
  /** 시간순. 가장 최근이 마지막. */
  history: SessionRecord[];
}

export type SetMode = 'fixed' | 'max';

export interface TargetSet {
  /** 목표값(횟수 또는 초). */
  target: number;
  /** fixed = 이 수치만큼만, max = 이 수치를 상한으로 최대한. */
  mode: SetMode;
}

export interface PlannedExercise {
  progressionId: ProgressionId;
  /** 훈련 중인 단계. */
  step: number;
  /** 실제로 수행할 단계. 다지기면 step - 1. */
  performedStep: number;
  stepName: { en: string; ko: string };
  unit: Unit;
  perSide: boolean;
  warmup: TargetSet[];
  work: TargetSet[];
  /** 이번 세션이 겨냥하는 기준. */
  goal: { label: StandardLabel; sets: number; value: number };
  kind: 'work' | 'consolidation';
  /** 이 목표가 나온 근거. 사실만 적는다. */
  reason: string;
  /** pairWith 로 붙는 동반 단계(핸드스탠드 2단계 → 1단계). */
  paired?: PlannedExercise;
}

/** 빅6에 없지만 프로그램 표에 등장하는 보조 운동(악력·종아리·목). */
export interface AccessoryItem {
  name: string;
  prescription: string;
}

export interface DayPlan {
  weekday: Weekday;
  rest: boolean;
  exercises: PlannedExercise[];
  accessories: AccessoryItem[];
  /** 선행 조건 미달로 빠진 종목. */
  locked: { progressionId: ProgressionId; reason: string }[];
}
