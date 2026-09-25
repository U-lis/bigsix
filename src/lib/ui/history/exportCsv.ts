/**
 * 내보내기 CSV 조립 (FR-26.3 · EC-69 · EC-70 · GLOBAL (B.4)).
 *
 * CSV 는 **세트 한 줄(long)** 형식이다 (OQ-19 확정). 세션 하나가 세트 N개면 N줄,
 * 세트 0개 세션도 한 줄 나온다 — 세트 관련 5개 열(`set_index`, `value`, `set_rpe`,
 * `target`, `target_mode`) 이 빈 칸이다 (EC-70).
 *
 * 값 인용 규칙 (EC-69, RFC 4180): 값 안에 `,` · `"` · `\r` · `\n` 이 있으면 값 전체를
 * `"..."` 로 감싸고 내부 `"` 는 `""` 로 이스케이프. 줄 종결은 `\r\n`. 파일 첫 문자는
 * UTF-8 BOM (`﻿`).
 *
 * 도메인 함수는 `$lib/domain` 경유로만 부른다 (ADR-21) —
 * `stintAt` · `dayNumber` · `getProgram` · `getProgression` · `getStep`.
 *
 * 이 파일은 **순수 함수만** 담는다 (FR-26.6). 상태를 바꾸지 않는다.
 */

import { dayNumber, getProgram, getProgression, getStep, stintAt } from '$lib/domain';
import type {
  AppState, Catalog, IsoDate, SessionRecord, SetMode, StandardLabel,
} from '$lib/domain/types';

// ── 열 정의 (GLOBAL B.4, 22열, 순서 고정) ─────────────────────────────────────

export const CSV_HEADERS = [
  'date',
  'completed_at',
  'program',
  'day_number',
  'progression',
  'step',
  'performed_step',
  'step_name',
  'unit',
  'kind',
  'outcome',
  'set_index',
  'value',
  'set_rpe',
  'session_rpe',
  'goal_label',
  'goal_sets',
  'goal_value',
  'target',
  'target_mode',
  'promoted_to',
  'blocked_by',
] as const;

export type CsvColumn = typeof CSV_HEADERS[number];

/**
 * 한 줄. 값은 전부 **표시용 문자열**이다 — 숫자·라벨은 여기서 문자열로 미리 굳혀
 * `formatCsv` 는 순수하게 인용·이스케이프만 한다. 빈 값은 빈 문자열이다.
 */
export type CsvRow = Record<CsvColumn, string>;

// ── 값 변환 유틸 ─────────────────────────────────────────────────────────────

