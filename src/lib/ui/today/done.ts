/**
 * 오늘 이미 기록한 종목의 완료 카드용 순수 함수 (ADR-49 · ADR-50 · ADR-51 / FR-46).
 *
 * 룬을 쓰지 않는다. `localStorage` 나 브라우저 상태에 닿지 않는다 — 전부 순수 함수다
 * (NFR-14 / NFR-39). SSR 에서도 돌고 `tests/unit/today/done.test.ts` 가 직접 호출한다.
 *
 * - `recordedToday(history, today, id)` — 그 종목이 오늘 자로 남긴 정규 기록
 *   (`work` · `consolidation` · `outcome === 'abandoned'`, `kind: 'free'` 제외).
 * - `doneResultLabel(progName, record)` — `+page.svelte` 의 `recordLine` 과 같은
 *   사실 문구를 돌려준다. catalog 를 받지 않는다 — 종목명을 미리 해석해 넘긴다.
 * - `doneSetShortfall(record, i)` — 세트 i 가 목표에 못 미치면 미달 문구를 돌려준다.
 * - `syncDoneDrafts(drafts, history, today)` — 오늘 정규 기록이 있는 종목의
 *   `work` / `consolidation` draft 를 조용히 버리지 않고 자유 운동 칸으로 옮기는
 *   액션 목록을 돌려준다. 멱등하다 (ADR-51 / R-10).
 */

import type {
  IsoDate,
  ProgressionId,
  SessionRecord,
} from '$lib/domain/types';
import { draftKey, type SessionDraft, type SetEntry } from '$lib/ui/state/storage';

// ── recordedToday (ADR-49 / EC-102 / EC-103 / EC-104) ─────────────────────

/**
 * `history` 에서 `date === today` 이고 `progressionId === id` 이고
 * `kind` 가 `work` 또는 `consolidation` 인 레코드를 삽입 순서대로 반환한다.
 * `kind === 'free'` 는 제외한다 (EC-104). `outcome === 'abandoned'` 인 work
 * 레코드는 포함한다 (EC-102).
 */
export function recordedToday(
  history: readonly SessionRecord[],
  today: IsoDate,
  id: ProgressionId,
): SessionRecord[] {
  const out: SessionRecord[] = [];
  for (const r of history) {
    if (r.date !== today) continue;
    if (r.progressionId !== id) continue;
    if (r.kind === 'free') continue;
    out.push(r);
  }
  return out;
}

// ── doneResultLabel (R-12) ────────────────────────────────────────────────

/**
 * 완료된 기록의 사실 문구를 돌려준다.
 * `+page.svelte` 의 옛 `recordLine` 과 같은 문자열 규칙을 쓴다 (DRY).
 *
 * catalog 를 받지 않는다 — 종목명을 미리 `progressionName(catalog, id)` 로 해석해
 * 넘겨 받는 쪽에서 순수성을 유지한다.
 *
 * `record` 인자를 변경하지 않는다.
 */
export function doneResultLabel(progName: string, record: SessionRecord): string {
  if (record.promotedTo !== undefined && record.promotedTo !== null) {
    return `${progName}: ${record.step}단계 → ${record.promotedTo}단계 (승급)`;
  }
  if (record.blockedBy !== undefined) {
    return `${progName}: ${record.step}단계 (보류 · ${record.blockedBy})`;
  }
  if (record.outcome === 'abandoned') {
    return `${progName}: ${record.step}단계 중단`;
  }
  return `${progName}: ${record.step}단계 기록`;
}

// ── doneSetShortfall (FR-40 — 미달 문구) ──────────────────────────────────

/**
 * 세트 i 가 목표에 못 미치면 「/ 목표 {target} · 미달」 문구를, 아니면 null 을
 * 돌려준다. `target` 이 없거나 범위를 벗어나면 null.
 */
export function doneSetShortfall(record: SessionRecord, i: number): string | null {
  const target = record.target?.work[i];
  if (target === undefined) return null;
  const value = record.sets[i];
  if (value === undefined) return null;
  if (value >= target.target) return null;
  return `/ 목표 ${target.target} · 미달`;
}

