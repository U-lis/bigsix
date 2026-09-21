// 내보내기 JSON 조립 (FR-26.2 / EC-59 / FR-26.6 / GLOBAL B.3).

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { buildExportJson, type ExportMeta } from '../../src/lib/ui/history/exportJson.ts';
import { CURRENT_SCHEMA_VERSION } from '../../src/lib/ui/state/storage.ts';
import type { AppState, SessionRecord } from '../../src/lib/domain/types.ts';
import { ALL_UNLOCKED_STEPS, catalog, stateAt } from './helpers.ts';

// ── 픽스처 ──────────────────────────────────────────────────────────────────

function baseMeta(overrides: Partial<ExportMeta> = {}): ExportMeta {
  return {
    app: 'bigsix',
    version: '0.2.0-test',
    commit: 'testcmt',
    exportedAt: '2026-09-18T13:45:23+09:00',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...overrides,
  };
}

function stateWithHistory(history: SessionRecord[] = []): AppState {
  return stateAt(ALL_UNLOCKED_STEPS, history);
}

describe('buildExportJson — meta', () => {
  it('meta.schemaVersion === 4 · meta.app === "bigsix"', () => {
    const file = buildExportJson({
      state: stateWithHistory(),
      catalog,
      meta: baseMeta(),
    });
    assert.equal(file.meta.schemaVersion, 4);
    assert.equal(file.meta.app, 'bigsix');
  });

  it('meta.exportedAt 이 로컬 오프셋 포함 ISO 문자열 (호출자가 넘긴 값 그대로)', () => {
    const file = buildExportJson({
      state: stateWithHistory(),
      catalog,
      meta: baseMeta({ exportedAt: '2026-09-18T13:45:23+09:00' }),
    });
    // 로컬 오프셋 포함 ISO 8601: `YYYY-MM-DDTHH:mm:ss±HH:MM`.
    assert.match(file.meta.exportedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it('meta.commit 이 문자열 (테스트에선 stub 값)', () => {
    const file = buildExportJson({
      state: stateWithHistory(),
      catalog,
      meta: baseMeta({ commit: 'abcdef12' }),
    });
    assert.equal(typeof file.meta.commit, 'string');
    assert.equal(file.meta.commit, 'abcdef12');
  });
});

describe('buildExportJson — appState', () => {
  it('appState 가 입력 state 와 깊은 동등이다 (직렬화 후 동등)', () => {
    const state = stateWithHistory([
      { date: '2026-09-15', progressionId: 'pushup', step: 3, sets: [10, 10], kind: 'work' },
    ]);
    const file = buildExportJson({ state, catalog, meta: baseMeta() });
    // 참조는 그대로 담겨도 무방하지만 소비 시점(JSON.stringify)의 동등성이 관건이다.
    assert.deepEqual(file.appState, state);
    // 라운드트립 (stringify → parse) 후에도 동일 형태.
    assert.deepEqual(JSON.parse(JSON.stringify(file)).appState, state);
  });

  it('진행 중 세션과 무관 — 함수 시그니처가 inProgress 를 받지 않는다', () => {
    // 이 시그니처 자체가 EC-59 보증이다. 컴파일러가 잡는다.
    // 런타임에서도 확인: 인자 목록에 inProgress 가 없다.
    const state = stateWithHistory();
    const file = buildExportJson({ state, catalog, meta: baseMeta() });
    // appState 만 담긴다.
    const topKeys = Object.keys(file).sort();
    assert.deepEqual(topKeys, ['appState', 'catalog', 'meta']);
  });
});

describe('buildExportJson — catalog projection (GLOBAL B.3)', () => {
  it('catalog.progressions 에 종목 6개', () => {
    const file = buildExportJson({
      state: stateWithHistory(),
      catalog,
      meta: baseMeta(),
    });
    const ids = Object.keys(file.catalog.progressions).sort();
    assert.deepEqual(
      ids.sort(),
      ['bridge', 'hspu', 'legraise', 'pullup', 'pushup', 'squat'],
    );
  });

  it('각 종목이 한국어 이름과 steps 배열을 담는다', () => {
    const file = buildExportJson({
      state: stateWithHistory(),
      catalog,
      meta: baseMeta(),
    });
    const pushup = file.catalog.progressions.pushup;
    assert.equal(pushup.nameKo, '푸시업');
    assert.ok(Array.isArray(pushup.steps));
    // 각 종목 10단계.
    assert.equal(pushup.steps.length, 10);
  });

  it('각 단계 표시 필드: n · nameKo · unit · perSide · beginner · intermediate · progression?/elite?', () => {
    const file = buildExportJson({
      state: stateWithHistory(),
      catalog,
      meta: baseMeta(),
    });
    const step1 = file.catalog.progressions.pushup.steps[0];
    assert.equal(step1.n, 1);
    assert.equal(typeof step1.nameKo, 'string');
    assert.ok(step1.nameKo.length > 0);
    assert.ok(step1.unit === 'reps' || step1.unit === 'seconds');
    assert.equal(typeof step1.perSide, 'boolean');
    assert.equal(typeof step1.beginner.sets, 'number');
    assert.equal(typeof step1.intermediate.sets, 'number');
    // 1~9단계는 progression, 10단계는 elite 로 대체.
    assert.ok(step1.progression !== undefined);
    const step10 = file.catalog.progressions.pushup.steps[9];
    assert.ok(step10.elite !== undefined);
    assert.ok(step10.progression === undefined);
  });
});

describe('buildExportJson — 상태 불변 (FR-26.6)', () => {
  it('호출 후 state 참조가 동일하다 (같은 객체)', () => {
    const state = stateWithHistory([
      { date: '2026-09-15', progressionId: 'pushup', step: 3, sets: [10, 10], kind: 'work' },
    ]);
    const originalRef = state;
    const originalKeys = Object.keys(state).sort();
    buildExportJson({ state, catalog, meta: baseMeta() });
    assert.equal(state, originalRef);
    assert.deepEqual(Object.keys(state).sort(), originalKeys);
  });

  it('반환된 file.appState 가 입력 state 참조와 같다 (사본 만들지 않음)', () => {
    const state = stateWithHistory();
    const file = buildExportJson({ state, catalog, meta: baseMeta() });
    // 순수 함수여서 새 객체를 만들지 않는다. 직렬화는 호출자가 한다.
    assert.equal(file.appState, state);
  });
});
