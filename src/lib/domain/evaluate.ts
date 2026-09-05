import { RULES } from './rules.ts';
import { getStep, topLabel, topStandard, valueOf } from './catalog.ts';
import { judgingState, meetsStandard, sessionsAt } from './history.ts';
import { stepStreak, streakComplete, TIER_KO, type StepStreak } from './progress.ts';
import type { AppState, Catalog, SessionInput, SessionRecord, StandardLabel } from './types.ts';

export interface Evaluation {
  metBeginner: boolean;
  metIntermediate: boolean;
  /** 1~9단계는 상급자, 10단계는 최상급자 기준 충족 여부. */
  metTop: boolean;
  topLabel: StandardLabel;
  /** 이번 세션까지 반영한 연속 상태 (FR-22). 화면이 "중급자 2/3회 연속" 을 여기서 얻는다. */
  streak: StepStreak;
  /** 실제로 단계를 올릴지. */
  promote: boolean;
  /** 기준은 채웠지만 승급을 막은 사유. */
  blockedBy?: 'rpe' | 'master';
  nextStep: number;
  notes: string[];
}

/**
 * 최근 N개 세션(이번 것 포함)의 RPE 평균이 임계 이상이면 승급을 보류한다.
 * RPE 를 입력하지 않았으면 거부권은 작동하지 않는다.
 */
function rpeVeto(
  state: AppState, record: SessionInput,
): { blocked: boolean; mean: number; n: number } {
  // 자유 운동은 판정 대상이 아니므로 RPE 창에도 넣지 않는다 (ADR-16 / EC-46 유사).
  const jState = judgingState(state);
  const recent = [...sessionsAt(jState, record.progressionId, record.step), record]
    .filter((r) => r.kind === 'work' && r.rpe !== undefined)
    .slice(-RULES.rpeVetoWindow);
  if (recent.length < RULES.rpeVetoWindow) return { blocked: false, mean: 0, n: recent.length };
  const m = recent.reduce((a, r) => a + r.rpe!, 0) / recent.length;
  return { blocked: m >= RULES.rpeVetoMean, mean: m, n: recent.length };
}

export function evaluateSession(
  state: AppState, catalog: Catalog, record: SessionInput,
): Evaluation {
  const step = getStep(catalog, record.progressionId, record.step);
  const top = topStandard(step);
  const label = topLabel(step);
  const notes: string[] = [];

  // 이번 세션까지 반영한 연속 상태. 승급 판정의 유일한 근거다 (FR-22.1).
  const after = stepStreak(
    { ...state, history: [...state.history, record as SessionRecord] }, catalog,
    record.progressionId,
  );
  const streakNote = `${TIER_KO[after.tier]} 기준 ${after.streak}/${RULES.promotionStreakRequired}회 연속.`;

  if (record.kind === 'consolidation') {
    notes.push(`${record.performedStep ?? record.step - 1}단계를 다지는 세션 `
      + '— 현재 단계의 승급 판정 대상이 아니다. 연속 횟수는 그대로다.');
    notes.push(streakNote);
    return { metBeginner: false, metIntermediate: false, metTop: false, topLabel: label,
      streak: after, promote: false, nextStep: record.step, notes };
  }

  const metBeginner = meetsStandard(record.sets, step.beginner.sets, valueOf(step.beginner));
  const metIntermediate = meetsStandard(
    record.sets, step.intermediate.sets, valueOf(step.intermediate));
  const metTop = meetsStandard(record.sets, top.sets, valueOf(top));

  if (record.outcome === 'abandoned') {
    notes.push('사용자가 중단한 도전 — 단계 유지. 연속 횟수는 그대로다.');
    notes.push(streakNote);
    return { metBeginner, metIntermediate, metTop, topLabel: label,
      streak: after, promote: false, nextStep: record.step, notes };
  }

  // 승급 조건은 「단계별 목표를 순차로 3회 연속 통과」 하나뿐이다 (FR-22.1).
  // 한 세션에 상급자 기준을 크게 넘겨도 그 기준의 연속 1회일 뿐이다 (FR-22.2).
  if (!streakComplete(step, after)) {
    notes.push(streakNote);
    return { metBeginner, metIntermediate, metTop, topLabel: label,
      streak: after, promote: false, nextStep: record.step, notes };
  }

  if (step.n >= 10) {
    notes.push(`최상급자 기준 ${top.sets}×${valueOf(top)} 3연속 완성. 더 올라갈 단계가 없다.`);
    return { metBeginner, metIntermediate, metTop, topLabel: label,
      streak: after, promote: false, blockedBy: 'master', nextStep: record.step, notes };
  }

  const veto = rpeVeto(state, record);
  if (veto.blocked) {
    notes.push(`${TIER_KO[after.tier]} 기준 3연속 완성. `
      + `다만 최근 ${veto.n}회 RPE 평균 ${veto.mean.toFixed(1)} `
      + `(임계 ${RULES.rpeVetoMean}) — 승급 보류, 현재 단계 유지.`);
    return { metBeginner, metIntermediate, metTop, topLabel: label,
      streak: after, promote: false, blockedBy: 'rpe', nextStep: record.step, notes };
  }

  notes.push(`${TIER_KO[after.tier]} 기준 ${top.sets}×${valueOf(top)} 3연속 완성 `
    + `— ${step.n + 1}단계로.`);
  return { metBeginner, metIntermediate, metTop, topLabel: label,
    streak: after, promote: true, nextStep: step.n + 1, notes };
}

