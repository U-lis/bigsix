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

/** `addDays` normalizes overflow, so an impossible date such as 02-30 does not survive it. */
function isValidDate(date: string): boolean {
  return ISO_DATE.test(date) && addDays(date, 0) === date;
}

/** No sort: judging follows array order, so reordering other records would change it. */
function insertionIndex(rest: SessionRecord[], toDate: IsoDate): number {
  for (let k = rest.length - 1; k >= 0; k -= 1) {
    if (rest[k].date <= toDate) return k + 1;
  }
  return 0;
}

/**
 * Moves one saved record to another date without changing judging (FR-2, FR-3, FR-4).
 *
 * Judging reads `history` by array order from each progression's anchor (`progress.ts`,
 * `proposal.ts`), and anchors are history indices. A move that changes a progression's judged
 * order or scope is therefore rejected, and anchors the move shifted are corrected.
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
  // An anchor at `lo` keeps its record set; one at `hi + 1` does too. Only those between shift.
  const crossed = (anchor: number) => lo < anchor && anchor <= hi;

  // Free records are never judged, so they neither block nor get blocked.
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

  // Absent stays absent: a state that never adjusted keeps the shape it had before the field.
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
