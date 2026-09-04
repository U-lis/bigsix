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

/**
 * 'YYYY-MM-DD' 형식의 날짜 문자열. 로컬 달력 날짜를 뜻한다 (A-5).
 * 시각·타임존 정보를 담지 않는다.
 */
export type IsoDate = string;

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

/** 한 번의 운동 기록으로 사용자·UI 가 제출하는 입력. 파생 필드가 없다. */
export interface SessionInput {
  date: IsoDate;
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

/** history 에 저장되는 기록. 입력에 엔진이 계산한 파생 필드가 붙는다. */
export interface SessionRecord extends SessionInput {
  /**
   * 이 세션 결과로 올라간 단계. 승급하지 않았으면 undefined (FR-8).
   * 엔진(`applySession`)만 채운다. 호출자가 직접 채우지 않는다.
   */
  promotedTo?: number;
  /**
   * 기준은 충족했으나 승급이 막힌 사유 (EC-11 증거).
   * rpe = RPE 거부권으로 보류, master = 10단계라 더 올라갈 곳이 없음.
   * 엔진(`applySession`)만 채운다. 호출자가 직접 채우지 않는다.
   */
  blockedBy?: 'rpe' | 'master';
}

/**
 * 한 프로그램을 연속으로 수행한 구간.
 * 불변식: 구간끼리 서로 겹치지 않는다 (A-4).
 * `endedAt === null` 이면 진행 중이며, 그런 구간은 배열 마지막에 최대 1개다.
 */
export interface ProgramStint {
  programId: string;
  /** 사용자가 프로그램을 고른 날. */
  selectedAt: IsoDate;
  /** 그 루틴의 첫 운동일 = 1일차 (FR-2.6). */
  startedAt: IsoDate;
  /** 진행 중이면 null. */
  endedAt: IsoDate | null;
}

/**
 * 자동 전환 제안 1건. 생성·승인·거절 이력을 한 레코드로 담는다.
 * 불변식: `proposedAt` 은 항상 월요일이다 (FR-4.6).
 * 불변식: `status === 'pending'` 인 레코드는 **구간(`fromProgramId`) 당** 최대 1개다 (FR-4.6b).
 * 전역으로 1개가 아니다 — 미결 상태에서 수동 전환하면 이전 구간의 고아 pending 이
 * 삭제되지 않고 남으므로, 서로 다른 `fromProgramId` 의 pending 이 동시에 존재할 수 있다 (W-3 (a)).
 */
export interface SwitchProposal {
  proposedAt: IsoDate;
  fromProgramId: string;
  toProgramId: string;
  status: 'pending' | 'accepted' | 'declined';
  /** 승인·거절된 날. pending 이면 null. */
  resolvedAt: IsoDate | null;
}

export interface AppState {
  /** 종목별 현재 훈련 중인 단계(1~10). */
  steps: Record<ProgressionId, number>;
  /** 시간순. 가장 최근이 마지막. */
  history: SessionRecord[];
  /**
   * 프로그램 수행 구간. 시간순.
   * 마지막 원소의 `endedAt === null` 이면 그 구간이 활성이다.
   * 빈 배열은 프로그램 미선택 상태를 뜻한다.
   */
  stints: ProgramStint[];
  /** 자동 전환 제안 이력. 시간순. */
  proposals: SwitchProposal[];
  /**
   * 수동 단계 조정 시점의 스냅샷 (FR-13.3).
   *
   * 값은 조정 직후의 `history.length` 다. 조정된 적 없는 종목은 키가 없다.
   * 이 인덱스 **이상**인 세션만 승급·유지 판정의 대상이 된다.
   *
   * 조정은 `history` 에 아무것도 남기지 않으므로(FR-13.4) 승급 기록(`promotedTo`)이
   * 생기지 않는다. 앵커가 없으면 조정 전 세션이 유지 횟수에 섞여 전환 제안이 잘못
   * 뜬다 — 그것을 막는 것이 이 필드의 존재 이유다.
   *
   * 선택 필드인 이유는 이 필드가 없던 시절에 저장된 상태를 읽을 수 있어야 하기
   * 때문이다. 없으면 "조정한 적 없음" 과 같다.
   */
  adjustedAtSessionIndex?: Partial<Record<ProgressionId, number>>;
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
  /**
   * perSide 단계에서만 채운다.
   * 표시용 사실 문구이며 계산에 관여하지 않는다 (FR-1.5).
   */
  sideNote?: string;
  /** pairWith 로 붙는 동반 단계(핸드스탠드 2단계 → 1단계). */
  paired?: PlannedExercise;
}

export interface DayPlan {
  weekday: Weekday;
  rest: boolean;
  exercises: PlannedExercise[];
  /** 선행 조건 미달로 빠진 종목. */
  locked: { progressionId: ProgressionId; reason: string }[];
}

/**
 * 특정 날짜의 할 일. 프로그램 미선택 상태에서 예외를 던지지 않기 위한 판별 유니온이다.
 * 호출자는 `kind` 로 분기한다 (FR-2.5).
 */
export type DayAgenda =
  | { kind: 'no-program'; date: IsoDate }
  | {
      kind: 'plan';
      date: IsoDate;
      weekday: Weekday;
      programId: string;
      /** 활성 구간의 `startedAt` 기준 며칠차 (FR-2.7 / FR-5.4). */
      dayNumber: number;
      rest: boolean;
      exercises: PlannedExercise[];
      /** 선행 조건 미달로 빠진 종목. */
      locked: { progressionId: ProgressionId; reason: string }[];
      /** 미결 전환 제안. 없으면 null (FR-4.6a). */
      proposal: SwitchProposal | null;
    };

/** 지나간 하루의 계획 대비 수행 결과 (FR-5.1 / FR-5.3). */
export interface DayReview {
  date: IsoDate;
  /** 그날 활성 구간의 프로그램. 구간이 없으면 null. */
  programId: string | null;
  /** 활성 구간이 없거나 `startedAt` 이전이면 0. */
  dayNumber: number;
  status: 'rest' | 'done' | 'partial' | 'missed';

  /** 그날 계획된 빅6(잠긴 종목 제외). status 판정의 유일한 근거다. */
  planned: ProgressionId[];

  /**
   * 그날 계획된 빅6 의 목표 수치.
   * 주의 — 이 값은 **조회 시점의 `state.steps` 로 재계산한 값**이지
   * 그날 당시의 목표가 아니다. 그날 이후 단계가 오르내렸다면 수치가 다르다.
   * 과거 시점 목표의 정확한 복원은 이번 범위에서 지원하지 않는다.
   */
  plannedExercises: PlannedExercise[];

  /** 그날의 history 기록. */
  performed: SessionRecord[];
}
