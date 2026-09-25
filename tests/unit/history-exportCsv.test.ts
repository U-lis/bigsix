// 내보내기 CSV 조립 (FR-26.3 / EC-69 / EC-70 / FR-26.6 / GLOBAL B.4).

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import {
  buildCsvRows, buildExportCsv, csvQuote, formatCsv, CSV_HEADERS,
} from '../../src/lib/ui/history/exportCsv.ts';
import type {
  AppState, ProgramStint, SessionRecord, SessionTarget,
} from '../../src/lib/domain/types.ts';
import { ALL_UNLOCKED_STEPS, catalog, stateAt, stintFixture } from './helpers.ts';

// ── 픽스처 ──────────────────────────────────────────────────────────────────

function stintOn(programId: string, startedAt: string): ProgramStint {
  return stintFixture(programId, startedAt, startedAt);
}

function rec(
  date: string,
  overrides: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    date,
    progressionId: 'pushup',
    step: 3,
    sets: [10, 10],
    kind: 'work',
    ...overrides,
  };
}

const TARGET: SessionTarget = {
  goal: { label: 'intermediate', sets: 3, value: 25 },
  work: [
    { target: 25, mode: 'fixed' },
    { target: 25, mode: 'max' },
    { target: 25, mode: 'fixed' },
  ],
};

// ── 헤더 · BOM ───────────────────────────────────────────────────────────────

describe('formatCsv — 헤더와 BOM', () => {
  it('첫 문자가 UTF-8 BOM (`\\uFEFF`)', () => {
    assert.equal(formatCsv([]).charCodeAt(0), 0xFEFF);
  });

  it('헤더가 22개 열 순서와 정확히 일치', () => {
    const csv = formatCsv([]);
    const first = csv.slice(1).split('\r\n')[0]; // BOM 제거 후 첫 줄.
    const cols = first.split(',');
    assert.equal(cols.length, 22);
    assert.deepEqual(cols, [
      'date', 'completed_at', 'program', 'day_number', 'progression',
      'step', 'performed_step', 'step_name', 'unit', 'kind',
      'outcome', 'set_index', 'value', 'set_rpe', 'session_rpe',
      'goal_label', 'goal_sets', 'goal_value', 'target', 'target_mode',
      'promoted_to', 'blocked_by',
    ]);
    assert.deepEqual(cols, [...CSV_HEADERS]);
  });

  it('줄 종결이 `\\r\\n` — 헤더 · 데이터 · 마지막 줄까지 일관', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [rec('2026-09-15')]);
    const csv = formatCsv(buildCsvRows(state, catalog));
    // BOM + 헤더 + 데이터 두 줄(세트 2개) + 종결 = 총 세 개 이상의 `\r\n`.
    const eolCount = csv.match(/\r\n/g)?.length ?? 0;
    assert.ok(eolCount >= 3);
    assert.ok(csv.endsWith('\r\n'));
  });
});

// ── long 형식 (세트 한 줄) ─────────────────────────────────────────────────

