// @vitest-environment happy-dom
//
// 0.5.0 (#4 · #13) 의 UI 쪽 순수 계산과 저장 계층.
// 저장 계층이 localStorage 를 만지므로 happy-dom 환경에서 돈다.

import { beforeEach, describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { catalogFor, loadCatalog } from '../../src/lib/data/catalog.ts';
import {
  addCustomProgram, initialState, selectProgram, setStep, withCustomPrograms,
} from '../../src/lib/domain/index.ts';
import type { AppState } from '../../src/lib/domain/types.ts';
import { buildDayRows } from '../../src/lib/ui/history/dayList.ts';
import { adjustmentsOf } from '../../src/lib/ui/history/progression.ts';
import { historyRange } from '../../src/lib/ui/history/range.ts';
import { parseImport } from '../../src/lib/ui/history/importJson.ts';
import {
  copyName, emptyInput, scheduleLine, toggleDay, trainingDayCount,
} from '../../src/lib/ui/program/customForm.ts';
import { buildMeta } from '../../src/lib/ui/push/meta';
import {
  APP_STATE_KEY, readAppState, validateAndMigrateAppStateEnvelope, writeAppState,
} from '../../src/lib/ui/state/storage.ts';

const catalog = loadCatalog();

/** 이슈 #13 의 4일 프로그램을 만들어 2026-10-26(월) 에 고른 상태. */
function onFourDay(): { state: AppState; id: string } {
  const r = addCustomProgram(initialState(), catalog, {
    name: '주 4일 빅4',
    days: { 월: ['pushup'], 화: ['legraise'], 목: ['pullup'], 금: ['squat'] },
  });
  const state = selectProgram(r.state, withCustomPrograms(catalog, r.state), r.programId, '2026-10-26');
  return { state, id: r.programId };
}

describe('저장 계층 — v5 필드 (#4 · #13)', () => {
  beforeEach(() => window.localStorage.clear());

  it('customPrograms · stepAdjustments 가 라운드트립한다', () => {
    const { state } = onFourDay();
    const s = setStep(state, catalog, 'pushup', 4, '2026-10-27');
    writeAppState(s);
    const r = readAppState();
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') {
      assert.deepEqual(r.value.customPrograms, s.customPrograms);
      assert.deepEqual(r.value.stepAdjustments, s.stepAdjustments);
    }
  });

  it('v4 봉투는 그대로 읽힌다 (두 필드 없음)', () => {
    window.localStorage.setItem(APP_STATE_KEY, JSON.stringify({ schemaVersion: 4, appState: initialState() }));
    const r = readAppState();
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') {
      assert.equal(r.value.customPrograms, undefined);
      assert.equal(r.value.stepAdjustments, undefined);
    }
  });

  it('구간이 가리키는 커스텀 프로그램이 없으면 손상으로 본다', () => {
    const { state } = onFourDay();
    const broken = { ...state, customPrograms: [] };
    assert.deepEqual(
      validateAndMigrateAppStateEnvelope({ schemaVersion: 5, appState: broken }),
      { ok: false, reason: 'corrupt' },
    );
  });

  it('customPrograms 원소 모양이 틀리면 손상', () => {
    const bad = { ...initialState(), customPrograms: [{ id: 'custom-1', name: { ko: 'x' } }] };
    assert.equal(validateAndMigrateAppStateEnvelope({ schemaVersion: 5, appState: bad }).ok, false);
    const notCustom = { ...initialState(), customPrograms: [{ ...onFourDay().state.customPrograms![0], id: 'new_blood' }] };
    assert.equal(validateAndMigrateAppStateEnvelope({ schemaVersion: 5, appState: notCustom }).ok, false);
  });

  it('stepAdjustments 가 배열이 아니면 손상', () => {
    const bad = { ...initialState(), stepAdjustments: {} };
    assert.equal(validateAndMigrateAppStateEnvelope({ schemaVersion: 5, appState: bad }).ok, false);
  });

  it('가져오기도 같은 검사를 탄다 — 커스텀 프로그램이 들어 있는 파일', () => {
    const { state } = onFourDay();
    const text = JSON.stringify({ meta: { schemaVersion: 5 }, appState: state });
    const r = parseImport(text, initialState());
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.appState.customPrograms, state.customPrograms);
  });
});

describe('catalogFor — 커스텀까지 합친 카탈로그 (#13)', () => {
  it('같은 customPrograms 배열이면 같은 객체', () => {
    const { state } = onFourDay();
    assert.equal(catalogFor(state), catalogFor({ ...state, history: [] }));
  });

  it('커스텀이 없으면 정적 카탈로그 그대로', () => {
    assert.equal(catalogFor(initialState()), loadCatalog());
  });

  it('커스텀이 바뀌면 다시 합친다', () => {
    const { state, id } = onFourDay();
    assert.ok(catalogFor(state).programs.some((p) => p.id === id));
    assert.ok(!catalogFor({ ...state, customPrograms: [] }).programs.some((p) => p.id === id));
  });
});

