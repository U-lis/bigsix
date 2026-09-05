// @vitest-environment happy-dom
//
// 저장 계층 테스트 (FR-1, EC-1~5).
// localStorage 를 만지므로 happy-dom 환경이 필요하다. 도메인 테스트는 여전히
// node 환경에서 돈다 (vitest.config.ts 는 전역 node 로 둠).

import { afterEach, beforeEach, describe, it } from 'vitest';
import assert from 'node:assert/strict';

import {
  APP_STATE_KEY,
  CURRENT_SCHEMA_VERSION,
  IN_PROGRESS_KEY,
  clearAppState,
  clearInProgress,
  readAppState,
  readInProgress,
  writeAppState,
  writeInProgress,
  type InProgressSession,
} from '../../src/lib/ui/storage.ts';
import { initialState } from '../../src/lib/domain/index.ts';
import type { AppState } from '../../src/lib/domain/types.ts';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

// ── AppState 저장·복원 ────────────────────────────────────────────────────

describe('readAppState — 빈 저장 (EC 없음: 첫 실행)', () => {
  it('저장된 값이 없으면 status: empty', () => {
    const r = readAppState();
    assert.equal(r.status, 'empty');
  });
});

describe('readAppState — 정상 라운드트립', () => {
  it('write 한 값을 read 로 그대로 돌려받는다', () => {
    const s = initialState();
    writeAppState(s);
    const r = readAppState();
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') {
      assert.deepEqual(r.value, s);
    }
  });

  it('AppState 는 봉투 필드에 오염되지 않는다 (FR-1.2 / FR-1.9)', () => {
    const s = initialState();
    writeAppState(s);
    const raw = window.localStorage.getItem(APP_STATE_KEY);
    assert.ok(raw !== null);
    const env = JSON.parse(raw as string);
    assert.equal(env.schemaVersion, CURRENT_SCHEMA_VERSION);
    // appState 안에 schemaVersion 이 섞이지 않는다.
    assert.equal(
      (env.appState as Record<string, unknown>).schemaVersion,
      undefined,
    );
  });
});

describe('readAppState — JSON 파싱 실패 (EC-1)', () => {
  it('깨진 JSON 을 만나면 status: corrupt, raw 는 그대로', () => {
    window.localStorage.setItem(APP_STATE_KEY, '{not json');
    const r = readAppState();
    assert.equal(r.status, 'corrupt');
    if (r.status === 'corrupt') assert.equal(r.raw, '{not json');
    // 원본이 지워지지 않았다 (FR-1.7).
    assert.equal(window.localStorage.getItem(APP_STATE_KEY), '{not json');
  });
});

describe('readAppState — 필수 필드 누락 (EC-2)', () => {
  it('appState.steps 가 없으면 corrupt', () => {
    window.localStorage.setItem(
      APP_STATE_KEY,
      JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, appState: {} }),
    );
    const r = readAppState();
    assert.equal(r.status, 'corrupt');
  });

  it('schemaVersion 이 없으면 corrupt', () => {
    window.localStorage.setItem(
      APP_STATE_KEY,
      JSON.stringify({ appState: initialState() }),
    );
    const r = readAppState();
    assert.equal(r.status, 'corrupt');
  });
});

describe('readAppState — 미래 버전 (EC-3)', () => {
  it('CURRENT 보다 큰 schemaVersion 이면 future-version', () => {
    window.localStorage.setItem(
      APP_STATE_KEY,
      JSON.stringify({ schemaVersion: 999, appState: initialState() }),
    );
    const r = readAppState();
    assert.equal(r.status, 'future-version');
    if (r.status === 'future-version') assert.equal(r.version, 999);
  });

  it('writeAppState 를 호출하지 않고 read 하면 미래 데이터가 그대로 남아 있다', () => {
    const rawEnv = { schemaVersion: 999, appState: initialState() };
    window.localStorage.setItem(APP_STATE_KEY, JSON.stringify(rawEnv));
    // 명시적으로 write 를 하지 않는 상황을 시뮬레이션 — future-version 을 만난 앱은
    // apply() 에서도 저장하지 않는다 (FR-1.5).
    const r1 = readAppState();
    assert.equal(r1.status, 'future-version');
    // 원본이 유지된다.
    const raw = window.localStorage.getItem(APP_STATE_KEY);
    assert.deepEqual(JSON.parse(raw as string), rawEnv);
  });
});

