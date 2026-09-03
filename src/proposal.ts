import { addDays, diffDays, isMonday } from './date.ts';
import { checkGate } from './gate.ts';
import { LABEL_TO_ID, getProgram } from './schedule.ts';
import type {
  AppState, Catalog, IsoDate, ProgressionId, SessionRecord, SwitchProposal,
} from './types.ts';

/** 제안 조건이 요구하는 승급 이후 세션 수 (FR-4.1). */
export const MAINTENANCE_SESSIONS = 3;

/**
 * 전환 제안의 고정 순서 (FR-4.7).
 * 카탈로그 배열 순서에 의존하지 않는다 — 순서 자체가 사양이다.
 */
export const PROGRAM_ORDER: readonly string[] = [
  'new_blood',
  'good_behavior',
  'veterano',
  'solitary_confinement',
  'supermax',
] as const;

/** 다음 순번 프로그램. `supermax` 이거나 알 수 없는 id 면 null (FR-4.7). */
export function nextProgramId(programId: string): string | null {
  const i = PROGRAM_ORDER.indexOf(programId);
  if (i < 0) return null;
  return PROGRAM_ORDER[i + 1] ?? null;
}

/** a 가 b 이상인 날짜인지. */
function onOrAfter(a: IsoDate, b: IsoDate): boolean {
  return diffDays(b, a) >= 0;
}

/** a 가 b 보다 뒤인 날짜인지. */
function after(a: IsoDate, b: IsoDate): boolean {
  return diffDays(b, a) > 0;
}

/** 해당 종목의, `floorDate` 이상인 세션들. */
function sessionsFrom(
  history: SessionRecord[], progressionId: ProgressionId, floorDate: IsoDate,
): SessionRecord[] {
  return history.filter(
    (r) => r.progressionId === progressionId && onOrAfter(r.date, floorDate),
  );
}

/**
 * `floorDate` 이후의 마지막 강등 세션 날짜. 없으면 null (FR-4.3).
 * 강등은 `outcome: 'abandoned'` 기록 또는 그로 인한 `kind: 'consolidation'` 세션이다.
 * 스키마 변경 없이 기존 필드 조합으로 판정한다.
 */
export function lastSetbackDate(
  history: SessionRecord[], progressionId: ProgressionId, floorDate: IsoDate,
): IsoDate | null {
  const dates = sessionsFrom(history, progressionId, floorDate)
    .filter((r) => r.outcome === 'abandoned' || r.kind === 'consolidation')
    .map((r) => r.date);
  if (dates.length === 0) return null;
  return dates.reduce((latest, d) => (after(d, latest) ? d : latest));
}

/**
 * 기준점 계산의 유효 하한 (EC-5).
 *
 * 강등을 "기준점 이후에 강등이 있으면 카운트 0" 이라는 **사후 무효화**로 다루면
 * "가장 이른 승급이 기준점"(EC-6)과 충돌해 구간 내 카운트가 영구 0 이 된다.
 * 그래서 강등은 무효화가 아니라 **기준점의 하한**으로 승격시킨다.
 * 강등 다음날부터 다시 보므로 재승급이 새 기준점이 되고 카운트가 다시 쌓인다.
 */
export function effectiveFloor(
  history: SessionRecord[], progressionId: ProgressionId, floorDate: IsoDate,
): IsoDate {
  const setback = lastSetbackDate(history, progressionId, floorDate);
  if (setback === null) return floorDate;
  const resume = addDays(setback, 1);
  return after(resume, floorDate) ? resume : floorDate;
}

/**
 * 유효 하한 이후 **가장 이른** 승급 세션의 날짜. 없으면 null (ADR-7).
 *
 * 가장 이른 것을 쓰는 이유는 EC-6(추가 승급 시 카운트 유지, FR-4.4) 때문이다.
 * 마지막 승급을 쓰면 추가 승급마다 카운트가 리셋된다.
 *
 * RPE 거부권으로 보류된 세션(EC-11)은 `promotedTo` 가 없으므로
 * 별도 조건문 없이 후보에서 빠진다.
 */
export function promotionBaseline(
  history: SessionRecord[], progressionId: ProgressionId, floorDate: IsoDate,
): IsoDate | null {
  const floor = effectiveFloor(history, progressionId, floorDate);
  const dates = sessionsFrom(history, progressionId, floor)
    .filter((r) => r.promotedTo !== undefined)
    .map((r) => r.date);
  if (dates.length === 0) return null;
  return dates.reduce((earliest, d) => (after(earliest, d) ? d : earliest));
}

/**
 * 승급 이후 그 종목의 세션 수 (FR-4.1, FR-4.2).
 *
 * 날짜 수가 아니라 **세션 수**다 — 같은 날 2회는 2로 센다 (EC-4).
 * `kind` 는 필터에 넣지 않는다 — work 든 consolidation 이든 그 종목의 세션이면 센다 (FR-4.2).
 *
 * **여기서 강등을 다시 검사하지 않는다.** 강등은 `effectiveFloor` 에서 하한으로 이미 처리되었다.
 * 여기서 재검사하면 구간 내 카운트가 영구 0 이 되는 결함이 되살아난다.
 */