describe('buildCsvRows — 세트 한 줄 (long)', () => {
  it('sets.length 만큼 줄이 생긴다', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      rec('2026-09-15', { sets: [10, 10, 10] }),
    ]);
    const rows = buildCsvRows(state, catalog);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => r.set_index), ['1', '2', '3']);
    assert.deepEqual(rows.map((r) => r.value), ['10', '10', '10']);
  });

  it('세트 0개 세션 → 한 줄, 세트 관련 5개 열이 빈 칸 (EC-70)', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      rec('2026-09-15', { sets: [], outcome: 'abandoned' }),
    ]);
    const rows = buildCsvRows(state, catalog);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.set_index, '');
    assert.equal(row.value, '');
    assert.equal(row.set_rpe, '');
    assert.equal(row.target, '');
    assert.equal(row.target_mode, '');
    // outcome 은 그대로 실린다.
    assert.equal(row.outcome, 'abandoned');
  });

  it('세션 공통 필드가 같은 세션의 모든 세트 줄에 반복된다', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      rec('2026-09-15', {
        sets: [10, 10],
        rpe: 7,
        promotedTo: 4,
        blockedBy: undefined,
        target: TARGET,
      }),
    ]);
    const rows = buildCsvRows(state, catalog);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].session_rpe, '7');
    assert.equal(rows[1].session_rpe, '7');
    assert.equal(rows[0].promoted_to, '4');
    assert.equal(rows[1].promoted_to, '4');
    assert.equal(rows[0].blocked_by, '');
    assert.equal(rows[1].blocked_by, '');
    // 목표 스냅샷도 두 줄에 같은 값이 실린다.
    assert.equal(rows[0].goal_label, 'intermediate');
    assert.equal(rows[1].goal_label, 'intermediate');
    assert.equal(rows[0].goal_sets, '3');
    assert.equal(rows[1].goal_sets, '3');
    assert.equal(rows[0].goal_value, '25');
    assert.equal(rows[1].goal_value, '25');
  });

  it('target 열이 숫자 문자열, target_mode 는 fixed|max — >= 접두어 없음', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      rec('2026-09-15', { sets: [10, 10, 10], target: TARGET }),
    ]);
    const rows = buildCsvRows(state, catalog);
    assert.deepEqual(rows.map((r) => r.target), ['25', '25', '25']);
    assert.deepEqual(rows.map((r) => r.target_mode), ['fixed', 'max', 'fixed']);
    // 어느 열에도 `>=` 는 없다.
    for (const r of rows) {
      for (const col of CSV_HEADERS) {
        assert.ok(!r[col].includes('>='), `${col} 이 '>=' 을 담고 있으면 안 된다`);
      }
    }
  });

  it('목표 스냅샷 없는 세션은 goal_* · target · target_mode 5개 열이 빈 칸', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      rec('2026-09-15', { sets: [10, 10] }), // target 없음.
    ]);
    const rows = buildCsvRows(state, catalog);
    for (const r of rows) {
      assert.equal(r.goal_label, '');
      assert.equal(r.goal_sets, '');
      assert.equal(r.goal_value, '');
      assert.equal(r.target, '');
      assert.equal(r.target_mode, '');
    }
  });
});

// ── 프로그램 열 (stintAt) ───────────────────────────────────────────────────

describe('buildCsvRows — program 열은 stintAt 기반', () => {
  it('stintAt 이 null 이면 빈 칸', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [rec('2026-09-15')]);
    // stints 빈 배열 → stintAt 은 null.
    const rows = buildCsvRows(state, catalog);
    for (const r of rows) {
      assert.equal(r.program, '');
      assert.equal(r.day_number, '');
    }
  });

  it('stintAt 이 있으면 getProgram(catalog, id).name.ko 로 매핑', () => {
    const state = stateAt(
      ALL_UNLOCKED_STEPS,
      [rec('2026-09-02')], // 화요일. good_behavior 프로그램.
      [stintOn('good_behavior', '2026-09-01')],
    );
    const rows = buildCsvRows(state, catalog);
    // 프로그램 한국어명이 그대로 실려야 한다. 정확한 문자열은 카탈로그가 정본이므로
    // 존재만 확인 (빈 문자열이 아님).
    assert.ok(rows[0].program.length > 0);
    assert.notEqual(rows[0].program, 'good_behavior'); // id 가 아니라 한국어명.
    // day_number 는 stint.startedAt(9/1) → date(9/2) 이 2일차.
    assert.equal(rows[0].day_number, '2');
  });
});

// ── set_rpe · completedAt ───────────────────────────────────────────────────

describe('buildCsvRows — 새 저장 필드 (FR-28)', () => {
  it('setRpes[i-1] 이 각 세트 줄의 set_rpe 로 실린다 (없으면 빈 칸)', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      rec('2026-09-15', { sets: [10, 10, 10], setRpes: [6, null, 8] }),
    ]);
    const rows = buildCsvRows(state, catalog);
    assert.deepEqual(rows.map((r) => r.set_rpe), ['6', '', '8']);
  });

  it('completedAt 이 그대로 completed_at 에 실린다', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [
      rec('2026-09-15', { completedAt: '2026-09-15T13:45:23+09:00' }),
    ]);
    const rows = buildCsvRows(state, catalog);
    assert.equal(rows[0].completed_at, '2026-09-15T13:45:23+09:00');
  });
});

// ── 인용 (EC-69, RFC 4180) ──────────────────────────────────────────────────

