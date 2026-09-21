// 왕복 테스트 (NFR-27).
//
// 임의의 `AppState` → `buildExportJson` → `JSON.stringify` → `JSON.parse`
// → `parseImport` → 결과 `appState` 가 원본과 깊은 동등이어야 한다.

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { buildExportJson, type ExportMeta } from '../../src/lib/ui/history/exportJson.ts';
import { parseImport } from '../../src/lib/ui/history/importJson.ts';
import { CURRENT_SCHEMA_VERSION } from '../../src/lib/ui/state/storage.ts';
import type { AppState, SessionRecord } from '../../src/lib/domain/types.ts';
import { ALL_UNLOCKED_STEPS, catalog, stateAt } from './helpers.ts';

function baseMeta(): ExportMeta {
  return {
    app: 'bigsix',
    version: '0.2.0-roundtrip',
    commit: 'roundtrp',
    exportedAt: '2026-09-18T13:45:23+09:00',
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/** state → JSON 문자열 (내보내기) → parseImport 결과. */
function roundtrip(state: AppState, current: AppState) {
  const file = buildExportJson({ state, catalog, meta: baseMeta() });
  const text = JSON.stringify(file);
  return parseImport(text, current);
}

describe('왕복 (NFR-27) — 내보내기 → 가져오기 결과가 원본과 깊은 동등', () => {
  it('빈 상태 (기록·구간·제안 0개) 도 왕복 후 동등', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, []);
    const r = roundtrip(state, stateAt(ALL_UNLOCKED_STEPS));
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.appState, state);
  });

  it('일반 기록이 있는 상태도 왕복 후 동등', () => {
    const history: SessionRecord[] = [
      { date: '2026-09-01', progressionId: 'pushup', step: 3, sets: [10, 10], kind: 'work' },
      { date: '2026-09-03', progressionId: 'squat', step: 4, sets: [10, 8], kind: 'work', rpe: 8 },
      { date: '2026-09-05', progressionId: 'pullup', step: 2, sets: [5], kind: 'free' },
    ];
    const state = stateAt(ALL_UNLOCKED_STEPS, history);
    const r = roundtrip(state, stateAt(ALL_UNLOCKED_STEPS));
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.appState, state);
  });

  it('adjustedAtSessionIndex 가 있는 상태도 왕복 후 동등', () => {
    const base = stateAt(ALL_UNLOCKED_STEPS, [
      { date: '2026-09-01', progressionId: 'pushup', step: 3, sets: [10, 10], kind: 'work' },
    ]);
    const state: AppState = {
      ...base,
      adjustedAtSessionIndex: { pushup: 0 },
    };
    const r = roundtrip(state, stateAt(ALL_UNLOCKED_STEPS));
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.appState, state);
      // 앵커도 그대로 실렸는지 명시적으로 확인.
      assert.deepEqual(r.appState.adjustedAtSessionIndex, { pushup: 0 });
    }
  });

  it('FR-28 신설 필드(target · setRpes · completedAt) 가 붙은 기록도 왕복 후 동등', () => {
    const history: SessionRecord[] = [
      {
        date: '2026-09-10',
        progressionId: 'pushup',
        step: 5,
        sets: [10, 10, 10],
        kind: 'work',
        rpe: 8,
        setRpes: [7, 8, 8],
        completedAt: '2026-09-10T13:45:23+09:00',
        target: {
          goal: { label: 'intermediate', sets: 3, value: 10 },
          work: [
            { mode: 'fixed', target: 10 },
            { mode: 'fixed', target: 10 },
            { mode: 'max', target: 10 },
          ],
        },
      },
    ];
    const state = stateAt(ALL_UNLOCKED_STEPS, history);
    const r = roundtrip(state, stateAt(ALL_UNLOCKED_STEPS));
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.appState, state);
  });
});
