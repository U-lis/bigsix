import type { MoveRecordRejection, MoveRecordResult } from '$lib/domain';
import type { IsoDate, ProgressionId } from '$lib/domain/types';
import type { SessionDraft } from '$lib/ui/state/storage';

export type RecordMoveError = MoveRecordRejection | 'open-draft';
export type RecordMoveResult = MoveRecordResult | { ok: false; reason: 'open-draft' };

/**
 * 오늘 자 기록이 생기면 `syncDoneDrafts` 가 그 종목의 열린 칸을 자유 운동으로 넘겨,
 * 입력한 세트가 승급 판정에서 조용히 빠진다. 세트가 없는 칸은 잃을 것이 없어 막지 않는다.
 */
export function openDraftBlocksMove(
  drafts: Record<string, SessionDraft>,
  progressionId: ProgressionId,
  toDate: IsoDate,
  today: IsoDate,
): boolean {
  if (toDate !== today) return false;
  return Object.values(drafts).some((d) => (
    d.kind !== 'free' && d.progressionId === progressionId
    && d.startedAt === today && d.workSets.length > 0
  ));
}
