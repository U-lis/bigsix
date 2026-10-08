// @vitest-environment happy-dom
//
// Phase 1: storage v5 (SPEC5 FR-45 · EC-98 · ADR-43).
// `APP_STATE_SCHEMA_VERSION`(4) 와 `IN_PROGRESS_SCHEMA_VERSION`(5) 분리,
// v4(단일 세션) → v5(drafts 맵) 마이그레이션, `SessionDraft` 모양 검증,
// `draftKey` 순수 함수.

import { afterEach, beforeEach, describe, it } from 'vitest';
import assert from 'node:assert/strict';

import {
  APP_STATE_KEY,
  APP_STATE_SCHEMA_VERSION,
  IN_PROGRESS_KEY,
  IN_PROGRESS_SCHEMA_VERSION,
  draftKey,
  readAppState,
  readInProgress,
  writeInProgress,
  type SessionDraft,
} from '../../../src/lib/ui/state/storage.ts';
import { initialState } from '../../../src/lib/domain/index.ts';
import type { SessionTarget } from '../../../src/lib/domain/types.ts';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

// ── 버전 상수 분리 ────────────────────────────────────────────────────────

describe('스키마 버전 상수 분리 (ADR-43)', () => {
  it('APP_STATE_SCHEMA_VERSION 은 4', () => {
    assert.equal(APP_STATE_SCHEMA_VERSION, 4);
  });

  it('IN_PROGRESS_SCHEMA_VERSION 은 5', () => {
    assert.equal(IN_PROGRESS_SCHEMA_VERSION, 5);
  });
});

// ── draftKey — 순수 함수 (ADR-41) ─────────────────────────────────────────

describe('draftKey — 칸 키 규약 (ADR-41)', () => {
  it(`draftKey('pushup', 'work') === 'pushup:work'`, () => {
    assert.equal(draftKey('pushup', 'work'), 'pushup:work');
  });

  it(`draftKey('squat', 'consolidation') === 'squat:consolidation'`, () => {
    assert.equal(draftKey('squat', 'consolidation'), 'squat:consolidation');
  });

  it(`draftKey('pullup', 'free') === 'pullup:free'`, () => {
    assert.equal(draftKey('pullup', 'free'), 'pullup:free');
  });
});

// ── v4 → v5 마이그레이션 (EC-98 / R-1) ────────────────────────────────────

const sampleTarget: SessionTarget = {
  goal: { label: 'progression', sets: 2, value: 20 },
  work: [
    { target: 20, mode: 'fixed' },
    { target: 20, mode: 'fixed' },
  ],
};

describe('v4 → v5 마이그레이션 (EC-98)', () => {
  it('v4 단일 세션 봉투 → v5 drafts 맵의 한 원소로 복원된다', () => {
    const v4 = {
      schemaVersion: 4,
      inProgress: {
        startedAt: '2026-10-01',
        progressionId: 'pushup',
        step: 4,
        performedStep: 4,
        kind: 'work',
        workSets: [{ value: 20, rpe: 7 }],
      },
    };
    window.localStorage.setItem(IN_PROGRESS_KEY, JSON.stringify(v4));

    const r = readInProgress();
    assert.equal(r.status, 'ok');
    if (r.status !== 'ok') return;

    const key = draftKey('pushup', 'work');
    const keys = Object.keys(r.value);
    assert.deepEqual(keys, [key]);
    assert.equal(r.value[key].progressionId, 'pushup');
    assert.equal(r.value[key].kind, 'work');
    assert.equal(r.value[key].workSets.length, 1);
    assert.equal(r.value[key].workSets[0].value, 20);
  });

  it('v4 마이그레이션 시 target 필드가 손실되지 않는다 (R-1)', () => {
    const v4 = {
      schemaVersion: 4,
      inProgress: {
        startedAt: '2026-10-01',
        progressionId: 'pushup',
        step: 4,
        performedStep: 4,
        kind: 'work',
        workSets: [],
        target: sampleTarget,
      },
    };
    window.localStorage.setItem(IN_PROGRESS_KEY, JSON.stringify(v4));

    const r = readInProgress();
    assert.equal(r.status, 'ok');
    if (r.status !== 'ok') return;
    const key = draftKey('pushup', 'work');
    assert.deepEqual(r.value[key].target, sampleTarget);
  });

  it('v4 봉투에 inProgress 가 없으면 빈 drafts 맵으로 복원된다', () => {
    const v4 = { schemaVersion: 4, inProgress: null };
    window.localStorage.setItem(IN_PROGRESS_KEY, JSON.stringify(v4));

    const r = readInProgress();
    assert.equal(r.status, 'ok');
    if (r.status !== 'ok') return;
    assert.deepEqual(r.value, {});
  });
});

// ── v5 라운드트립 ─────────────────────────────────────────────────────────