describe('csvQuote — RFC 4180 (EC-69)', () => {
  it('일반 문자열은 그대로', () => {
    assert.equal(csvQuote('abc'), 'abc');
    assert.equal(csvQuote('123'), '123');
    assert.equal(csvQuote(''), '');
  });

  it('쉼표가 있으면 큰따옴표로 감싼다', () => {
    assert.equal(csvQuote('a,b'), '"a,b"');
  });

  it('큰따옴표가 있으면 감싸고 내부 " 를 "" 로 이스케이프', () => {
    assert.equal(csvQuote('a"b'), '"a""b"');
    assert.equal(csvQuote('"'), '""""');
  });

  it('개행(\\r, \\n) 이 있으면 감싼다', () => {
    assert.equal(csvQuote('a\nb'), '"a\nb"');
    assert.equal(csvQuote('a\rb'), '"a\rb"');
    assert.equal(csvQuote('a\r\nb'), '"a\r\nb"');
  });
});

describe('formatCsv — 값 인용이 실제로 걸린다', () => {
  it('종목명·프로그램명에 쉼표가 있어도 안전하게 인용된다 (합성 예)', () => {
    // 실제 카탈로그에 쉼표는 없지만 인용 로직이 걸리는지 합성 값으로 검사.
    const csv = formatCsv([{
      date: '2026-09-15',
      completed_at: '',
      program: '이름, 쉼표 포함',
      day_number: '1',
      progression: '푸시업',
      step: '3',
      performed_step: '3',
      step_name: '단계 "인용부호"',
      unit: 'reps',
      kind: 'work',
      outcome: '',
      set_index: '1',
      value: '10',
      set_rpe: '',
      session_rpe: '',
      goal_label: '',
      goal_sets: '',
      goal_value: '',
      target: '',
      target_mode: '',
      promoted_to: '',
      blocked_by: '',
    }]);
    // 두 번째 줄의 값에서 인용 여부 확인.
    const lines = csv.slice(1).split('\r\n');
    const data = lines[1];
    // "이름, 쉼표 포함" 이 그대로 담기고, "인용부호" 는 "" 로 이스케이프.
    assert.ok(data.includes('"이름, 쉼표 포함"'));
    assert.ok(data.includes('"단계 ""인용부호"""'));
  });
});

// ── 편의 함수 ────────────────────────────────────────────────────────────────

describe('buildExportCsv — 종합', () => {
  it('BOM · 헤더 · 데이터가 순서대로 나온다', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [rec('2026-09-15')]);
    const csv = buildExportCsv(state, catalog);
    assert.equal(csv.charCodeAt(0), 0xFEFF);
    const lines = csv.slice(1).split('\r\n');
    assert.equal(lines[0].split(',').length, 22);
    // 데이터 두 줄(세트 2개) 이 실린다.
    assert.equal(lines[1].startsWith('2026-09-15,'), true);
    assert.equal(lines[2].startsWith('2026-09-15,'), true);
  });
});

// ── 상태 불변 (FR-26.6) ─────────────────────────────────────────────────────

describe('상태 불변 (FR-26.6)', () => {
  it('buildCsvRows · buildExportCsv 호출 후 state 참조·history 참조 그대로', () => {
    const history: SessionRecord[] = [
      rec('2026-09-15', { sets: [10, 10], target: TARGET }),
    ];
    const state = stateAt(ALL_UNLOCKED_STEPS, history);
    const originalRef = state;
    const historyRef = state.history;
    buildCsvRows(state, catalog);
    buildExportCsv(state, catalog);
    assert.equal(state, originalRef);
    assert.equal(state.history, historyRef);
    // history 도 손을 대지 않는다.
    assert.equal(state.history.length, 1);
    assert.equal(state.history[0], history[0]);
  });
});

// ── 진행 중 세션은 없다 (EC-59) ──────────────────────────────────────────────

describe('진행 중 세션은 담기지 않는다 (EC-59)', () => {
  it('시그니처가 inProgress 를 받지 않으며, state.history 만 순회한다', () => {
    const state: AppState = stateAt(ALL_UNLOCKED_STEPS, [rec('2026-09-15')]);
    const rows = buildCsvRows(state, catalog);
    // history 의 세션 하나 · 세트 두 개 → 2줄. 그 외 무엇도 실리지 않는다.
    assert.equal(rows.length, 2);
  });
});
