import { loadCatalog } from '../src/catalog.ts';
import { initialState } from '../src/index.ts';
import type {
  AppState, ProgramStint, ProgressionId, SessionRecord, SwitchProposal,
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

export const targets = (p: { work: { target: number; mode: string }[] }) =>
  p.work.map((w) => `${w.target}${w.mode === 'max' ? '+' : ''}`);
