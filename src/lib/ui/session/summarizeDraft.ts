/**
 * 칸별 요약 문구 (SPEC5 Phase 4 · ADR-46 · FR-42.3 · NFR-2 · R-4).
 *
 * FinishDialog 가 보여 줄 「{종목} {단계}: {사실}」 문자열을 조립한다.
 *
 * 룬을 import 하지 않는다 — 단위 테스트에서 node 환경으로 직접 호출된다.
 * 사실만 적는다 — 판정 결과·격려·백분율 금지 (NFR-2 / R-4).
 *
 * 사실 부분(`정규 N세트` · `추가 M세트` · `중단` · `다지기 N세트` · `자유 운동 N세트`)
 * 은 `planFinish` 가 이미 `DraftOps.summary` 에 넣어 둔다. 이 모듈은 거기에
 * 종목명(ko)·수행 단계·단계명(ko) 을 붙여 사람이 읽을 문자열을 완성한다.
 */

import type { Catalog } from '$lib/domain/types';
import { getProgression, getStep } from '$lib/domain';
import type { DraftOps } from './finish';
import type { SessionDraft } from '$lib/ui/state/storage';

/**
 * 「{종목} {수행 단계}단계 · {단계명}: {사실}」 형식의 요약 문자열을 돌려준다.
 *
 * - 종목명·단계명은 도메인이 준 ko 문자열을 가공 없이 쓴다 (NFR-2).
 * - 수행 단계(`performedStep`) 를 쓰므로 다지기 칸은 「2단계 · ...」 처럼 표시된다.
 * - 사실 부분은 `ops.summary` 를 그대로 붙인다 — 판정·격려·백분율은 애초에 들어 있지 않다.
 */
export function summarizeDraft(
  catalog: Catalog,
  draft: SessionDraft,
  ops: DraftOps,
): string {
  const progName = getProgression(catalog, draft.progressionId).name.ko;
  const stepName = getStep(catalog, draft.progressionId, draft.performedStep).name.ko;
  return `${progName} ${draft.performedStep}단계 · ${stepName}: ${ops.summary}`;
}
