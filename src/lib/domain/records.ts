import { addDays } from './date.ts';
import type { AppState, IsoDate, ProgressionId, SessionRecord } from './types.ts';

export type MoveRecordRejection =
  | 'invalid-index'
  | 'invalid-date'
  | 'future'
  | 'same-date'
  | 'crosses-same-progression'
  | 'crosses-adjustment';

export type MoveRecordResult =
  | { ok: true; state: AppState }
  | { ok: false; reason: MoveRecordRejection };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `addDays` 는 넘친 날짜를 정규화하므로 02-30 같은 없는 날짜는 입력과 같아지지 않는다. */
function isValidDate(date: string): boolean {
  return ISO_DATE.test(date) && addDays(date, 0) === date;
}

/** 정렬하지 않는다. 판정이 배열 순서를 따르므로 다른 기록을 재배열하면 판정이 바뀐다. */
function insertionIndex(rest: SessionRecord[], toDate: IsoDate): number {
  for (let k = rest.length - 1; k >= 0; k -= 1) {
    if (rest[k].date <= toDate) return k + 1;
  }
  return 0;
}

/**
 * 저장된 기록 하나를 판정을 바꾸지 않고 다른 날짜로 옮긴다 (FR-2, FR-3, FR-4).
 *
 * 판정은 종목별 앵커부터 `history` 를 배열 순서로 읽고 (`progress.ts`, `proposal.ts`),
 * 앵커는 `history` 인덱스다. 그래서 종목의 판정 순서나 범위를 바꾸는 이동은 거부하고,
 * 이동으로 밀린 앵커는 보정한다.
 */
export function moveRecordDate(
  state: AppState, recordIndex: number, toDate: IsoDate, today: IsoDate,
): MoveRecordResult {
  const { history } = state;
  if (!Number.isInteger(recordIndex) || recordIndex < 0 || recordIndex >= history.length) {
    return { ok: false, reason: 'invalid-index' };
  }
  if (!isValidDate(toDate)) return { ok: false, reason: 'invalid-date' };
  if (toDate > today) return { ok: false, reason: 'future' };

  const moved = history[recordIndex];
  if (toDate === moved.date) return { ok: false, reason: 'same-date' };

  const rest = history.filter((_, k) => k !== recordIndex);
  const target = insertionIndex(rest, toDate);
  const lo = Math.min(recordIndex, target);
  const hi = Math.max(recordIndex, target);
  // `lo` 와 `hi + 1` 의 앵커는 범위 안 기록 집합이 그대로다. 그 사이의 앵커만 밀린다.
  const crossed = (anchor: number) => lo < anchor && anchor <= hi;

  // 자유 운동은 판정에 쓰이지 않으므로 다른 기록을 막지 않고 막히지도 않는다.
  if (moved.kind !== 'free') {
    const passesSameProgression = history.some((r, k) => (
      k !== recordIndex && lo <= k && k <= hi
      && r.kind !== 'free' && r.progressionId === moved.progressionId
    ));
    if (passesSameProgression) return { ok: false, reason: 'crosses-same-progression' };

    const ownAnchor = state.adjustedAtSessionIndex?.[moved.progressionId];
    if (ownAnchor !== undefined && crossed(ownAnchor)) {
      return { ok: false, reason: 'crosses-adjustment' };
    }
  }

  rest.splice(target, 0, { ...moved, date: toDate });
  const next: AppState = { ...state, history: rest };

  // 없으면 없는 채로 둔다. 단계를 조정한 적 없는 상태의 모양을 바꾸지 않는다.
  if (state.adjustedAtSessionIndex !== undefined) {
    const anchors = { ...state.adjustedAtSessionIndex };
    const delta = recordIndex < target ? -1 : 1;
    for (const id of Object.keys(anchors) as ProgressionId[]) {
      const anchor = anchors[id];
      if (anchor !== undefined && crossed(anchor)) anchors[id] = anchor + delta;
    }
    next.adjustedAtSessionIndex = anchors;
  }
  return { ok: true, state: next };
}