/** 숫자를 문자열로, `undefined`/`null` 은 빈 칸. */
function num(v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

/** 문자열 그대로, `undefined`/`null` 은 빈 칸. */
function str(v: string | null | undefined): string {
  if (v === null || v === undefined) return '';
  return v;
}

/**
 * RFC 4180 인용.
 * `,` · `"` · `\r` · `\n` 이 있으면 값 전체를 `"..."` 로 감싸고 내부 `"` 는 `""`.
 * 그렇지 않으면 원본 그대로.
 */
export function csvQuote(value: string): string {
  if (/[,"\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ── CSV 행 만들기 ────────────────────────────────────────────────────────────

/**
 * 한 세션의 세션-공통 필드를 뽑는다. 세트별 열(`set_index`, `value`, `set_rpe`,
 * `target`, `target_mode`)만 세트마다 다르다.
 */
function sessionCommon(
  record: SessionRecord, state: AppState, catalog: Catalog,
): Omit<CsvRow, 'set_index' | 'value' | 'set_rpe' | 'target' | 'target_mode'> {
  const stint = stintAt(state, record.date);
  const performedStep = record.performedStep ?? record.step;
  const step = getStep(catalog, record.progressionId, performedStep);

  const goal = record.target?.goal;
  const goalLabel: StandardLabel | undefined = goal?.label;

  return {
    date: record.date,
    completed_at: str(record.completedAt),
    program: stint === null ? '' : getProgram(catalog, stint.programId).name.ko,
    day_number: stint === null ? '' : String(dayNumber(stint, record.date)),
    progression: getProgression(catalog, record.progressionId).name.ko,
    step: String(record.step),
    performed_step: String(performedStep),
    step_name: step.name.ko,
    unit: step.unit,
    kind: record.kind,
    outcome: str(record.outcome),
    session_rpe: num(record.rpe),
    goal_label: goalLabel ?? '',
    goal_sets: goal ? String(goal.sets) : '',
    goal_value: goal ? String(goal.value) : '',
    promoted_to: num(record.promotedTo),
    blocked_by: str(record.blockedBy),
  };
}

/**
 * `SessionRecord` 하나를 세트 수만큼의 줄로 만든다.
 *
 * 세트 0개 세션 → 한 줄, 세트 관련 5개 열 빈 칸 (EC-70).
 * `record.target?.work[i-1]` 이 있으면 `target` · `target_mode` 를 채운다.
 * `record.setRpes?.[i-1]` 이 있으면 `set_rpe` 를 채운다.
 */
function rowsForRecord(
  record: SessionRecord, state: AppState, catalog: Catalog,
): CsvRow[] {
  const common = sessionCommon(record, state, catalog);
  if (record.sets.length === 0) {
    return [{
      ...common,
      set_index: '',
      value: '',
      set_rpe: '',
      target: '',
      target_mode: '',
    } as CsvRow];
  }
  return record.sets.map((v, i): CsvRow => {
    const targetSet = record.target?.work[i];
    const setRpe = record.setRpes?.[i];
    return {
      ...common,
      set_index: String(i + 1),
      value: String(v),
      set_rpe: setRpe === null || setRpe === undefined ? '' : String(setRpe),
      target: targetSet === undefined ? '' : String(targetSet.target),
      target_mode: targetSet === undefined ? '' : (targetSet.mode as SetMode),
    } as CsvRow;
  });
}

/**
 * 상태 전체를 CSV 행 배열로 바꾼다. 진행 중 세션은 `state.history` 에 없으므로
 * 자동 배제된다 (EC-59). 순서는 `history` 순서 그대로.
 */
export function buildCsvRows(state: AppState, catalog: Catalog): CsvRow[] {
  const out: CsvRow[] = [];
  for (const record of state.history) {
    for (const row of rowsForRecord(record, state, catalog)) out.push(row);
  }
  return out;
}

// ── 직렬화 ──────────────────────────────────────────────────────────────────

/**
 * 문자열로 만든다. 첫 문자 UTF-8 BOM · 헤더 한 줄 · 이후 데이터 줄. 줄 종결 `\r\n`.
 *
 * 빈 배열이어도 BOM 과 헤더는 나온다.
 */
export function formatCsv(rows: CsvRow[]): string {
  const lines: string[] = [];
  lines.push(CSV_HEADERS.map(csvQuote).join(','));
  for (const row of rows) {
    lines.push(CSV_HEADERS.map((h) => csvQuote(row[h])).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/**
 * 편의: `buildCsvRows` + `formatCsv`. 컴포넌트는 이 하나만 부르면 된다.
 */
export function buildExportCsv(state: AppState, catalog: Catalog): string {
  return formatCsv(buildCsvRows(state, catalog));
}

// ── 검사용 재수출 ────────────────────────────────────────────────────────────

/**
 * 특정 세션에 목표 스냅샷이 없으면 `goal_*` · `target` · `target_mode` 5개 열이
 * 전부 빈 칸이라는 규칙 (GLOBAL B.4).
 *
 * 문서화용 상수 — 테스트가 열 이름 오탈자 없이 참조하려고 두었다.
 */
export const GOAL_COLUMNS: readonly CsvColumn[] = [
  'goal_label', 'goal_sets', 'goal_value', 'target', 'target_mode',
];

export const SET_COLUMNS: readonly CsvColumn[] = [
  'set_index', 'value', 'set_rpe', 'target', 'target_mode',
];

// SetMode 재수출 필요 없음 — 값(`fixed`/`max`) 이 그대로 문자열로 나간다.
export type { IsoDate };