describe('writeAppState — 쓰기 실패 (EC-4)', () => {
  it('localStorage 접근이 throw 하면 예외가 위로 전파된다', () => {
    // happy-dom 의 Storage prototype 은 non-configurable 속성이 많다.
    // globalThis.localStorage 자체를 던지는 프록시로 바꾼다 — 사생활 보호 모드가
    // 접근 자체를 막는 실제 브라우저 동작과 같은 형태다.
    const original = Object.getOwnPropertyDescriptor(
      globalThis as object,
      'localStorage',
    );
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('QuotaExceededError: blocked');
      },
    });
    try {
      assert.throws(() => writeAppState(initialState()), /Quota/);
    } finally {
      if (original !== undefined) {
        Object.defineProperty(globalThis, 'localStorage', original);
      }
    }
  });
});

describe('readAppState — EC-5 localStorage 자체 접근 차단 (@vitest-environment happy-dom)', () => {
  it('window.localStorage 접근이 예외를 던지면 read-blocked', () => {
    const original = Object.getOwnPropertyDescriptor(
      globalThis as object,
      'localStorage',
    );
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked by privacy mode');
      },
    });
    try {
      const r = readAppState();
      assert.equal(r.status, 'read-blocked');
      if (r.status === 'read-blocked') {
        assert.ok(r.error instanceof Error);
      }
    } finally {
      if (original !== undefined) {
        Object.defineProperty(globalThis, 'localStorage', original);
      }
    }
  });
});

// ── 마이그레이션 체인 (FR-1.4) ────────────────────────────────────────────

describe('마이그레이션 체인 — v1 → v2 (FR-1.4)', () => {
  it('v1 데이터(adjustedAtSessionIndex 없음)를 읽으면 필드가 undefined 로 정상 복원', () => {
    const v1AppState = initialState();
    // v1 은 이 필드가 없다. 봉투 버전만 1 로 저장.
    window.localStorage.setItem(
      APP_STATE_KEY,
      JSON.stringify({ schemaVersion: 1, appState: v1AppState }),
    );
    const r = readAppState();
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') {
      assert.equal(r.value.adjustedAtSessionIndex, undefined);
      // 나머지 필드는 정상 복원된다.
      assert.deepEqual(r.value.steps, v1AppState.steps);
      assert.deepEqual(r.value.history, v1AppState.history);
    }
  });

  it('v1 데이터에 adjustedAtSessionIndex 가 이미 있어도 그대로 유지된다', () => {
    const v1WithAnchor: AppState = {
      ...initialState(),
      adjustedAtSessionIndex: { pushup: 3 },
    };
    window.localStorage.setItem(
      APP_STATE_KEY,
      JSON.stringify({ schemaVersion: 1, appState: v1WithAnchor }),
    );
    const r = readAppState();
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') {
      assert.deepEqual(r.value.adjustedAtSessionIndex, { pushup: 3 });
    }
  });
});

// ── AppState / InProgress 는 별도 키 (FR-2.6) ────────────────────────────

describe('AppState 와 진행 중 세션은 별도 키 (FR-2.6)', () => {
  it('writeAppState 는 IN_PROGRESS_KEY 를 건드리지 않는다', () => {
    window.localStorage.setItem(IN_PROGRESS_KEY, 'sentinel');
    writeAppState(initialState());
    assert.equal(window.localStorage.getItem(IN_PROGRESS_KEY), 'sentinel');
  });

  it('writeInProgress 는 APP_STATE_KEY 를 건드리지 않는다', () => {
    window.localStorage.setItem(APP_STATE_KEY, 'sentinel');
    const ip: InProgressSession = {
      startedAt: '2026-09-05',
      progressionId: 'pushup',
      step: 3,
      performedStep: 3,
      kind: 'work',
      workSets: [],
    };
    writeInProgress(ip);
    assert.equal(window.localStorage.getItem(APP_STATE_KEY), 'sentinel');
  });
});