// ── syncDoneDrafts (ADR-51 — 세트 유실 방지) ──────────────────────────────

/**
 * `syncDoneDrafts` 가 돌려주는 작업.
 *
 * - `remove-draft`: 해당 키의 draft 를 drafts 맵에서 제거한다.
 * - `move-sets`: `fromKey` draft 를 제거하고 세트를 자유 운동 칸으로 옮긴다.
 *   자유 운동 칸이 없으면 `toStep` 으로 열고, 있으면 세트를 추가한다.
 * - `report`: drafts 를 바꾸지 않는다. UI 가 사용자에게 표시할 사유를 담는다
 *   (현재는 `step-mismatch` 하나).
 */
export type SyncAction =
  | { kind: 'remove-draft'; key: string }
  | { kind: 'move-sets'; fromKey: string; toStep: number; sets: SetEntry[] }
  | { kind: 'report'; key: string; reason: 'step-mismatch' };

/**
 * 오늘 정규 기록이 이미 있는 종목의 `work` / `consolidation` draft 를 보고
 * 세트 유실 없는 이전 액션 목록을 돌려준다 (ADR-51).
 *
 * 이전 규칙 (PLAN §1-4 · GLOBAL ADR-51 표):
 *   - `work` / `consolidation` draft, 세트 있음:
 *       자유 운동 칸이 없거나 같은 단계이면 `move-sets` + `remove-draft`;
 *       다른 단계이면 `report(step-mismatch)` 만 돌리고 draft 는 건드리지 않는다.
 *   - 세트 0개, `abandoned` 아님: `remove-draft` 만.
 *   - 세트 0개, `abandoned: true`: `remove-draft` 만.
 *   - 세트 있음, `abandoned: true`: `move-sets` + `remove-draft`.
 *
 * `free` draft 자체, 오늘이 아닌 draft 는 건드리지 않는다.
 * 멱등하다 — 액션을 적용한 뒤 다시 호출하면 빈 배열이 돌아온다 (R-10 수렴).
 */
export function syncDoneDrafts(
  drafts: Record<string, SessionDraft>,
  history: readonly SessionRecord[],
  today: IsoDate,
): SyncAction[] {
  const actions: SyncAction[] = [];
  for (const [key, draft] of Object.entries(drafts)) {
    // 오늘 자 draft 만 본다 — 날 넘긴 칸은 StaleBanner 가 다룬다.
    if (draft.startedAt !== today) continue;
    // free 칸은 흡수 대상이지 흡수의 주체가 아니다.
    if (draft.kind === 'free') continue;

    // 이 종목이 오늘 자로 남긴 정규 기록이 하나라도 있어야 처리한다.
    const records = recordedToday(history, today, draft.progressionId);
    if (records.length === 0) continue;

    const sets = draft.workSets;

    // 세트 0개 — 그냥 지운다 (abandoned 여부 무관).
    if (sets.length === 0) {
      actions.push({ kind: 'remove-draft', key });
      continue;
    }

    // 세트 있음 — 자유 운동 칸으로 옮긴다.
    const toStep = records[records.length - 1].performedStep ?? records[records.length - 1].step;
    const freeKey = draftKey(draft.progressionId, 'free');
    const freeDraft = drafts[freeKey];

    if (freeDraft === undefined) {
      // 자유 운동 칸이 없다 — 새로 열고 세트를 옮긴다.
      actions.push({ kind: 'move-sets', fromKey: key, toStep, sets });
      actions.push({ kind: 'remove-draft', key });
      continue;
    }

    const freeStep = freeDraft.performedStep;
    if (freeStep === toStep) {
      // 같은 단계 — 기존 free 에 이어 붙인다.
      actions.push({ kind: 'move-sets', fromKey: key, toStep, sets });
      actions.push({ kind: 'remove-draft', key });
      continue;
    }

    // 다른 단계 — 자동으로 섞지 않는다. UI 에 보고해 사용자가 직접 처리하도록 안내한다.
    actions.push({ kind: 'report', key, reason: 'step-mismatch' });
  }
  return actions;
}
