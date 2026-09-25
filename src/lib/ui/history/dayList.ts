/**
 * 날짜별 목록 계산 (FR-24.2~6 / EC-58 / EC-66).
 *
 * 창(`DateWindow`)을 받아 그 안 각 날짜에 대해 `reviewDay` 를 부르고,
 * 그 날짜에 새 구간이 시작(`stint.startedAt`) 됐거나 전환 제안이 승인(`resolvedAt`)
 * 됐는지를 함께 확인해 한 줄짜리 `DayRow` 를 만든다.
 *
 * 순서는 **최근 날짜부터**. `reviewDay` 는 상태를 바꾸지 않는 순수 함수이므로
 * 룬 없이 안전하다.
 */

import { dateRange, reviewDay, weekdayOf } from '$lib/domain';
import type {
  AppState, Catalog, DayReview, ProgramStint, SessionRecord, SwitchProposal, Weekday,
} from '$lib/domain/types';
import type { DateWindow } from './range';

/** 그날의 사실을 화면 한 줄에 담기 위한 조합. */
export interface DayRow {
  review: DayReview;
  weekday: Weekday;
  /**
   * 그날 새로 시작된 구간. 없으면 null. FR-24.5 「새 루틴 시작」 문구용.
   * `startedAt` 은 프로그램의 첫 운동일이므로 대개 며칠차 1 인 날이다.
   */
  stintStartedOn: ProgramStint | null;
  /**
   * 그날 승인된 전환 제안. 없으면 null. FR-24.5 「루틴 갈아탐」 문구용.
   * 승인일(`resolvedAt`) 기준이다 — 제안 생성일이 아니다.
   */
  proposalAcceptedOn: SwitchProposal | null;
}

/**
 * 창 안 날짜에 대한 `DayRow[]`. 최근 날짜가 배열 앞에 온다.
 *
 * `reviewDay` 를 창 안 각 날마다 호출한다 (NFR-24 는 「30일 단위로만 부른다」이므로 문제 없음).
 * memoization 은 두지 않는다 (RISK-3, YAGNI) — 실측 후 필요하면 넣는다.
 */
export function buildDayRows(
  state: AppState,
  catalog: Catalog,
  window: DateWindow,
): DayRow[] {
  const days = dateRange(window.from, window.to);
  const rows: DayRow[] = [];
  for (const date of days) {
    const review = withNoStintPerformed(reviewDay(state, catalog, date), state, date);
    const stintStartedOn = state.stints.find((s) => s.startedAt === date) ?? null;
    const proposalAcceptedOn = state.proposals.find(
      (p) => p.status === 'accepted' && p.resolvedAt === date,
    ) ?? null;
    rows.push({
      review,
      weekday: weekdayOf(date),
      stintStartedOn,
      proposalAcceptedOn,
    });
  }
  // 최근 날짜부터. `dateRange` 는 오름차순이므로 뒤집는다.
  rows.reverse();
  return rows;
}

/**
 * 프로그램 미선택 기간의 자유 운동 기록을 `review.performed` 에 보탠다 (EC-66).
 *
 * `reviewDay` 는 stint 가 없는 날에 `noStintReview` 를 돌려주는데 그 결과의
 * `performed` 는 빈 배열이다 — 계획이 없으니 「수행」판정에는 문제가 없다.
 * 다만 화면 목록은 자유 운동 기록도 보여야 하므로 (SPEC EC-66) 여기서 채워 넣는다.
 * status 판정은 그대로 두어 rest 로 남는다.
 */
function withNoStintPerformed(
  review: DayReview, state: AppState, date: string,
): DayReview {
  if (review.programId !== null) return review;
  if (review.performed.length > 0) return review;
  const onDate: SessionRecord[] = state.history.filter((r) => r.date === date);
  if (onDate.length === 0) return review;
  return { ...review, performed: onDate };
}
