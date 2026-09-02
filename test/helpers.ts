import { loadCatalog } from '../src/catalog.ts';
import { initialState } from '../src/index.ts';
import type { AppState, ProgressionId, SessionRecord } from '../src/types.ts';

export const catalog = loadCatalog(new URL('../data/progressions.json', import.meta.url).pathname);

export function stateAt(steps: Partial<Record<ProgressionId, number>>, history: SessionRecord[] = []): AppState {
  const base = initialState(2);
  return { steps: { ...base.steps, ...steps }, history };
}

export function rec(
  progressionId: ProgressionId, step: number, sets: number[],
  extra: Partial<SessionRecord> = {},
): SessionRecord {
  return { date: '2026-09-02', progressionId, step, sets, kind: 'work', ...extra };
}

export const targets = (p: { work: { target: number; mode: string }[] }) =>
  p.work.map((w) => `${w.target}${w.mode === 'max' ? '+' : ''}`);
