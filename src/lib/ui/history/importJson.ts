/**
 * 가져오기 검증 (FR-27.2 · ADR-25 · GLOBAL (B.5)).
 *
 * 파일 텍스트를 받아 저장 봉투로 재조립한 뒤 **기존 저장 계층의**
 * `validateAndMigrateAppStateEnvelope` 를 그대로 태운다 — 새 검증 경로를
 * 만들지 않는다는 SPEC 의 명시 요구다 (FR-27.2 · SPEC 「검증은 기존 저장 계층
 * 을 재사용」).
 *
 * 결과는 판별 유니온 `ImportResult` (GLOBAL B.5). 성공하면 현재/가져올 기록의
 * 수 · 날짜 범위(counts)를 함께 담아 확인 다이얼로그가 보여줄 문구의 근원을 만든다.
 *
 * 이 함수는 순수 함수다 — 상태를 바꾸지 않고, 브라우저 API 를 부르지 않는다.
 */

import type { AppState, IsoDate } from '$lib/domain/types';
import { validateAndMigrateAppStateEnvelope } from '$lib/ui/state/storage';

/** 현재/가져올 기록의 요약. 확인 다이얼로그 본문의 근원. */
export interface ImportCounts {
  current: number;
  incoming: number;
  currentRange: { from: IsoDate; to: IsoDate } | null;
  incomingRange: { from: IsoDate; to: IsoDate } | null;
}

/**
 * 가져오기 결과 (GLOBAL B.5).
 *
 * - `not-json`: JSON.parse 실패.
 * - `schema-missing`: `meta` 가 없거나 `meta.schemaVersion` 이 숫자가 아님.
 * - `shape`: `appState` 필드가 없거나 `isAppStateShape` 실패 (EC-64).
 * - `future-version`: `meta.schemaVersion > CURRENT_SCHEMA_VERSION` (EC-63). `detail` 에 버전 문자열.
 */
export type ImportResult =
  | { ok: true; appState: AppState; counts: ImportCounts }
  | {
      ok: false;
      reason: 'not-json' | 'shape' | 'future-version' | 'schema-missing';
      detail?: string;
    };

/**
 * `SessionRecord[]` 의 날짜 범위(첫/마지막 `date`). 빈 배열이면 null.
 *
 * `SessionRecord.date` 는 오름차순으로 유지된다 (엔진 계약). 배열 첫 원소가 가장 오래된
 * 날짜, 마지막이 가장 최근이다.
 */
function rangeOf(state: AppState): { from: IsoDate; to: IsoDate } | null {
  const h = state.history;
  if (h.length === 0) return null;
  return { from: h[0].date, to: h[h.length - 1].date };
}

/**
 * 파일 텍스트를 검증한다 (FR-27.2 · EC-63/64/65).
 *
 * @param text 파일 본문.
 * @param current 현재 앱의 상태. counts.current 산출에만 쓰인다.
 */
export function parseImport(text: string, current: AppState): ImportResult {
  // 1) JSON 파싱.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (parsed === null || typeof parsed !== 'object') {
    return { ok: false, reason: 'not-json' };
  }
  const file = parsed as Record<string, unknown>;

  // 2) meta.schemaVersion 이 숫자여야 한다. 없으면 이 파일은 bigsix 내보내기가 아니다.
  const meta = file.meta;
  if (meta === null || typeof meta !== 'object') {
    return { ok: false, reason: 'schema-missing' };
  }
  const sv = (meta as Record<string, unknown>).schemaVersion;
  if (typeof sv !== 'number') {
    return { ok: false, reason: 'schema-missing' };
  }

  // 3) 저장 봉투 재조립 (ADR-25). catalog 는 무시한다 — 현재 앱의 카탈로그를 쓴다.
  const envelope = { schemaVersion: sv, appState: file.appState };

  // 4) 기존 검증 경로 재사용.
  const validated = validateAndMigrateAppStateEnvelope(envelope);
  if (!validated.ok) {
    if (validated.reason === 'future-version') {
      return {
        ok: false,
        reason: 'future-version',
        detail: String(validated.version),
      };
    }
    // corrupt → 'shape' 로 매핑. 사용자에게는 「형태가 맞지 않는다」가 유일한 사유.
    return { ok: false, reason: 'shape' };
  }

  // 5) counts 계산.
  const counts: ImportCounts = {
    current: current.history.length,
    incoming: validated.state.history.length,
    currentRange: rangeOf(current),
    incomingRange: rangeOf(validated.state),
  };

  return { ok: true, appState: validated.state, counts };
}
