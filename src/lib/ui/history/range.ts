/**
 * 기록 탭 표시 범위와 30일 페이지 창 (FR-24.1 / NFR-24).
 *
 * 룬 없는 순수 함수만. `localStorage` 나 브라우저 상태에 닿지 않는다.
 *
 * 범위(`historyRange`)의 시작일은 **첫 구간 `selectedAt`** 과 **첫 기록 `date`** 중
 * 이른 쪽. 둘 다 없으면 표시할 것이 없다 → null.
 *
 * 30일 창(`windowsBack`)은 최신부터 과거로 세는 창 목록이다. 첫 창은
 * `[to - 29, to]` 이고 다음 창은 `[to - 59, to - 30]` — 30일 페이지네이션 (FR-24.7).
 * 마지막 창은 `from` 을 포함하고 그 이전으로 넘어가지 않는다.
 */

import { addDays, diffDays } from '$lib/domain';
import type { AppState, IsoDate } from '$lib/domain/types';

export interface HistoryRange {
  /** 표시 범위의 시작일 (이른 날). */
  from: IsoDate;
  /** 표시 범위의 끝. `todayClock.today` 를 그대로 받는다. */
  to: IsoDate;
}

export interface DateWindow {
  from: IsoDate;
  to: IsoDate;
}

/**
 * 기록 탭이 그릴 날짜 범위 (FR-24.1).
 *
 * `from` 은 첫 stint 의 `selectedAt` 과 첫 record 의 `date` 중 이른 쪽이다.
 * 둘 다 비어 있으면 null — 화면은 「아직 기록이 없습니다」 로 처리한다 (FR-23.3).
 *
 * `to` 는 오늘. 프로그램 미선택 기간의 자유 운동 기록도 이 범위에 든다 (EC-66) —
 * 구간이 없어도 `history` 에 date 가 있으면 그 날짜를 채택한다.
 */
export function historyRange(state: AppState, today: IsoDate): HistoryRange | null {
  const firstStintDate = state.stints.length > 0 ? state.stints[0].selectedAt : null;
  const firstRecordDate = state.history.length > 0 ? state.history[0].date : null;

  if (firstStintDate === null && firstRecordDate === null) return null;

  const candidates: IsoDate[] = [];
  if (firstStintDate !== null) candidates.push(firstStintDate);
  if (firstRecordDate !== null) candidates.push(firstRecordDate);
  // `IsoDate` 는 'YYYY-MM-DD' 라 문자열 사전순이 곧 시간순이다 (도메인 규약 A-5).
  const from = candidates.reduce((a, b) => (a < b ? a : b));
  return { from, to: today };
}

/**
 * 최신부터 과거로 세는 30일 창 목록 (FR-24.7).
 *
 * 각 창은 `[from, to]` 로 양끝 포함이다. 창끼리 겹치지 않고 사이도 비지 않는다.
 * 마지막 창은 `range.from` 을 포함하며 그 이전으로 넘어가지 않는다.
 *
 * `range` 가 비어 있으면(음의 폭) 빈 배열이다. 안전을 위해 `chunkDays >= 1` 을 가정한다.
 */
export function windowsBack(
  range: HistoryRange,
  chunkDays: number = 30,
): DateWindow[] {
  const totalDays = diffDays(range.from, range.to);
  if (totalDays < 0) return [];

  const out: DateWindow[] = [];
  let winTo = range.to;
  while (true) {
    // 이 창의 이론적 from — `range.from` 보다 이르지 않도록 클램프.
    const rawFrom = addDays(winTo, -(chunkDays - 1));
    const winFrom = rawFrom < range.from ? range.from : rawFrom;
    out.push({ from: winFrom, to: winTo });
    if (winFrom === range.from) break;
    winTo = addDays(winFrom, -1);
  }
  return out;
}
