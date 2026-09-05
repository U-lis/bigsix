import { getStep, topLabel, topStandard, valueOf } from './catalog.ts';
import { meetsStandard } from './history.ts';
import { RULES } from './rules.ts';
import type {
  AppState, Catalog, ProgressionId, SessionRecord, Standard, StandardLabel, Step,
} from './types.ts';

/** 화면·설명 문구용 기준 이름. */
export const TIER_KO: Record<StandardLabel, string> = {
  beginner: '초보자',
  intermediate: '중급자',
  progression: '상급자',
  elite: '최상급자',
};

/**
 * 승급 진행 상태 (FR-22).
 *
 * 승급 조건은 **「단계별 목표를 순차로 3회 연속 통과」 하나뿐이다** —
 * 초보자 3연속 → 중급자 3연속 → 상급자(10단계는 최상급자) 3연속 → 다음 단계.
 * 한 세션에 상급자 기준을 채웠다고 그 자리에서 승급하지 않는다 (FR-22.2).
 *
 * 이 값은 **저장하지 않고 `history` 에서 파생한다** (ADR-15). 저장하면 기록과
 * 어긋날 여지가 생기고, 파생하면 그럴 수 없다.
 */
export interface StepStreak {
  /** 지금 통과 중인 기준. */
  tier: StandardLabel;
  /** 그 기준을 연속으로 통과한 횟수. 0 ~ RULES.promotionStreakRequired. */
  streak: number;
}

/** 그 단계에서 `tier` 가 가리키는 기준. */
export function standardOf(step: Step, tier: StandardLabel): Standard {
  if (tier === 'beginner') return step.beginner;
  if (tier === 'intermediate') return step.intermediate;
  return topStandard(step);
}

/** 이 단계의 마지막 기준 이름. 1~9단계는 상급자, 10단계는 최상급자다. */
function finalTier(step: Step): StandardLabel {
  return topLabel(step);
}

/** `tier` 다음 기준. 마지막 기준이면 null — 그때는 승급 대상이다. */
function nextTier(step: Step, tier: StandardLabel): StandardLabel | null {
  if (tier === 'beginner') return 'intermediate';
  if (tier === 'intermediate') return finalTier(step);
  return null;
}

/**
 * 한 세션이 연속 상태를 어떻게 바꾸는가.
 *
 * - **중단(`abandoned`)과 다지기(`consolidation`)는 연속을 깨지 않는다** (FR-22.3a).
 *   미달과 다르게 다루는 이유는 성격이 다르기 때문이다 — 미달은 그 기준에 도전해서
 *   못 채운 것이고, 중단은 도전을 접고 아래 단계를 다진 것이다.
 * - 끝까지 수행했으나 기준에 미달하면 연속이 **0** 이 된다 (FR-22.3).
 *   목표는 그 기준에 머물고 연속만 다시 센다 — 아래 기준으로 내려가지 않는다.
 */
function advance(cur: StepStreak, step: Step, record: SessionRecord): StepStreak {
  if (record.kind === 'consolidation' || record.outcome === 'abandoned') return cur;

  const std = standardOf(step, cur.tier);
  if (!meetsStandard(record.sets, std.sets, valueOf(std))) return { ...cur, streak: 0 };

  const streak = cur.streak + 1;
  if (streak < RULES.promotionStreakRequired) return { ...cur, streak };

  const next = nextTier(step, cur.tier);
  // 마지막 기준을 채웠으면 그 상태 그대로 돌려준다. 승급 판정은 evaluate.ts 가 한다.
  if (next === null) return { tier: cur.tier, streak };
  return { tier: next, streak: 0 };
}

/**
 * 이 종목의 현재 단계에서 어느 기준을 몇 회 연속 통과했는가 (FR-22).
 *
 * 훑는 범위를 좁히는 하한이 둘 있다. 둘 다 "판정 범위 축소" 이며 기록을 지우지 않는다.
 * - **수동 단계 조정 앵커** (FR-13.3) — 조정 이후의 세션만 본다.
 * - **마지막 승급** — 승급하면 새 단계의 초보자 구간부터 다시 시작한다.
 *
 * 현재 단계와 다른 단계의 기록은 애초에 대상이 아니다.
 */
export function stepStreak(
  state: AppState, catalog: Catalog, id: ProgressionId,
): StepStreak {
  const n = state.steps[id];
  const step = getStep(catalog, id, n);
  // 판정용 뷰로 좁힌 히스토리를 훑는다 — 자유 운동은 여기 들어오지 않는다
  // (FR-18.6 / ADR-16). 앵커는 원본 history 기준이므로,
  // 자유 운동을 지나칠 때는 별도 조건으로 처리해 인덱스 일치를 유지한다.
  const anchor = state.adjustedAtSessionIndex?.[id] ?? 0;

  let cur: StepStreak = { tier: 'beginner', streak: 0 };
  for (let i = anchor; i < state.history.length; i += 1) {
    const r = state.history[i];
    if (r.kind === 'free') continue;
    if (r.progressionId !== id) continue;
    // 승급 세션을 만나면 그 뒤가 새 단계의 시작이다. 그 전 기록은 이 단계와 무관하다.
    if (r.promotedTo !== undefined) {
      cur = { tier: 'beginner', streak: 0 };
      continue;
    }
    if (r.step !== n) continue;
    cur = advance(cur, step, r);
  }
  return cur;
}

/** 이 종목이 지금 승급 조건을 채웠는가 — 마지막 기준을 3회 연속 통과했는가. */
export function streakComplete(step: Step, s: StepStreak): boolean {
  return s.tier === finalTier(step) && s.streak >= RULES.promotionStreakRequired;
}