/**
 * 기록을 반영한 새 상태를 돌려준다. 원본은 건드리지 않는다 (NFR-2).
 *
 * 입력(`SessionInput`)에 엔진이 계산한 파생 필드를 붙여 `SessionRecord` 를 만들고,
 * 그것을 history 에 넣는다 (ADR-3). `promotedTo` / `blockedBy` 는 여기서만 채운다.
 */
export function applySession(
  state: AppState, catalog: Catalog, input: SessionInput,
): { state: AppState; evaluation: Evaluation; record: SessionRecord } {
  // 자유 운동은 승급·유지·강등·다음 목표 계산 어디에도 영향을 주지 않는다
  // (FR-18.4 / FR-18.6 / EC-40). `state.steps` 를 어느 방향으로도 움직이지 않는다 —
  // 사용자가 임의로 고른 단계이므로 다지기(`nextStep = record.step`) 분기를
  // 그대로 쓰면 현재 단계에서 밑으로 내려가는 부작용이 난다.
  if (input.kind === 'free') {
    const record: SessionRecord = { ...input };
    const step = getStep(catalog, input.progressionId, input.step);
    const evaluation: Evaluation = {
      metBeginner: false,
      metIntermediate: false,
      metTop: false,
      topLabel: topLabel(step),
      streak: stepStreak(state, catalog, input.progressionId),
      promote: false,
      nextStep: input.step,
      notes: ['자유 운동 — 승급·유지 판정 대상이 아니다.'],
    };
    return {
      state: {
        ...state,
        // steps 를 손대지 않는다 (FR-18.4 / EC-40).
        history: [...state.history, record],
      },
      evaluation,
      record,
    };
  }

  const evaluation = evaluateSession(state, catalog, input);

  // 값이 없을 때 undefined 를 명시 대입하지 않는다 — 필드 자체를 만들지 않는다.
  const record: SessionRecord = { ...input };
  if (evaluation.promote) record.promotedTo = evaluation.nextStep;
  if (evaluation.blockedBy !== undefined) record.blockedBy = evaluation.blockedBy;

  return {
    // ...state 스프레드 필수 — stints / proposals 를 잃지 않기 위함 (C-2).
    state: {
      ...state,
      steps: { ...state.steps, [input.progressionId]: evaluation.nextStep },
      history: [...state.history, record],
    },
    evaluation,
    record,
  };
}
