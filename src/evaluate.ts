import { RULES } from './rules.ts';
import { getStep, topLabel, topStandard, valueOf } from './catalog.ts';
import { meetsStandard, sessionsAt } from './history.ts';
import type { AppState, Catalog, SessionRecord, StandardLabel } from './types.ts';

export interface Evaluation {
  metBeginner: boolean;
  metIntermediate: boolean;
  /** 1~9단계는 상급자, 10단계는 최상급자 기준 충족 여부. */
  metTop: boolean;
  topLabel: StandardLabel;
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
  state: AppState, record: SessionRecord,
): { blocked: boolean; mean: number; n: number } {
  const recent = [...sessionsAt(state, record.progressionId, record.step), record]
    .filter((r) => r.kind === 'work' && r.rpe !== undefined)
    .slice(-RULES.rpeVetoWindow);
  if (recent.length < RULES.rpeVetoWindow) return { blocked: false, mean: 0, n: recent.length };
  const m = recent.reduce((a, r) => a + r.rpe!, 0) / recent.length;
  return { blocked: m >= RULES.rpeVetoMean, mean: m, n: recent.length };
}

export function evaluateSession(
  state: AppState, catalog: Catalog, record: SessionRecord,
): Evaluation {
  const step = getStep(catalog, record.progressionId, record.step);
  const top = topStandard(step);
  const label = topLabel(step);
  const notes: string[] = [];

  if (record.kind === 'consolidation') {
    notes.push(`${record.performedStep ?? record.step - 1}단계를 다지는 세션 `
      + '— 현재 단계의 승급 판정 대상이 아니다.');
    return { metBeginner: false, metIntermediate: false, metTop: false, topLabel: label,
      promote: false, nextStep: record.step, notes };
  }

  const metBeginner = meetsStandard(record.sets, step.beginner.sets, valueOf(step.beginner));
  const metIntermediate = meetsStandard(
    record.sets, step.intermediate.sets, valueOf(step.intermediate));
  const metTop = meetsStandard(record.sets, top.sets, valueOf(top));

  if (record.outcome === 'abandoned') {
    notes.push('사용자가 중단한 도전 — 단계 유지.');
    return { metBeginner, metIntermediate, metTop, topLabel: label,
      promote: false, nextStep: record.step, notes };
  }

  if (!metTop) {
    notes.push(`${label === 'elite' ? '최상급자' : '상급자'} 기준 `
      + `${top.sets}×${valueOf(top)} 미달 — 단계 유지.`);
    return { metBeginner, metIntermediate, metTop, topLabel: label,
      promote: false, nextStep: record.step, notes };
  }

  if (step.n >= 10) {
    notes.push('마스터 단계 기준 달성. 더 올라갈 단계가 없다.');
    return { metBeginner, metIntermediate, metTop, topLabel: label,
      promote: false, blockedBy: 'master', nextStep: record.step, notes };
  }

  const veto = rpeVeto(state, record);
  if (veto.blocked) {
    notes.push(`상급자 기준 충족. 다만 최근 ${veto.n}회 RPE 평균 ${veto.mean.toFixed(1)} `
      + `(임계 ${RULES.rpeVetoMean}) — 승급 보류, 현재 단계 유지.`);
    return { metBeginner, metIntermediate, metTop, topLabel: label,
      promote: false, blockedBy: 'rpe', nextStep: record.step, notes };
  }

  notes.push(`상급자 기준 ${top.sets}×${valueOf(top)} 충족 — ${step.n + 1}단계로.`);
  return { metBeginner, metIntermediate, metTop, topLabel: label,
    promote: true, nextStep: step.n + 1, notes };
}

/** 기록을 반영한 새 상태를 돌려준다. 원본은 건드리지 않는다. */
export function applySession(
  state: AppState, catalog: Catalog, record: SessionRecord,
): { state: AppState; evaluation: Evaluation } {
  const evaluation = evaluateSession(state, catalog, record);
  return {
    state: {
      steps: { ...state.steps, [record.progressionId]: evaluation.nextStep },
      history: [...state.history, record],
    },
    evaluation,
  };
}
