// 가져오기 검증 (FR-27.2 · EC-63/64/65 · GLOBAL B.5).

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { parseImport } from '../../src/lib/ui/history/importJson.ts';
import { CURRENT_SCHEMA_VERSION } from '../../src/lib/ui/state/storage.ts';
import type { SessionDraft } from '../../src/lib/ui/state/storage.ts';
import { hasAnyDraft } from '../../src/lib/ui/session/stale.ts';
import type { AppState, SessionRecord } from '../../src/lib/domain/types.ts';
import { ALL_UNLOCKED_STEPS, stateAt } from './helpers.ts';

// ── 픽스처 ──────────────────────────────────────────────────────────────────

function baseMeta(schemaVersion: number = CURRENT_SCHEMA_VERSION): Record<string, unknown> {
  return {
    app: 'bigsix',
    version: '0.2.0-test',
    commit: 'testcmt',
    exportedAt: '2026-09-18T13:45:23+09:00',
    schemaVersion,
  };
}

function stateWithHistory(history: SessionRecord[] = []): AppState {
  return stateAt(ALL_UNLOCKED_STEPS, history);
}

/** 유효한 파일 문자열을 만든다. schemaVersion 을 손대 미래 버전 케이스도 만든다. */
function fileText(state: AppState, schemaVersion: number = CURRENT_SCHEMA_VERSION): string {
  return JSON.stringify({
    meta: baseMeta(schemaVersion),
    appState: state,
    catalog: { progressions: {} }, // 가져오기는 catalog 를 무시한다.
  });
}

// ── 1) JSON 아님 ────────────────────────────────────────────────────────────

describe('parseImport — JSON 파싱 실패 (EC-64)', () => {
  it('빈 문자열이면 { ok: false, reason: not-json }', () => {
    const r = parseImport('', stateWithHistory());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'not-json');
  });

  it('깨진 JSON 이면 { ok: false, reason: not-json }', () => {
    const r = parseImport('{not json', stateWithHistory());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'not-json');
  });

  it('JSON 원시값(문자열)은 not-json', () => {
    // JSON.parse('"x"') 는 성공하지만 최상위가 객체가 아니라 봉투를 조립할 수 없다.
    const r = parseImport('"just a string"', stateWithHistory());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'not-json');
  });

  it('JSON 배열은 meta 없음이라 schema-missing', () => {
    // 배열도 typeof === 'object'. bigsix 파일이 아니라는 사유가 더 자연스럽다.
    const r = parseImport('[1, 2, 3]', stateWithHistory());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'schema-missing');
  });
});

// ── 2) schema-missing ──────────────────────────────────────────────────────

describe('parseImport — schema-missing', () => {
  it('meta 자체가 없으면 { ok: false, reason: schema-missing }', () => {
    const text = JSON.stringify({ appState: stateWithHistory() });
    const r = parseImport(text, stateWithHistory());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'schema-missing');
  });

  it('meta.schemaVersion 이 숫자가 아니면 schema-missing', () => {
    const text = JSON.stringify({
      meta: { ...baseMeta(), schemaVersion: 'four' },
      appState: stateWithHistory(),
    });
    const r = parseImport(text, stateWithHistory());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'schema-missing');
  });

  it('meta 가 null 이면 schema-missing', () => {
    const text = JSON.stringify({ meta: null, appState: stateWithHistory() });
    const r = parseImport(text, stateWithHistory());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'schema-missing');
  });
});

// ── 3) shape (EC-64) ────────────────────────────────────────────────────────

describe('parseImport — shape (EC-64)', () => {
  it('appState 필드 자체가 없으면 { ok: false, reason: shape }', () => {
    const text = JSON.stringify({ meta: baseMeta() });
    const r = parseImport(text, stateWithHistory());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'shape');
  });

  it('appState 가 객체가 아니면 shape', () => {
    const text = JSON.stringify({ meta: baseMeta(), appState: 'not an object' });
    const r = parseImport(text, stateWithHistory());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'shape');
  });

  it('필수 필드(history 등)가 없으면 shape', () => {
    const text = JSON.stringify({
      meta: baseMeta(),
      appState: { steps: {} }, // history / stints / proposals 없음.
    });
    const r = parseImport(text, stateWithHistory());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'shape');
  });
});

// ── 4) future-version (EC-63) ──────────────────────────────────────────────

describe('parseImport — future-version (EC-63)', () => {
  it('schemaVersion > CURRENT 이면 { ok: false, reason: future-version, detail }', () => {
    const text = fileText(stateWithHistory(), CURRENT_SCHEMA_VERSION + 1);
    const r = parseImport(text, stateWithHistory());
    assert.equal(r.ok, false);
    if (!r.ok && r.reason === 'future-version') {
      assert.equal(r.detail, String(CURRENT_SCHEMA_VERSION + 1));
    } else {
      assert.fail('reason: future-version 이어야 한다');
    }
  });
});

