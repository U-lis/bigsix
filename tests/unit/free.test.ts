import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  applySession, judgingHistory, judgingState, planExercise,
} from '../../src/lib/domain/index.ts';
import type { AppState, SessionInput, SessionRecord } from '../../src/lib/domain/types.ts';
import { catalog, rec, stateAt } from './helpers.ts';

// 자유 운동 입력을 만드는 헬퍼. UI 없이 도메인 계약을 검증한다.
function freeInput(
  progressionId: SessionInput['progressionId'], step: number, sets: number[],
  extra: Partial<SessionInput> = {},
): SessionInput {
  return { date: '2026-09-05', progressionId, step, sets, kind: 'free', ...extra };
}

// ── kind: 'free' 판별 유니온 존재 ───────────────────────────────────────────

test('kind: "free" 세션은 SessionInput / SessionRecord 판별 유니온에 존재한다', () => {
  // 타입 컴파일이 통과하는 것 자체가 검증이다. 런타임에는 형태만 본다.
  const input: SessionInput = freeInput('pushup', 5, [12]);
  const record: SessionRecord = { ...input };
  assert.equal(input.kind, 'free');
  assert.equal(record.kind, 'free');
});

// ── FR-18.4 / EC-40: state.steps 불변 ───────────────────────────────────────

test('FR-18.4 / EC-40 free 로 낮은 단계를 기록해도 state.steps 는 유지된다', () => {
  // 사용자가 7단계까지 왔는데, 그날 3단계를 자유 운동으로 시도한 상황.
  const state = stateAt({ pushup: 7 });
  const input = freeInput('pushup', 3, [50, 50, 50]);
  const result = applySession(state, catalog, input);
  assert.equal(result.state.steps.pushup, 7, 'free 는 단계를 아래로도 위로도 움직이지 않는다');
});

test('FR-18.4 / EC-40 free 로 현재 단계를 기록해도 state.steps 는 유지된다', () => {
  const state = stateAt({ pushup: 5 });
  const input = freeInput('pushup', 5, [10, 10]);
  const result = applySession(state, catalog, input);
  assert.equal(result.state.steps.pushup, 5);
});

// ── FR-18.6 (1) / EC-41: 승급 판정 leak ─────────────────────────────────────

test('FR-18.6 (1) / EC-41 free 로 상급자 기준을 크게 넘겨도 승급하지 않는다', () => {
  // 푸시업 2단계 상급자 기준은 3×40. free 에서 훨씬 넘겨도 승급 없음.
  const state = stateAt({ pushup: 2 });
  const input = freeInput('pushup', 2, [200, 200, 200]);
  const result = applySession(state, catalog, input);
  assert.equal(result.state.steps.pushup, 2);
  assert.equal(result.record.promotedTo, undefined);
});

test('FR-18.6 (1) / EC-41 free 를 여러 번 상급자 기준으로 채워도 승급이 안 발동한다', () => {
  const state = stateAt({ pushup: 2 });
  const inputs = [
    freeInput('pushup', 2, [40, 40, 40], { date: '2026-09-01' }),
    freeInput('pushup', 2, [40, 40, 40], { date: '2026-09-02' }),
    freeInput('pushup', 2, [40, 40, 40], { date: '2026-09-03' }),
  ];
  let cur: AppState = state;
  for (const inp of inputs) cur = applySession(cur, catalog, inp).state;
  assert.equal(cur.steps.pushup, 2, '연속 3회처럼 보여도 판정 대상이 아니다');
  assert.equal(cur.history.filter((r) => r.promotedTo !== undefined).length, 0);
});

// ── free 세션이 evaluateSession 을 우회 ─────────────────────────────────────

test('free 세션은 evaluation.notes 에 자유 운동 안내를 담는다', () => {
  const state = stateAt({ pushup: 5 });
  const result = applySession(state, catalog, freeInput('pushup', 5, [10]));
  assert.ok(result.evaluation.notes.some((n) => n.includes('자유 운동')));
  assert.equal(result.evaluation.promote, false);
});

test('free 세션 record 는 outcome / promotedTo / blockedBy 를 남기지 않는다', () => {
  const state = stateAt({ pushup: 5 });
  const result = applySession(state, catalog, freeInput('pushup', 5, [10]));
  assert.equal(result.record.outcome, undefined);
  assert.equal(result.record.promotedTo, undefined);
  assert.equal(result.record.blockedBy, undefined);
  assert.equal(result.record.kind, 'free');
});

// ── FR-18.6 (2) / EC-44: 다음 목표 leak ─────────────────────────────────────

