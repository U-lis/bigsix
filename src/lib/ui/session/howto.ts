/**
 * 동작 설명 순수 함수 (FR-30).
 *
 * `progressions.json` 에 이미 실려 있는 `Step.summary` 를 화면이 부를 수 있는
 * 형태로 정리해 낸다. **가공하지 않는다** — `summary` 배열은 그대로 흘려보낸다
 * (NFR-2 / FR-30.5).
 *
 * `pairWith` 가 있는 단계(핸드스탠드 2단계 → 1단계)는 동반 단계까지 두 개를 낸다.
 * 순서는 수행 단계 → 동반 단계 (FR-30.4 / EC-73).
 *
 * `summary` 가 빈 배열인 단계는 결과에서 빠진다 — 화면에 빈 상자를 두지 않기
 * 위해서다 (EC-71). 잠금 여부는 여기서 보지 않는다 — 호출부의 몫이다.
 */

import { getStep } from '$lib/domain';
import type { Catalog, ProgressionId, Step, Unit } from '$lib/domain/types';

export interface Howto {
  /** 이 설명이 해당하는 단계 번호. */
  step: number;
  nameKo: string;
  nameEn: string;
  unit: Unit;
  /** 기준 횟수가 한쪽 팔/다리 기준인지. 화면이 좌우 고지를 낼지 판단할 근거. */
  perSide: boolean;
  /** 한국어판 쪽수 (`Step.page`) — 책을 펴서 확인할 수 있어야 한다 (FR-30.3). */
  page: number;
  /** 설명 본문. `Step.summary` 를 그대로 흘려보낸다. */
  lines: string[];
}

/**
 * 수행 단계(그리고 `pairWith` 가 있으면 동반 단계)의 설명을 낸다.
 *
 * `performedStep` 은 **실제로 수행하는 단계**다 (FR-30.2). 다지기면 이전 단계,
 * 자유 운동이면 사용자가 고른 단계, 정규 세션이면 현재 단계.
 */
export function howtoFor(
  catalog: Catalog,
  progressionId: ProgressionId,
  performedStep: number,
): Howto[] {
  const out: Howto[] = [];
  const primary = getStep(catalog, progressionId, performedStep);
  pushIfNonEmpty(out, primary);
  if (primary.pairWith !== undefined) {
    const paired = getStep(catalog, progressionId, primary.pairWith);
    pushIfNonEmpty(out, paired);
  }
  return out;
}

function pushIfNonEmpty(out: Howto[], step: Step): void {
  if (step.summary.length === 0) return; // EC-71
  out.push({
    step: step.n,
    nameKo: step.name.ko,
    nameEn: step.name.en,
    unit: step.unit,
    perSide: step.perSide === true,
    page: step.page,
    lines: step.summary,
  });
}
