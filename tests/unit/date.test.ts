import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { weekdayOf, addDays, diffDays, dateRange, isMonday } from '../../src/lib/domain/date.ts';
import { initialState } from '../../src/lib/domain/index.ts';
import { LABEL_TO_ID } from '../../src/lib/domain/schedule.ts';
import { WEEKDAYS } from '../../src/lib/domain/types.ts';
import type { ProgressionId } from '../../src/lib/domain/types.ts';

// --- weekdayOf (FR-6.2) ---

test('7요일을 순서대로 매핑한다', () => {
  const days = dateRange('2026-09-07', '2026-09-13');
  assert.deepEqual(days.map(weekdayOf), ['월', '화', '수', '목', '금', '토', '일']);
});

test('일요일은 일 로 매핑된다 (getUTCDay 0 → 인덱스 6)', () => {
  assert.equal(weekdayOf('2026-09-13'), '일');
});

test('월요일은 월 로 매핑된다 (getUTCDay 1 → 인덱스 0)', () => {
  assert.equal(weekdayOf('2026-09-07'), '월');
});

test('반환값은 항상 WEEKDAYS 의 원소다', () => {
  for (const d of dateRange('2026-09-01', '2026-09-30')) {
    assert.ok(WEEKDAYS.includes(weekdayOf(d)), d);
  }
});

test('윤년 2월 29일도 정상 처리된다', () => {
  assert.equal(weekdayOf('2028-02-29'), '화');
});

// --- addDays ---

test('단순 전진', () => {
  assert.equal(addDays('2026-09-04', 3), '2026-09-07');
});

test('0일 전진은 항등', () => {
  assert.equal(addDays('2026-09-04', 0), '2026-09-04');
});

test('음수는 후진', () => {
  assert.equal(addDays('2026-09-04', -4), '2026-08-31');
});

test('월말 경계', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
});

test('연말 경계', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('연초 역방향 경계', () => {
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
});

test('윤년 2월 29일이 존재한다', () => {
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('평년 2월에는 29일이 없다', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});

test('반환 형식은 항상 zero-padded YYYY-MM-DD', () => {
  assert.equal(addDays('2026-01-05', 0), '2026-01-05');
  assert.equal(addDays('2026-01-09', 1), '2026-01-10');
});

test('4자리 연도를 유지한다', () => {
  assert.equal(addDays('2099-12-31', 1), '2100-01-01');
});

test('DST 전환 주간에도 정확히 1일 이동한다 (달력 산술)', () => {
  assert.equal(addDays('2026-03-07', 1), '2026-03-08');
});

// --- diffDays ---

test('같은 날은 0', () => {
  assert.equal(diffDays('2026-09-04', '2026-09-04'), 0);
});

test('정방향 일수', () => {
  assert.equal(diffDays('2026-09-04', '2026-09-11'), 7);
});

test('역방향은 음수를 그대로 돌려준다 (EC-10)', () => {
  assert.equal(diffDays('2026-09-11', '2026-09-04'), -7);
});

test('윤년을 넘는 구간', () => {
  assert.equal(diffDays('2028-02-28', '2028-03-01'), 2);
});

test('평년 동일 구간', () => {
  assert.equal(diffDays('2026-02-28', '2026-03-01'), 1);
});

test('addDays 와 왕복 항등이다', () => {
  for (const n of [-400, -31, -1, 0, 1, 27, 365, 1096]) {
    assert.equal(diffDays('2026-09-04', addDays('2026-09-04', n)), n, String(n));
  }
});

// --- dateRange (FR-5.2) ---

test('양끝을 포함한다', () => {
  assert.deepEqual(
    dateRange('2026-09-04', '2026-09-06'),
    ['2026-09-04', '2026-09-05', '2026-09-06'],
  );
});

test('단일 날짜 구간의 길이는 1', () => {
  assert.deepEqual(dateRange('2026-09-04', '2026-09-04'), ['2026-09-04']);
});

test('역순 구간은 빈 배열', () => {
  assert.deepEqual(dateRange('2026-09-06', '2026-09-04'), []);
});

test('월 경계를 넘는 구간의 길이', () => {
  assert.equal(dateRange('2026-01-30', '2026-02-02').length, 4);
});

test('길이가 diffDays + 1 과 일치한다', () => {
  const pairs: [string, string][] = [
    ['2026-09-04', '2026-09-04'],
    ['2026-01-30', '2026-03-02'],
    ['2026-12-25', '2027-01-05'],
  ];
  for (const [a, b] of pairs) {
    assert.equal(dateRange(a, b).length, diffDays(a, b) + 1, `${a}~${b}`);
  }
});

test('3년치 구간도 상한 없이 반환한다 (FR-3.6)', () => {
  const r = dateRange('2026-01-01', '2028-12-31');
  assert.equal(r.length, 1096);
  assert.equal(r[r.length - 1], '2028-12-31');
});

// --- isMonday (FR-4.6) ---

test('월요일이면 true', () => {
  assert.equal(isMonday('2026-09-07'), true);
});

test('화~일 6일은 전부 false', () => {
  for (const d of dateRange('2026-09-08', '2026-09-13')) {
    assert.equal(isMonday(d), false, d);
  }
});

// --- 입력 검증: 하지 않는다 ---

test('존재하지 않는 날짜는 Date.UTC 가 정규화한다 — 검증 로직을 넣지 않는다', () => {
  assert.equal(addDays('2026-02-30', 0), '2026-03-02');
});

// --- 타임존 무관 (FR-6.3, NFR-5) ---

const runUnderTZ = (tz: string, expr: string): string => {
  const url = new URL('../../src/lib/domain/date.ts', import.meta.url).pathname;
  const code = `import * as d from ${JSON.stringify(url)};`
    + `process.stdout.write(String(${expr}));`;
  return execFileSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code],
    { env: { ...process.env, TZ: tz }, encoding: 'utf-8' },
  );
};

const ZONES = ['UTC', 'Asia/Seoul', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Midway'];

test('타임존이 달라도 weekdayOf 결과가 밀리지 않는다', () => {
  for (const tz of ZONES) {
    assert.equal(runUnderTZ(tz, `d.weekdayOf('2026-09-07')`), '월', tz);
  }
});

test('타임존이 달라도 addDays 결과가 같다', () => {
  for (const tz of ZONES) {
    assert.equal(runUnderTZ(tz, `d.addDays('2026-09-04', 1)`), '2026-09-05', tz);
  }
});

// --- initialState (FR-10) ---

test('initialState 는 프로그램 미선택 상태를 반환한다', () => {
  const s = initialState();
  assert.deepEqual(s.stints, []);
  assert.deepEqual(s.proposals, []);
});

test('initialState 의 기존 필드가 그대로 유지된다', () => {
  const s = initialState(2);
  const ids: ProgressionId[] = ['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'];
  for (const id of ids) assert.equal(s.steps[id], 2, id);
  assert.deepEqual(s.history, []);
});

// --- LABEL_TO_ID export (W-1) ---

test('LABEL_TO_ID 를 schedule.ts 에서 import 할 수 있다', () => {
  assert.equal(typeof LABEL_TO_ID, 'object');
});

test('LABEL_TO_ID 에 빅6 6종목이 전부 있다', () => {
  const ids = Object.values(LABEL_TO_ID).sort();
  assert.deepEqual(
    ids,
    ['bridge', 'hspu', 'legraise', 'pullup', 'pushup', 'squat'],
  );
});
