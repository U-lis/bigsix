/**
 * 표시 문구 헬퍼 (화면 3개 공용).
 *
 * 도메인이 준 문자열(`reason` / `sideNote` / 잠금 사유)은 **여기서 가공하지 않는다**
 * (NFR-2 / FR-5.3). 이 파일은 배치용 헤더 문구·라벨 정도만 만든다.
 */

import { getProgression } from '../../domain/catalog.ts';
import type {
  Catalog, PlannedExercise, ProgressionId, SetMode, StandardLabel, Unit,
} from '../../domain/types.ts';

/**
 * 종목 이름. 표시는 한국어로 고정한다 (D-15) — `progressionId` 원문('pushup')을
 * 화면에 그대로 내보내지 않는다.
 */
export function progressionName(catalog: Catalog, id: ProgressionId): string {
  return getProgression(catalog, id).name.ko;
}

/** 화면 문구용 단위 라벨. */
export function unitLabel(unit: Unit): string {
  return unit === 'seconds' ? '초' : '회';
}

/** 화면 문구용 기준 이름. */
export function standardLabel(label: StandardLabel): string {
  switch (label) {
    case 'beginner':
      return '초보자';
    case 'intermediate':
      return '중급자';
    case 'progression':
      return '상급자';
    case 'elite':
      return '최상급자';
  }
}

/**
 * 세트 목표 문구 (FR-6.6 / FR-15.2).
 * mode: 'max' 는 "이 수치 이상으로 최대한", 'fixed' 는 "이 수치만큼".
 * **상한이 아니다.** 화면 문구도 이 사실에 맞춘다.
 */
export function setTargetLabel(target: number, mode: SetMode, unit: Unit): string {
  const u = unitLabel(unit);
  if (mode === 'max') return `${target}${u} 이상으로 최대한`;
  return `${target}${u}`;
}

/** 세션 종류 라벨. */
export function kindLabel(kind: 'work' | 'consolidation' | 'free'): string {
  if (kind === 'consolidation') return '다지기 세션';
  if (kind === 'free') return '자유 운동';
  return '본 세션';
}

/** 프로그램 헤더. */
export function planHeader(programKo: string, dayNumber: number, weekday: string): string {
  return `${programKo} · ${dayNumber}일차 · ${weekday}요일`;
}

/**
 * PlannedExercise 의 표시용 이름.
 * `stepName.ko` 는 도메인이 준 값이라 가공하지 않는다.
 */
export function exerciseTitle(plan: PlannedExercise): string {
  return `${plan.performedStep}단계 · ${plan.stepName.ko}`;
}