test('FR-18.6 (2) / EC-44 free 는 다음 세션의 lastSession / 재도전 판정에 잡히지 않는다', () => {
  // 이전에 work 로 3단계 통과 → 그 뒤 free 로 낮은 기록.
  // free 가 lastSession 이면 재도전 문구가 뜨거나 연속이 어긋난다.
  const state = stateAt({ pushup: 5 }, [
    rec('pushup', 5, [5], { date: '2026-09-01' }),
    // 자유로 낮은 값 하나:
    { date: '2026-09-02', progressionId: 'pushup', step: 5, sets: [1], kind: 'free' },
  ]);
  const p = planExercise(state, catalog, 'pushup');
  // free 가 outcome:abandoned 처럼 잡히면 안 됨 — reason 에 "재도전" 이 나오지 않아야 함
  assert.doesNotMatch(p.reason, /재도전/);
  // 연속은 1/3 로 잡혀야 함 (work 세션 하나만 셈).
  assert.match(p.reason, /1\/3회 연속/);
});

test('FR-18.6 (2) / EC-44 free 세션이 계획된 목표 수치를 끌어내리지 않는다', () => {
  // 연속 판정과 목표 산출은 stepStreak 기반이라 자유 운동을 배제한다.
  const state = stateAt({ pushup: 5 }, [
    { date: '2026-09-01', progressionId: 'pushup', step: 5, sets: [0], kind: 'free' },
  ]);
  const p = planExercise(state, catalog, 'pushup');
  // 새 단계 첫 세션 = 초보자 기준.
  assert.equal(p.goal.label, 'beginner');
  assert.equal(p.work[0].target, 5); // 푸시업 5단계 초보자 기준 1×5
});

// ── FR-18.6 (3) / EC-46: maintenanceCount leak ──────────────────────────────

test('FR-18.6 (3) / EC-46 승급 후 free 를 반복해도 maintenanceCount 가 늘지 않는다', async () => {
  const { maintenanceCount } = await import('../../src/lib/domain/index.ts');
  // 3단계에서 4단계로 승급한 세션 + 그 뒤 4단계 free 3개
  const history: SessionRecord[] = [
    rec('pushup', 3, [10], { date: '2026-09-01', promotedTo: 4 }),
    { date: '2026-09-02', progressionId: 'pushup', step: 4, sets: [15], kind: 'free' },
    { date: '2026-09-03', progressionId: 'pushup', step: 4, sets: [15], kind: 'free' },
    { date: '2026-09-04', progressionId: 'pushup', step: 4, sets: [15], kind: 'free' },
  ];
  assert.equal(
    maintenanceCount(history, 'pushup', '2026-09-01'),
    0,
    'free 는 판정 대상이 아니므로 유지 세션으로 세지 않는다',
  );
});

// ── FR-18.6 (4) / EC-45: lastSetbackIndex leak (강등 오인) ──────────────────

test('FR-18.6 (4) / EC-45 free 에 outcome:abandoned 가 억지로 붙어도 lastSetbackIndex 가 잡지 않는다', async () => {
  const { lastSetbackIndex } = await import('../../src/lib/domain/index.ts');
  // UI 는 free 에 abandoned 를 붙이지 않지만, 방어 계층으로 검증한다.
  const history: SessionRecord[] = [
    { date: '2026-09-01', progressionId: 'pushup', step: 4, sets: [1],
      kind: 'free', outcome: 'abandoned' },
  ];
  assert.equal(lastSetbackIndex(history, 'pushup', '2026-09-01'), null);
});

// ── judgingHistory / judgingState 순수성·정확성 ────────────────────────────

test('judgingHistory 는 순수 함수 — 원본 배열을 변형하지 않는다', () => {
  const history: SessionRecord[] = [
    rec('pushup', 5, [5]),
    { date: '2026-09-02', progressionId: 'pushup', step: 5, sets: [1], kind: 'free' },
  ];
  const snapshot = JSON.stringify(history);
  const filtered = judgingHistory(history);
  assert.equal(JSON.stringify(history), snapshot, '원본 불변');
  assert.equal(filtered.length, 1);
  assert.notStrictEqual(filtered, history);
});

test('judgingState 는 원본 상태를 변형하지 않는다', () => {
  const state = stateAt({ pushup: 5 }, [
    { date: '2026-09-01', progressionId: 'pushup', step: 5, sets: [1], kind: 'free' },
  ]);
  const snapshot = JSON.stringify(state);
  const view = judgingState(state);
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(view.history.length, 0, 'free 만 있으니 뷰는 비어야 한다');
  assert.notStrictEqual(view.history, state.history);
});

test('judgingHistory 는 work / consolidation 은 유지하고 free 만 제외한다', () => {
  const history: SessionRecord[] = [
    rec('pushup', 5, [5], { kind: 'work' }),
    rec('pushup', 5, [4], { kind: 'consolidation' }),
    { date: '2026-09-02', progressionId: 'pushup', step: 5, sets: [1], kind: 'free' },
    rec('pushup', 5, [5], { kind: 'work', date: '2026-09-03' }),
  ];
  const filtered = judgingHistory(history);
  assert.equal(filtered.length, 3);
  assert.ok(filtered.every((r) => r.kind !== 'free'));
});