// ── 5) v1~v3 파일 (EC-65) ────────────────────────────────────────────────

describe('parseImport — 옛 버전은 마이그레이션 체인을 탄다 (EC-65)', () => {
  it('v1 파일이 정상적으로 통과한다', () => {
    const text = fileText(stateWithHistory(), 1);
    const r = parseImport(text, stateWithHistory());
    assert.equal(r.ok, true);
  });

  it('v2 파일이 정상적으로 통과한다', () => {
    const text = fileText(stateWithHistory(), 2);
    const r = parseImport(text, stateWithHistory());
    assert.equal(r.ok, true);
  });

  it('v3 파일이 정상적으로 통과한다', () => {
    const text = fileText(stateWithHistory(), 3);
    const r = parseImport(text, stateWithHistory());
    assert.equal(r.ok, true);
  });
});

// ── 6) 정상 (counts) ────────────────────────────────────────────────────────

describe('parseImport — 정상 파일과 counts', () => {
  it('ok: true 일 때 counts.current === current.history.length', () => {
    const current = stateWithHistory([
      { date: '2026-09-10', progressionId: 'pushup', step: 3, sets: [10, 10], kind: 'work' },
      { date: '2026-09-12', progressionId: 'pushup', step: 3, sets: [10, 10], kind: 'work' },
    ]);
    const incoming = stateWithHistory([
      { date: '2026-09-01', progressionId: 'pushup', step: 3, sets: [10], kind: 'work' },
    ]);
    const r = parseImport(fileText(incoming), current);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.counts.current, 2);
      assert.equal(r.counts.incoming, 1);
    }
  });

  it('currentRange · incomingRange 가 첫/마지막 record.date', () => {
    const current = stateWithHistory([
      { date: '2026-09-10', progressionId: 'pushup', step: 3, sets: [10, 10], kind: 'work' },
      { date: '2026-09-12', progressionId: 'pushup', step: 3, sets: [10, 10], kind: 'work' },
      { date: '2026-09-14', progressionId: 'pushup', step: 3, sets: [10, 10], kind: 'work' },
    ]);
    const incoming = stateWithHistory([
      { date: '2026-08-01', progressionId: 'squat', step: 3, sets: [10], kind: 'work' },
      { date: '2026-08-05', progressionId: 'squat', step: 3, sets: [10], kind: 'work' },
    ]);
    const r = parseImport(fileText(incoming), current);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.counts.currentRange, { from: '2026-09-10', to: '2026-09-14' });
      assert.deepEqual(r.counts.incomingRange, { from: '2026-08-01', to: '2026-08-05' });
    }
  });

  it('history 가 비었으면 range 는 null', () => {
    const r = parseImport(fileText(stateWithHistory()), stateWithHistory());
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.counts.currentRange, null);
      assert.equal(r.counts.incomingRange, null);
    }
  });

  it('가져온 appState 가 원본과 깊은 동등하다 (참조는 새로 만들어짐)', () => {
    const incoming = stateWithHistory([
      { date: '2026-09-15', progressionId: 'pushup', step: 3, sets: [10, 10], kind: 'work' },
    ]);
    const r = parseImport(fileText(incoming), stateWithHistory());
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.appState, incoming);
  });
});

// ── SPEC5 FR-45.4 — drafts 맵에 하나라도 있으면 가져오기 차단 ───────────
//
// ExportBar.svelte 의 derived 식(`hasAnyDraft(inProgress.drafts)`) 을 쓰는
// 순수 함수 `hasAnyDraft` 를 그대로 호출해 검증한다. 다중 칸 모델에서
// 「진행 중이 있는가」는 drafts 맵이 비어 있지 않다는 사실 하나다.
// ImportDialog 쪽 `hasInProgress` 분기는 이 bool 하나를 받아
// `data-import-block="inprogress"` 을 켠다.

describe('hasAnyDraft — 가져오기 차단 조건 (SPEC5 FR-45.4 / EC-62)', () => {
  it('drafts 가 빈 맵이면 false', () => {
    assert.equal(hasAnyDraft({}), false);
  });

  it('work 칸이 하나 있으면 true', () => {
    const draft: SessionDraft = {
      startedAt: '2026-10-08',
      progressionId: 'pushup',
      step: 3,
      performedStep: 3,
      kind: 'work',
      workSets: [],
    };
    assert.equal(hasAnyDraft({ 'pushup:work': draft }), true);
  });
});
