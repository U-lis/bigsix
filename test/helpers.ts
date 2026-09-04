import { loadCatalog } from '../src/catalog.ts';
import {
  addDays, checkGate, initialState, programProgressions,
} from '../src/index.ts';
import type {
  AppState, IsoDate, ProgramStint, ProgressionId, SessionRecord, SwitchProposal,
} from '../src/types.ts';

export const catalog = loadCatalog(new URL('../data/progressions.json', import.meta.url).pathname);

/**
 * 테스트용 AppState 픽스처.
 * 이 시그니처는 Phase 3A/3B/3C 가 공유하며 그 Phase 들에서 수정하지 않는다.
 */
export function stateAt(
  steps: Partial<Record<ProgressionId, number>>,
  history: SessionRecord[] = [],
  stints: ProgramStint[] = [],
  proposals: SwitchProposal[] = [],
): AppState {
  const base = initialState(2);
  return { steps: { ...base.steps, ...steps }, history, stints, proposals };
}

export function rec(
  progressionId: ProgressionId, step: number, sets: number[],
  extra: Partial<SessionRecord> = {},
): SessionRecord {
  return { date: '2026-09-02', progressionId, step, sets, kind: 'work', ...extra };
}

// ── Phase 3.5 공통 픽스처 ────────────────────────────────────────────────────
// 세 모듈이 만나는 통합 테스트가 공유한다. 3A/3B/3C 의 로컬 픽스처는 그대로 둔다.

/** 프로그램 구간 하나. `endedAt` 이 null 이면 진행 중이다. */
export function stintFixture(
  programId: string, selectedAt: IsoDate, startedAt: IsoDate,
  endedAt: IsoDate | null = null,
): ProgramStint {
  return { programId, selectedAt, startedAt, endedAt };
}

/** 승급이 일어난 세션. */
export function promoted(id: ProgressionId, step: number, date: IsoDate): SessionRecord {
  return { date, progressionId: id, step, sets: [10, 10], kind: 'work', promotedTo: step + 1 };
}

/** 승급 없는 유지 세션. */
export function plainSession(id: ProgressionId, step: number, date: IsoDate): SessionRecord {
  return { date, progressionId: id, step, sets: [8, 8], kind: 'work' };
}

/** 각 종목을 `promoteDate` 에 승급시키고 그 이후 `n` 회의 유지 세션을 붙인다. */
export function maintainedHistory(
  ids: ProgressionId[], promoteDate: IsoDate, n: number = 3,
): SessionRecord[] {
  const out: SessionRecord[] = [];
  for (const id of ids) {
    out.push(promoted(id, 3, promoteDate));
    for (let i = 1; i <= n; i += 1) out.push(plainSession(id, 4, addDays(promoteDate, i * 2)));
  }
  return out;
}

/** 빅6 전부가 해금되는 단계 조합. 빅4 를 7단계로 올려 게이트를 연다. */
export const ALL_UNLOCKED_STEPS: Partial<Record<ProgressionId, number>> = {
  pushup: 7, squat: 7, pullup: 7, legraise: 7, bridge: 4, hspu: 4,
};

/**
 * 해당 프로그램의 해금된 전 종목이 승급 + 유지 3회를 채운 상태.
 * `startedAt` 이 구간 시작일이자 카운트 하한이고, 승급은 `promoteDate` 에 일어난다.
 */
export function readyForProposal(
  programId: string, startedAt: IsoDate, promoteDate: IsoDate,
): AppState {
  const base = stateAt(ALL_UNLOCKED_STEPS);
  const ids = programProgressions(catalog, programId)
    .filter((id) => checkGate(base, catalog, id).unlocked);
  return stateAt(
    ALL_UNLOCKED_STEPS,
    maintainedHistory(ids, promoteDate),
    [stintFixture(programId, startedAt, startedAt)],
  );
}

export const targets = (p: { work: { target: number; mode: string }[] }) =>
  p.work.map((w) => `${w.target}${w.mode === 'max' ? '+' : ''}`);
