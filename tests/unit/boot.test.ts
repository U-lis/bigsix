// @vitest-environment happy-dom
//
// 부팅 시퀀스 (FR-3, EC-9, EC-19).
// localStorage 를 만지므로 happy-dom 환경이 필요하다.

import { afterEach, beforeEach, describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { boot } from '../../src/lib/ui/state/boot.ts';
import {
  APP_STATE_KEY,
  CURRENT_SCHEMA_VERSION,
  IN_PROGRESS_KEY,
  draftKey,
  writeAppState,
  writeInProgress,
  type SessionDraft,
} from '../../src/lib/ui/state/storage.ts';
import { initialState } from '../../src/lib/domain/index.ts';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

// ── EC-9 no-program 부팅 & 첫 실행 감지 (FR-3.3, FR-3.5) ──────────────────

describe('boot — EC-9 프로그램 미선택 부팅', () => {
  it('저장 데이터가 전무하면 initialState 로 시작하고 no-program 을 돌려준다', () => {
    const r = boot('2026-09-05');
    // 프로그램을 고른 적이 없으므로 stints 는 빈 배열이고 agenda 는 no-program.
    assert.deepEqual(r.state.stints, []);
    assert.equal(r.agenda.kind, 'no-program');
    if (r.agenda.kind === 'no-program') assert.equal(r.agenda.date, '2026-09-05');
    // 첫 실행 신호가 켜져 있다 (FR-3.5).
    assert.equal(r.needsFirstRun, true);
    // 저장 데이터가 없었으므로 storageStatus 는 empty.
    assert.equal(r.storageStatus, 'empty');
  });
});

// ── 저장 트리거 (FR-3.4) ──────────────────────────────────────────────────

describe('boot — 부팅 시 상태 변경 시 저장 (FR-3.4)', () => {
  it('advanceProposals 가 상태를 바꾸지 않으면 저장하지 않는다', () => {
    // initialState 는 stints 가 비어 있어 advanceProposals 가 아무것도 하지 않는다.
    const before = window.localStorage.getItem(APP_STATE_KEY);
    boot('2026-09-05');
    const after = window.localStorage.getItem(APP_STATE_KEY);
    // 저장 데이터가 없던 상태에서 부팅 → 여전히 저장되지 않는다 (first-run 저장은
    // 사용자가 첫 실행 화면에서 startStep 을 확정할 때 일어난다).
    assert.equal(before, null);
    assert.equal(after, null);
  });

  it('정상 데이터가 있고 상태 변경이 없으면 부팅 후에도 값이 같다', () => {
    const s = initialState();
    writeAppState(s);
    const rawBefore = window.localStorage.getItem(APP_STATE_KEY);
    boot('2026-09-05');
    const rawAfter = window.localStorage.getItem(APP_STATE_KEY);
    assert.equal(rawBefore, rawAfter);
  });
});

// ── 손상 데이터 (FR-1.7 / EC-1 / EC-2) ────────────────────────────────────

describe('boot — 손상된 저장 데이터', () => {
  it('corrupt 감지 시 원본을 지우지 않고 storageStatus=corrupt', () => {
    window.localStorage.setItem(APP_STATE_KEY, '{not json');
    const r = boot('2026-09-05');
    assert.equal(r.storageStatus, 'corrupt');
    assert.equal(r.corruptRaw, '{not json');
    // 원본이 유지된다 (FR-1.7).
    assert.equal(window.localStorage.getItem(APP_STATE_KEY), '{not json');
    // 첫 실행 신호는 켜지 않는다 — 사용자가 "초기 상태로 시작" 을 명시적으로 눌러야 한다.
    assert.equal(r.needsFirstRun, false);
  });
});

// ── 미래 버전 (FR-1.5 / EC-3) ─────────────────────────────────────────────

describe('boot — 미래 버전 감지 시 덮어쓰지 않는다 (EC-3)', () => {
  it('storageStatus=future-version, futureVersion 전달', () => {
    const rawEnv = JSON.stringify({ schemaVersion: 999, appState: initialState() });
    window.localStorage.setItem(APP_STATE_KEY, rawEnv);
    const r = boot('2026-09-05');
    assert.equal(r.storageStatus, 'future-version');
    assert.equal(r.futureVersion, 999);
    // 원본이 유지된다.
    assert.equal(window.localStorage.getItem(APP_STATE_KEY), rawEnv);
    assert.equal(r.needsFirstRun, false);
  });
});

// ── 진행 중 drafts 복원 (FR-2.4 / FR-45 / EC-17) ─────────────────────────

describe('boot — 진행 중 drafts 복원 (FR-2.4 / FR-45)', () => {
  it('저장된 진행 중 drafts 가 있으면 그 맵을 inProgress 로 돌려준다', () => {
    const draft: SessionDraft = {
      startedAt: '2026-09-05',
      progressionId: 'pushup',
      step: 3,
      performedStep: 3,
      kind: 'work',
      workSets: [{ value: 8 }],
    };
    const key = draftKey('pushup', 'work');
    writeInProgress({ [key]: draft });
    const r = boot('2026-09-05');
    assert.ok(r.inProgress !== null);
    assert.deepEqual(Object.keys(r.inProgress!), [key]);
    assert.equal(r.inProgress![key].progressionId, 'pushup');
    assert.equal(r.inProgress![key].workSets.length, 1);
  });

  it('두 종목이 각자의 칸을 가지면 복원 결과도 두 칸이다 (FR-39.2)', () => {
    const d1: SessionDraft = {
      startedAt: '2026-09-05',
      progressionId: 'pushup',
      step: 3,
      performedStep: 3,
      kind: 'work',
      workSets: [{ value: 20 }],
    };
    const d2: SessionDraft = {
      startedAt: '2026-09-05',
      progressionId: 'squat',
      step: 4,
      performedStep: 4,
      kind: 'work',
      workSets: [{ value: 15 }],
    };
    writeInProgress({
      [draftKey('pushup', 'work')]: d1,
      [draftKey('squat', 'work')]: d2,
    });
    const r = boot('2026-09-05');
    assert.ok(r.inProgress !== null);
    assert.deepEqual(
      Object.keys(r.inProgress!).sort(),
      [draftKey('pushup', 'work'), draftKey('squat', 'work')].sort(),
    );
  });

  it('없으면 null', () => {
    const r = boot('2026-09-05');
    assert.equal(r.inProgress, null);
  });

  it('v5 미래 봉투는 조용히 null 로 떨어진다 (R-7 롤백 안전)', () => {
    window.localStorage.setItem(
      IN_PROGRESS_KEY,
      JSON.stringify({ schemaVersion: 999, drafts: {} }),
    );
    const r = boot('2026-09-05');
    assert.equal(r.inProgress, null);
    // AppState 쪽에는 영향 없다 — storageStatus 는 그대로.
    assert.ok(r.storageStatus === 'empty' || r.storageStatus === 'ok');
  });

  // ── SPEC5 EC-98 — v4 진행 중 봉투가 v5 drafts 맵으로 올라온다 ───────────
  it('v4 진행 중 봉투는 drafts 맵의 한 원소로 복원된다 (EC-98 · R-1 target 보존)', () => {
    // v4 는 단일 `inProgress` 세션. target · setRpes · completedAt 는 선택.
    const v4Envelope = {
      schemaVersion: 4,
      inProgress: {
        startedAt: '2026-09-05',
        progressionId: 'pushup',
        step: 3,
        performedStep: 3,
        kind: 'work',
        workSets: [{ value: 10 }, { value: 12, rpe: 7 }],
        target: {
          goal: { label: 'intermediate', sets: 2, value: 10 },
          work: [
            { target: 10, mode: 'fixed' },
            { target: 10, mode: 'fixed' },
          ],
        },
      },
    };
    window.localStorage.setItem(IN_PROGRESS_KEY, JSON.stringify(v4Envelope));

    const r = boot('2026-09-05');
    // 마이그레이션 결과 — drafts 맵이 null 이 아니고 pushup:work 하나가 있다.
    assert.ok(r.inProgress !== null);
    const key = draftKey('pushup', 'work');
    assert.deepEqual(Object.keys(r.inProgress!), [key]);
    const d = r.inProgress![key];
    // 세트 수가 보존된다 (EC-98).
    assert.equal(d.workSets.length, 2);
    assert.equal(d.workSets[0].value, 10);
    assert.equal(d.workSets[1].value, 12);
    assert.equal(d.workSets[1].rpe, 7);
    // target 도 그대로 복사된다 (R-1).
    assert.deepEqual(d.target?.goal, { label: 'intermediate', sets: 2, value: 10 });
    assert.equal(d.target?.work.length, 2);
    // 다른 필드도 그대로.
    assert.equal(d.progressionId, 'pushup');
    assert.equal(d.step, 3);
    assert.equal(d.kind, 'work');
  });

  it('v4 inProgress 가 null 이면 drafts 는 빈 맵으로 복원된다', () => {
    // 세션 없이 봉투만 있는 상태 — 마이그레이션은 빈 맵을 돌려줘야 한다.
    window.localStorage.setItem(
      IN_PROGRESS_KEY,
      JSON.stringify({ schemaVersion: 4, inProgress: null }),
    );
    const r = boot('2026-09-05');
    assert.ok(r.inProgress !== null);
    assert.deepEqual(r.inProgress, {});
  });
});

// ── 순서 검증 (FR-3.1) ────────────────────────────────────────────────────
//
// 정면으로 spy 를 쓰기 어려운 함수들이라, 상태·계약으로 검증한다:
//   - readAppState 결과가 initial 이 되고
//   - agenda 는 planOn 이 만든 판별 유니온이며
//   - inProgress 는 readInProgress 결과다.
// EC-19 는 도메인 계약(advanceProposals 가 idempotent)에서 이미 잡히므로
// 부팅 자체는 부팅당 1회 호출만 검증한다.

describe('boot — 결과 형태 (FR-3.1)', () => {
  it('BootResult 는 state·catalog·today·agenda·inProgress·storageStatus·needsFirstRun 을 포함', () => {
    const r = boot('2026-09-05');
    assert.ok(r.state !== null);
    assert.ok(r.catalog !== null);
    assert.equal(r.today, '2026-09-05');
    assert.ok(r.agenda !== null);
    assert.ok('storageStatus' in r);
    assert.ok('needsFirstRun' in r);
  });
});

// ── 봉투 v1 데이터 (FR-1.4) ───────────────────────────────────────────────

describe('boot — v1 데이터를 CURRENT 로 정상 복원 (FR-1.4)', () => {
  it('v1 봉투를 만나면 adjustedAtSessionIndex 가 undefined 로 정상 복원', () => {
    window.localStorage.setItem(
      APP_STATE_KEY,
      JSON.stringify({ schemaVersion: 1, appState: initialState() }),
    );
    const r = boot('2026-09-05');
    assert.equal(r.storageStatus, 'ok');
    assert.equal(r.state.adjustedAtSessionIndex, undefined);
    // v1 이었음을 잊고 CURRENT 로 쓰지 않는다 — 상태 변경이 없으면 write 도 없다.
    // 여기서는 stints 가 비어 있어 advanceProposals 가 상태를 바꾸지 않으므로
    // 저장이 발생하지 않는다.
    const raw = window.localStorage.getItem(APP_STATE_KEY);
    assert.ok(raw !== null);
    const env = JSON.parse(raw as string);
    // 아직 v1 그대로다 — 실제 상태 전이가 일어나야 CURRENT 로 재저장된다.
    assert.equal(env.schemaVersion, 1);
    // FR-28 이 세션 스냅샷 세 필드를 얹으며 v4 로 올렸다.
    assert.equal(CURRENT_SCHEMA_VERSION, 4);
  });
});

// (IN_PROGRESS_KEY export 확인 — 미사용 경고 방지)
void IN_PROGRESS_KEY;
