// 사양 상수 정합성 (Phase 5, Step 8).
//
// 여기 있는 테스트는 기능이 아니라 **상수와 데이터가 어긋나지 않는지**를 고정한다.
// 어긋나도 예외가 나지 않고 조용히 오답을 내는 지점들이므로 테스트가 유일한 방어선이다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAM_ORDER } from '../src/proposal.ts';
import { LABEL_TO_ID } from '../src/schedule.ts';
import { firstTrainingDay } from '../src/program.ts';
import type { Catalog, ProgressionId, Weekday } from '../src/types.ts';
import { catalog } from './helpers.ts';

const WEEKDAYS: Weekday[] = ['월', '화', '수', '목', '금', '토', '일'];
const BIG6: ProgressionId[] = ['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'];

// ── PROGRAM_ORDER (FR-4.7) ───────────────────────────────────────────────────

describe('PROGRAM_ORDER — 제안 순서 상수 (FR-4.7)', () => {
  test('원소 수가 카탈로그 프로그램 수와 같다', () => {
    assert.equal(PROGRAM_ORDER.length, 5);
    assert.equal(PROGRAM_ORDER.length, catalog.programs.length);
  });

  test('모든 id 가 카탈로그에 존재한다 — 오타가 있으면 여기서 깨진다', () => {
    const known = new Set(catalog.programs.map((p) => p.id));
    for (const id of PROGRAM_ORDER) assert.ok(known.has(id), `카탈로그에 없는 id: ${id}`);
  });

  test('카탈로그의 모든 프로그램 id 가 PROGRAM_ORDER 에 있다 — 누락이 있으면 깨진다', () => {
    const ordered = new Set(PROGRAM_ORDER);
    for (const p of catalog.programs) {
      assert.ok(ordered.has(p.id), `PROGRAM_ORDER 에 없는 프로그램: ${p.id}`);
    }
  });

  test('순서가 SPEC FR-4.7 이 명시한 순서와 정확히 일치한다', () => {
    // 집합이 같아도 순서가 뒤바뀌면 엉뚱한 프로그램을 제안한다.
    assert.deepEqual([...PROGRAM_ORDER], [
      'new_blood', 'good_behavior', 'veterano', 'solitary_confinement', 'supermax',
    ]);
  });
});

// ── LABEL_TO_ID (schedule.ts) ────────────────────────────────────────────────

/** 5종 프로그램 요일표에 등장하는 모든 종목 라벨. */
function allScheduleLabels(c: Catalog): string[] {
  const out = new Set<string>();
  for (const program of c.programs) {
    for (const weekday of WEEKDAYS) {
      for (const [label] of program.schedule[weekday] ?? []) out.add(label);
    }
  }
  return [...out].sort();
}

describe('LABEL_TO_ID — 요일표 라벨 매핑', () => {
  test('매핑되지 않은 라벨은 보조 운동 3종뿐이다 — 빅6 가 조용히 누락되지 않는다', () => {
    // 매핑에 없는 라벨은 planDay 가 예외 없이 보조 운동으로 분류한다.
    // 빅6 라벨의 오타·표기 흔들림이 여기로 빨려 들어가면 그 종목이 계획에서 통째로 사라진다.
    const unmapped = allScheduleLabels(catalog).filter((l) => LABEL_TO_ID[l] === undefined);
    assert.deepEqual(unmapped, ['목 운동', '악력 운동', '종아리 운동']);
  });

  test('매핑의 모든 값이 유효한 ProgressionId 다', () => {
    const known = new Set(catalog.progressions.map((p) => p.id));
    for (const id of Object.values(LABEL_TO_ID)) {
      assert.ok(known.has(id), `카탈로그에 없는 종목 id: ${id}`);
    }
  });

  test('매핑에 빅6 6종목이 전부 등장한다', () => {
    assert.deepEqual(Object.values(LABEL_TO_ID).sort(), [...BIG6].sort());
  });

  test('빅6 중 어떤 종목도 요일표에서 통째로 빠지지 않는다', () => {
    // 5종 프로그램 전체를 합치면 빅6 가 모두 한 번 이상 계획된다.
    const covered = new Set(
      allScheduleLabels(catalog).map((l) => LABEL_TO_ID[l]).filter((id) => id !== undefined),
    );
    for (const id of BIG6) assert.ok(covered.has(id), `요일표에 등장하지 않는 종목: ${id}`);
  });
});

// ── perSide 데이터 (FR-1 확정 사항) ──────────────────────────────────────────

/** `perSide: true` 인 단계를 `종목:단계` 문자열로 모은다. */
function perSideSteps(c: Catalog): string[] {
  const out: string[] = [];
  for (const p of c.progressions) {
    for (const s of p.steps) if (s.perSide === true) out.push(`${p.id}:${s.n}`);
  }
  return out.sort();
}

describe('perSide 데이터 (FR-1)', () => {
  test('perSide: true 단계가 정확히 16개다 — SPEC FR-1 확정 사항', () => {
    assert.equal(perSideSteps(catalog).length, 16);
  });

  test('그 16개는 pushup / squat / pullup / hspu 의 7~10단계다', () => {
    const expected: string[] = [];
    for (const id of ['pushup', 'squat', 'pullup', 'hspu']) {
      for (const n of [7, 8, 9, 10]) expected.push(`${id}:${n}`);
    }
    assert.deepEqual(perSideSteps(catalog), expected.sort());
  });

  test('legraise / bridge 에는 perSide 단계가 없다 — 누락이 아니라 정확한 값이다', () => {
    for (const id of ['legraise', 'bridge']) {
      const p = catalog.progressions.find((x) => x.id === id)!;
      assert.equal(p.steps.some((s) => s.perSide === true), false, id);
    }
  });
});

// ── firstTrainingDay 방어적 예외 (program.ts) ────────────────────────────────

describe('firstTrainingDay — 요일표에 운동일이 없는 경우', () => {
  test('7일 안에 운동일을 찾지 못하면 예외를 던진다 — 조용히 틀린 날짜를 돌려주지 않는다', () => {
    // 실제 5종에는 없는 상황이지만, 데이터가 잘못 들어오면
    // startedAt 이 임의의 휴식일로 굳어 며칠차 계산이 전부 어긋난다.
    const empty: Catalog = {
      ...catalog,
      programs: [{
        ...catalog.programs[0]!,
        id: 'all_rest',
        schedule: Object.fromEntries(WEEKDAYS.map((w) => [w, []])) as Record<Weekday, never[]>,
      }],
    };
    assert.throws(
      () => firstTrainingDay(empty, 'all_rest', '2026-09-07'),
      /운동일이 없다/,
    );
  });
});