export function maintenanceCount(
  history: SessionRecord[], progressionId: ProgressionId, floorDate: IsoDate,
): number {
  const baseline = promotionBaseline(history, progressionId, floorDate);
  if (baseline === null) return 0;
  return history.filter(
    (r) => r.progressionId === progressionId && after(r.date, baseline),
  ).length;
}

/** 프로그램 요일표가 다루는 빅6 종목 목록(중복 제거, 표에 등장한 순서). */
export function programProgressions(catalog: Catalog, programId: string): ProgressionId[] {
  const program = getProgram(catalog, programId);
  const out: ProgressionId[] = [];
  for (const entries of Object.values(program.schedule) as [string, string][][]) {
    for (const [label] of entries ?? []) {
      const id = LABEL_TO_ID[label];
      // 표에 없는 이름은 보조 운동이다 — 판정 대상이 아니다.
      if (id !== undefined && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

export interface ProposeOptions {
  /**
   * 카운트 기준의 하한. Phase 3.5 에서 활성 구간의 `startedAt` 이 주입된다 (EC-7).
   */
  floorDate: IsoDate;
  /** 현재 수행 중인 프로그램 id. */
  programId: string;
}

/**
 * 전환 제안 판정 (FR-4.1, FR-4.5, FR-4.6, FR-4.10).
 *
 * **순수 함수다.** 상태를 저장하지 않으며, 반환값을 `commitProposal` 에 넘기는 것은 호출자다.
 * 거절 이력은 읽지 않는다 — 쿨다운도 영구 차단도 없다 (FR-4.9).
 */
export function proposeSwitch(
  state: AppState, catalog: Catalog, date: IsoDate, opts: ProposeOptions,
): SwitchProposal | null {
  // 1. 생성은 월요일에만 한다 (FR-4.6).
  if (!isMonday(date)) return null;

  // 2. 다음 순번이 없으면 제안하지 않는다 (FR-4.7).
  const to = nextProgramId(opts.programId);
  if (to === null) return null;

  // 3. 미결 제안은 한 시점에 최대 1개다 (FR-4.6b).
  if (state.proposals.some((p) => p.status === 'pending')) return null;

  // 4. 해금된 종목만 판정 대상이다 (FR-4.5).
  const targets = programProgressions(catalog, opts.programId)
    .filter((id) => checkGate(state, catalog, id).unlocked);

  // 5. 판정할 종목이 없으면 제안하지 않는다.
  if (targets.length === 0) return null;

  // 6. 대상 종목 전부가 승급 후 3회 이상이어야 한다 (FR-4.1).
  const allMet = targets.every(
    (id) => maintenanceCount(state.history, id, opts.floorDate) >= MAINTENANCE_SESSIONS,
  );
  if (!allMet) return null;

  return {
    proposedAt: date,
    fromProgramId: opts.programId,
    toProgramId: to,
    status: 'pending',
    resolvedAt: null,
  };
}

/**
 * 제안을 `proposals` 에 적재한다 (ADR-6).
 * 미결 제안이 이미 있으면 불변식 위반이므로 예외를 던진다 (FR-4.6b).
 */
export function commitProposal(state: AppState, proposal: SwitchProposal): AppState {
  if (state.proposals.some((p) => p.status === 'pending')) {
    throw new Error('불변식 위반: 미결 제안은 한 시점에 최대 1개다');
  }
  return { ...state, proposals: [...state.proposals, proposal] };
}

/**
 * 저장된 미결 제안. 없으면 null (FR-4.6a).
 * **날짜 인자를 받지 않는다** — 승인·거절 전까지 날짜와 무관하게 매일 노출된다.
 */
export function activeProposal(state: AppState): SwitchProposal | null {
  return state.proposals.find((p) => p.status === 'pending') ?? null;
}

/** 미결 제안의 상태를 갱신한다. 미결이 없으면 상태를 그대로 돌려준다 (no-op). */
function resolvePending(
  state: AppState, status: 'accepted' | 'declined', onDate: IsoDate,
): AppState {
  if (!state.proposals.some((p) => p.status === 'pending')) return state;
  return {
    ...state,
    proposals: state.proposals.map(
      (p) => (p.status === 'pending' ? { ...p, status, resolvedAt: onDate } : p),
    ),
  };
}

/**
 * 제안 거절 (FR-4.9).
 * 레코드를 삭제하지 않고 상태만 바꾼다 — 이력은 조회·통계 목적으로 남는다.
 * 이 이력은 재제안을 막는 데 쓰이지 않는다.
 */
export function declineProposal(state: AppState, onDate: IsoDate): AppState {
  return resolvePending(state, 'declined', onDate);
}

/**
 * 제안 승인 기록.
 * **실제 구간 전환은 하지 않는다** — `stints` 갱신은 Phase 3.5 의 책임이다.
 */
export function markAccepted(state: AppState, onDate: IsoDate): AppState {
  return resolvePending(state, 'accepted', onDate);
}
