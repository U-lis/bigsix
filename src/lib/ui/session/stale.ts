/**
 * 날 넘긴 진행 중 칸을 모은다 (ADR-48 / FR-2.9 / EC-7a).
 *
 * `staleDrafts(drafts, today)` 는 `draft.startedAt < today` 인 칸만 뽑아 날짜별로
 * 묶어 돌려준다. `today` 와 같은 칸은 포함하지 않는다 — 그 칸들은 오늘 카드가
 * 직접 렌더한다.
 *
 * Phase 5 의 `StaleBanner` 가 이 결과로 「그 날짜로 기록」 / 「버리기」 를 제공한다.
 * `isStaleStartedAt` 과 `data-stale` 훅은 이 함수로 대체된다.
 *
 * 날짜 비교는 ISO (`YYYY-MM-DD`) 형식의 사전식 비교다 — 도메인 날짜 규약과 같다.
 */

import type { IsoDate } from '$lib/domain/types';
import type { SessionDraft } from '$lib/ui/state/storage';

/**
 * `drafts` 중 `draft.startedAt < today` 인 칸만 날짜별로 묶는다.
 * 결과 각 배열의 원소 순서는 drafts 맵의 삽입 순서를 따른다 (Object.entries 와 같은 순).
 *
 * **키 파생**: 결과 배열에는 draft 키가 직접 포함되지 않는다.
 * `discardDraft(key)` / `finish(..., scope)` 호출 시
 * `draftKey(d.progressionId, d.kind)` 로 키를 파생한다 (`$lib/ui/state/storage` 에서 import).
 */
export function staleDrafts(
  drafts: Record<string, SessionDraft>,
  today: IsoDate,
): Record<IsoDate, SessionDraft[]> {
  const out: Record<IsoDate, SessionDraft[]> = {};
  for (const [, draft] of Object.entries(drafts)) {
    if (draft.startedAt >= today) continue;
    const date = draft.startedAt;
    const bucket = out[date];
    if (bucket === undefined) out[date] = [draft];
    else bucket.push(draft);
  }
  return out;
}

/**
 * drafts 맵에 칸이 하나라도 있으면 true 를 돌려준다.
 * ExportBar 의 가져오기 차단 조건으로 쓴다 (SPEC5 FR-45.4).
 */
export function hasAnyDraft(drafts: Record<string, SessionDraft>): boolean {
  return Object.keys(drafts).length > 0;
}
