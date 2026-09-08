import { dateRange, weekdayOf } from './date.ts';
import { dayNumber, stintAt } from './program.ts';
import { activeProposal } from './proposal.ts';
import { planDay } from './schedule.ts';
import type {
  AppState, Catalog, DayAgenda, DayReview, IsoDate, ProgressionId, SessionRecord,
} from './types.ts';

/**
 * 날짜 기반 계획 진입점 (FR-6.1, FR-6.2).
 *
 * 요일은 `weekdayOf` 로 도출하고 계획 산출 자체는 `planDay` 에 위임한다 (ADR-1).
 * `planDay` 의 시그니처와 본문은 건드리지 않는다.
 *
 * 프로그램 미선택(또는 전 구간 마감) 상태에서는 **예외를 던지지 않고**
 * `{ kind: 'no-program' }` 을 돌려준다 (FR-2.5, EC-1).
 * 호출자는 `kind` 로 분기한다.
 *
 * `proposal` 은 `activeProposal` 로 **읽기만 한다** (ADR-6, FR-4.6a).
 * 제안 생성은 `advanceProposals` 담당이며 이 함수는 상태를 만들지 않는다 (NFR-2).
 *
 * 며칠차 0 인 날(구간 시작 이전)에도 계획을 정상적으로 만든다 (EC-10).
 * 그 날들은 루틴상 휴식일이므로 `planDay` 가 자연히 `rest: true` 를 돌려준다.
 */
export function planOn(state: AppState, catalog: Catalog, date: IsoDate): DayAgenda {
  const stint = stintAt(state, date);
  if (stint === null) return { kind: 'no-program', date };

  const weekday = weekdayOf(date);
  const plan = planDay(state, catalog, stint.programId, weekday);

  return {
    kind: 'plan',
    date,
    weekday,
    programId: stint.programId,
    dayNumber: dayNumber(stint, date),
    rest: plan.rest,
    exercises: plan.exercises,
    locked: plan.locked,
    proposal: activeProposal(state),
  };
}

/** 활성 구간이 없는 날의 조회 결과. 계획이 없으므로 휴식일이다. */
function noStintReview(date: IsoDate): DayReview {
  return {
    date,
    programId: null,
    dayNumber: 0,
    status: 'rest',
    planned: [],
    plannedExercises: [],
    performed: [],
  };
}

/**
 * 하루의 계획 대비 수행 결과 (FR-5.1, FR-5.3).
 *
 * 미수행일을 저장하지 않는다. **계획 − 기록의 차집합으로 그 자리에서 유도한다** (ADR-4).
 * 상태를 변경하지 않는 순수 함수다 (FR-5.5, NFR-2).
 *
 * 판정 근거는 `planned` 뿐이다.
 * - 잠긴 종목은 `planned` 에서 뺀다 (ADR-4 부수 결정 a). 사용자가 할 수 없는 것을
 *   안 했다고 표시하지 않기 위해서다. `good_behavior` 금요일처럼 계획 종목이 전부
 *   잠긴 날은 `planned` 가 비어 `rest` 가 된다.
 * - 보조 운동(악력·종아리·목)은 0.2.0 에서 도메인 출력에서 전부 제거됐다 (FR-12).
 *   0.1.0 은 `accessories` 참고 필드로 남겨 두었는데, 기록할 수단이 없으면서 화면에는
 *   보이는 모순이 있었다. 필드를 없애 모순을 없앴다. 책의 원래 스케줄은
 *   `progressions.json` 에 그대로 있다.
 *
 * "수행" 판정은 그날 그 종목의 기록이 있는지만 본다. `kind` 와 `outcome` 을 보지 않는다 —
 * 포기한 세션도 다지기 세션도 그날 그 종목을 했다는 사실이다.
 *
 * 주의 — `plannedExercises` 는 **조회 시점의 `state.steps` 로 재계산한 값**이지
 * 그날 당시의 목표가 아니다. `planDay` → `planExercise` 가 현재 단계로 목표를 계산하기
 * 때문이다. 그날 이후 단계가 오르내렸다면 수치가 다르다. 과거 시점 목표의 복원은
 * 계획 스냅샷 저장을 요구하므로 이번 범위에서 지원하지 않는다.
 * `performed` 의 `step` 은 실제 기록값이라 정확하다.
 */
export function reviewDay(state: AppState, catalog: Catalog, date: IsoDate): DayReview {
  const stint = stintAt(state, date);
  if (stint === null) return noStintReview(date);

  const plan = planDay(state, catalog, stint.programId, weekdayOf(date));
  const planned: ProgressionId[] = plan.exercises.map((e) => e.progressionId);
  const performed: SessionRecord[] = state.history.filter((r) => r.date === date);

  const doneCount = planned
    .filter((id) => performed.some((r) => r.progressionId === id)).length;

  let status: DayReview['status'];
  if (planned.length === 0) status = 'rest';
  else if (doneCount === 0) status = 'missed';
  else if (doneCount < planned.length) status = 'partial';
  else status = 'done';

  return {
    date,
    programId: stint.programId,
    dayNumber: dayNumber(stint, date),
    status,
    planned,
    plannedExercises: plan.exercises,
    performed,
  };
}

/**
 * 기간 조회 (FR-5.2). 양끝을 포함하며 `from > to` 면 빈 배열이다.
 *
 * 길이 상한을 두지 않는다 (FR-3.6 취지). 1년치를 요청하면 365개를 돌려준다.
 *
 * 며칠을 건너뛰어도 그 날짜들이 결과에서 사라지지 않는다 (EC-8) —
 * 계획이 있었고 기록이 없는 날은 `missed` 로 남고, 며칠차는 달력 기준으로 계속 증가한다.
 */
export function reviewRange(
  state: AppState, catalog: Catalog, from: IsoDate, to: IsoDate,
): DayReview[] {
  return dateRange(from, to).map((d) => reviewDay(state, catalog, d));
}