describe('알림 meta — 커스텀 프로그램 (#13)', () => {
  it('프로그램 이름과 요일별 종목이 커스텀 요일표를 따른다', () => {
    const { state } = onFourDay();
    const meta = buildMeta(state, catalogFor(state), 'Asia/Seoul', '19:00');
    assert.deepEqual(meta, {
      v: 1,
      tz: 'Asia/Seoul',
      notifyAt: '19:00',
      program: '주 4일 빅4',
      days: { 월: ['푸시업'], 화: ['레그 레이즈'], 목: ['풀업'], 금: ['스쿼트'] },
    });
  });
});

describe('기록 탭 — 단계 조정 이력 (#4)', () => {
  const adjusted = setStep(
    setStep(initialState(), catalog, 'pushup', 5, '2026-10-20'),
    catalog, 'pushup', 3, '2026-10-22',
  );

  it('조정만 있어도 기록 범위가 생긴다', () => {
    assert.deepEqual(historyRange(adjusted, '2026-10-29'), { from: '2026-10-20', to: '2026-10-29' });
  });

  it('그날 행에 조정이 붙는다', () => {
    const rows = buildDayRows(adjusted, catalog, { from: '2026-10-20', to: '2026-10-22' });
    const byDate = Object.fromEntries(rows.map((r) => [r.review.date, r.adjustments]));
    const tiers = { fromTier: 'beginner', toTier: 'beginner' };
    assert.deepEqual(byDate['2026-10-20'], [{ date: '2026-10-20', progressionId: 'pushup', from: 2, to: 5, ...tiers }]);
    assert.deepEqual(byDate['2026-10-21'], []);
    assert.deepEqual(byDate['2026-10-22'], [{ date: '2026-10-22', progressionId: 'pushup', from: 5, to: 3, ...tiers }]);
  });

  it('종목별 이력은 최근 것부터, 다른 종목은 빠진다', () => {
    const s = setStep(adjusted, catalog, 'squat', 4, '2026-10-23');
    assert.deepEqual(adjustmentsOf(s, 'pushup').map((a) => a.date), ['2026-10-22', '2026-10-20']);
    assert.deepEqual(adjustmentsOf(s, 'legraise'), []);
  });

  it('커스텀 프로그램 날의 행도 그 이름으로 계산된다', () => {
    const { state, id } = onFourDay();
    const rows = buildDayRows(state, catalogFor(state), { from: '2026-10-26', to: '2026-10-27' });
    assert.ok(rows.every((r) => r.review.programId === id));
  });
});

describe('커스텀 폼 순수 계산 (#13)', () => {
  it('toggleDay 는 넣고 빼며 원래 입력을 바꾸지 않는다', () => {
    const a = emptyInput();
    const b = toggleDay(a, '월', 'pushup');
    const c = toggleDay(b, '월', 'squat');
    const d = toggleDay(c, '월', 'pushup');
    assert.deepEqual(a.days, {});
    assert.deepEqual(c.days.월, ['pushup', 'squat']);
    assert.deepEqual(d.days.월, ['squat']);
  });

  it('trainingDayCount 는 종목이 있는 요일만 센다', () => {
    let x = toggleDay(emptyInput(), '월', 'pushup');
    x = toggleDay(x, '수', 'squat');
    x = toggleDay(x, '수', 'squat');
    assert.equal(trainingDayCount(x), 1);
  });

  it('copyName 은 겹치지 않는 이름을 고른다', () => {
    assert.equal(copyName('신참', []), '신참 복사');
    assert.equal(copyName('신참', ['신참 복사']), '신참 복사 2');
    assert.equal(copyName('신참', ['신참 복사', '신참 복사 2']), '신참 복사 3');
  });

  it('copyName 은 20자를 넘지 않는다', () => {
    const name = copyName('가'.repeat(20), []);
    assert.equal([...name].length, 20);
    assert.ok(name.endsWith(' 복사'));
  });

  it('scheduleLine 은 휴식일을 빼고 요일 순서로 잇는다', () => {
    const { state, id } = onFourDay();
    const cat = catalogFor(state);
    const p = cat.programs.find((x) => x.id === id)!;
    assert.equal(scheduleLine(cat, p), '월 푸시업 · 화 레그 레이즈 · 목 풀업 · 금 스쿼트');
  });
});