describe('readInProgress / writeInProgress — v5 drafts 맵', () => {
  it('writeInProgress(drafts) 로 쓴 봉투의 schemaVersion 은 5다', () => {
    const key = draftKey('pushup', 'work');
    const draft: SessionDraft = {
      startedAt: '2026-10-01',
      progressionId: 'pushup',
      step: 3,
      performedStep: 3,
      kind: 'work',
      workSets: [{ value: 20 }],
    };
    writeInProgress({ [key]: draft });

    const raw = window.localStorage.getItem(IN_PROGRESS_KEY);
    assert.ok(raw !== null);
    const env = JSON.parse(raw as string);
    assert.equal(env.schemaVersion, 5);
  });

  it('readInProgress() 는 v5 봉투를 { status: ok, value: drafts } 로 반환한다', () => {
    const key = draftKey('pushup', 'work');
    const draft: SessionDraft = {
      startedAt: '2026-10-01',
      progressionId: 'pushup',
      step: 3,
      performedStep: 3,
      kind: 'work',
      workSets: [{ value: 20, rpe: 7 }],
      target: sampleTarget,
    };
    writeInProgress({ [key]: draft });

    const r = readInProgress();
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') {
      assert.deepEqual(r.value, { [key]: draft });
    }
  });

  it('두 종목의 draft 가 공존한다', () => {
    const k1 = draftKey('pushup', 'work');
    const k2 = draftKey('squat', 'work');
    const d1: SessionDraft = {
      startedAt: '2026-10-01',
      progressionId: 'pushup',
      step: 3,
      performedStep: 3,
      kind: 'work',
      workSets: [{ value: 20 }],
    };
    const d2: SessionDraft = {
      startedAt: '2026-10-01',
      progressionId: 'squat',
      step: 4,
      performedStep: 4,
      kind: 'work',
      workSets: [{ value: 15 }],
    };
    writeInProgress({ [k1]: d1, [k2]: d2 });

    const r = readInProgress();
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') {
      assert.deepEqual(Object.keys(r.value).sort(), [k1, k2].sort());
      assert.deepEqual(r.value[k1], d1);
      assert.deepEqual(r.value[k2], d2);
    }
  });

  it('abandoned 와 linkedTo 필드가 저장·복원된다', () => {
    const workKey = draftKey('pushup', 'work');
    const consKey = draftKey('pushup', 'consolidation');
    const workDraft: SessionDraft = {
      startedAt: '2026-10-01',
      progressionId: 'pushup',
      step: 4,
      performedStep: 4,
      kind: 'work',
      workSets: [],
      abandoned: true,
    };
    const consDraft: SessionDraft = {
      startedAt: '2026-10-01',
      progressionId: 'pushup',
      step: 4,
      performedStep: 3,
      kind: 'consolidation',
      workSets: [],
      linkedTo: workKey,
    };
    writeInProgress({ [workKey]: workDraft, [consKey]: consDraft });

    const r = readInProgress();
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') {
      assert.equal(r.value[workKey].abandoned, true);
      assert.equal(r.value[consKey].linkedTo, workKey);
    }
  });

  it('빈 맵도 유효하다', () => {
    writeInProgress({});
    const r = readInProgress();
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') assert.deepEqual(r.value, {});
  });
});

// ── 미래 버전 — in-progress 봉투 ──────────────────────────────────────────

describe('readInProgress — 미래 버전', () => {
  it('schemaVersion 6 봉투는 future-version 을 반환한다', () => {
    window.localStorage.setItem(
      IN_PROGRESS_KEY,
      JSON.stringify({ schemaVersion: 6, drafts: {} }),
    );
    const r = readInProgress();
    assert.equal(r.status, 'future-version');
    if (r.status === 'future-version') assert.equal(r.version, 6);
  });
});

// ── 손상된 v5 봉투 ────────────────────────────────────────────────────────

describe('readInProgress — 손상된 v5 봉투', () => {
  it('drafts 필드가 객체가 아니면 corrupt', () => {
    window.localStorage.setItem(
      IN_PROGRESS_KEY,
      JSON.stringify({ schemaVersion: 5, drafts: 'oops' }),
    );
    const r = readInProgress();
    assert.equal(r.status, 'corrupt');
  });

  it('drafts 의 원소가 SessionDraft 형태를 벗어나면 corrupt', () => {
    window.localStorage.setItem(
      IN_PROGRESS_KEY,
      JSON.stringify({
        schemaVersion: 5,
        drafts: {
          'pushup:work': {
            // startedAt 누락.
            progressionId: 'pushup',
            step: 3,
            performedStep: 3,
            kind: 'work',
            workSets: [],
          },
        },
      }),
    );
    const r = readInProgress();
    assert.equal(r.status, 'corrupt');
  });
});

// ── AppState 봉투는 v4 그대로 — v5 는 future-version 처리 ─────────────────

describe('readAppState — APP_STATE_SCHEMA_VERSION 기준 (4)', () => {
  it('v4 AppState 봉투는 정상 복원된다', () => {
    const s = initialState();
    window.localStorage.setItem(
      APP_STATE_KEY,
      JSON.stringify({ schemaVersion: APP_STATE_SCHEMA_VERSION, appState: s }),
    );
    const r = readAppState();
    assert.equal(r.status, 'ok');
  });

  it('v5 AppState 봉투는 future-version 으로 거절된다', () => {
    const s = initialState();
    window.localStorage.setItem(
      APP_STATE_KEY,
      JSON.stringify({ schemaVersion: 5, appState: s }),
    );
    const r = readAppState();
    assert.equal(r.status, 'future-version');
    if (r.status === 'future-version') assert.equal(r.version, 5);
  });
});