// ── InProgressSession 저장·복원 (FR-2) ────────────────────────────────────

describe('readInProgress / writeInProgress — 라운드트립', () => {
  it('write 한 값을 그대로 돌려받는다', () => {
    const ip: InProgressSession = {
      startedAt: '2026-09-05',
      progressionId: 'pushup',
      step: 4,
      performedStep: 4,
      kind: 'work',
      workSets: [{ value: 20, rpe: 7 }, { value: 18 }],
    };
    writeInProgress(ip);
    const r = readInProgress();
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') assert.deepEqual(r.value, ip);
  });

  it('저장된 값이 없으면 empty', () => {
    const r = readInProgress();
    assert.equal(r.status, 'empty');
  });

  it('필수 필드 누락은 corrupt', () => {
    window.localStorage.setItem(
      IN_PROGRESS_KEY,
      JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, inProgress: { startedAt: '2026-09-05' } }),
    );
    const r = readInProgress();
    assert.equal(r.status, 'corrupt');
  });

  it('미래 버전은 future-version', () => {
    window.localStorage.setItem(
      IN_PROGRESS_KEY,
      JSON.stringify({ schemaVersion: 999, inProgress: {} }),
    );
    const r = readInProgress();
    assert.equal(r.status, 'future-version');
  });
});

describe('clearAppState / clearInProgress', () => {
  it('명시 clear 는 해당 키만 지운다', () => {
    writeAppState(initialState());
    writeInProgress({
      startedAt: '2026-09-05',
      progressionId: 'pushup',
      step: 3,
      performedStep: 3,
      kind: 'work',
      workSets: [],
    });
    clearAppState();
    assert.equal(window.localStorage.getItem(APP_STATE_KEY), null);
    // in-progress 는 남아 있다.
    assert.ok(window.localStorage.getItem(IN_PROGRESS_KEY) !== null);
    clearInProgress();
    assert.equal(window.localStorage.getItem(IN_PROGRESS_KEY), null);
  });
});

// ── FR-20.3 / EC-48: v2 → v3 마이그레이션 (워밍업 제거) ──────────────────

describe('FR-20.3 v2 봉투의 warmupSets 를 버리고 읽는다 (EC-48)', () => {
  beforeEach(() => window.localStorage.clear());

  it('warmupSets 가 들어 있어도 본세트 입력분이 살아남는다', () => {
    // 세션 도중 앱이 갱신된 경우다. 워밍업 값은 의미가 없어졌지만 그것 때문에
    // 본세트 입력분까지 잃으면 안 된다.
    window.localStorage.setItem(
      IN_PROGRESS_KEY,
      JSON.stringify({
        schemaVersion: 2,
        inProgress: {
          startedAt: '2026-09-05',
          progressionId: 'pushup',
          step: 5,
          performedStep: 5,
          kind: 'work',
          warmupSets: [{ value: 10 }, { value: 15 }],
          workSets: [{ value: 20 }],
        },
      }),
    );
    const r = readInProgress();
    assert.equal(r.status, 'ok');
    if (r.status !== 'ok') return;
    assert.deepEqual(r.value.workSets, [{ value: 20 }]);
    assert.equal('warmupSets' in (r.value as unknown as Record<string, unknown>), false);
  });

  it('v3 로 다시 쓰면 warmupSets 가 남지 않는다', () => {
    window.localStorage.setItem(
      IN_PROGRESS_KEY,
      JSON.stringify({
        schemaVersion: 2,
        inProgress: {
          startedAt: '2026-09-05',
          progressionId: 'pushup',
          step: 5,
          performedStep: 5,
          kind: 'work',
          warmupSets: [{ value: 10 }],
          workSets: [],
        },
      }),
    );
    const r = readInProgress();
    assert.equal(r.status, 'ok');
    if (r.status !== 'ok') return;
    writeInProgress(r.value);
    const env = JSON.parse(window.localStorage.getItem(IN_PROGRESS_KEY) as string);
    assert.equal(env.schemaVersion, 3);
    assert.equal('warmupSets' in env.inProgress, false);
  });
});
