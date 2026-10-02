// `buildMeta` 순수 함수 테스트 (SPEC4 FR-34, ADR-34).
//
// 입력: AppState · catalog · tz · notifyAt. 출력: PushMeta 또는 null.
// 결정적이고 부작용이 없다 — 시스템 시각을 읽지 않는다.
//
// 다섯 프로그램 모두 직렬화 1024 바이트 이하 (FR-34.2 수치표).
// 종목이 없는 요일은 `days` 키에서 빠진다. 잠긴 종목은 `planDay` 가 필터링한다.
// 프로그램 미선택이면 null — 자동 동기화가 조용히 넘기도록 (ADR-35).

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { loadCatalog } from '../../../src/lib/data/catalog.ts';
import { initialState, selectProgram } from '../../../src/lib/domain/index.ts';
import type { AppState, ProgressionId } from '../../../src/lib/domain/types.ts';

import { buildMeta } from '../../../src/lib/ui/push/meta';

const catalog = loadCatalog();

const MON = '2026-09-07'; // 월요일

/** 모든 종목을 10단계까지 올려 잠금을 해제한 상태를 돌려준다. */
function unlockedAll(): AppState {
  const base = initialState(2);
  const ids: ProgressionId[] = ['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'];
  return { ...base, steps: Object.fromEntries(ids.map((id) => [id, 10])) as AppState['steps'] };
}

/** 프로그램을 선택한 상태를 돌려준다. */
function withProgram(programId: string, allUnlocked = false): AppState {
  const base = allUnlocked ? unlockedAll() : initialState(2);
  return selectProgram(base, catalog, programId, MON);
}

describe('buildMeta — FR-34 / ADR-34', () => {
  it('프로그램 미선택(stints 가 비어 있음)이면 null 을 반환한다', () => {
    const s = initialState(2);
    assert.equal(buildMeta(s, catalog, 'Asia/Seoul', '19:00'), null);
  });

  it('반환된 meta.tz 는 인자로 넘긴 tz 와 일치한다', () => {
    const s = withProgram('new_blood');
    const meta = buildMeta(s, catalog, 'America/Argentina/Buenos_Aires', '19:00');
    assert.ok(meta !== null);
    assert.equal(meta!.tz, 'America/Argentina/Buenos_Aires');
    assert.equal(meta!.notifyAt, '19:00');
    assert.equal(meta!.v, 1);
  });

  it('`program` 필드는 programId 가 아닌 프로그램 한국어명이다', () => {
    const s = withProgram('good_behavior');
    const meta = buildMeta(s, catalog, 'Asia/Seoul', '19:00');
    assert.equal(meta!.program, '모범수');
  });

  it('일요일은 모든 프로그램에서 종목이 없으므로 days 에 "일" 키가 없다', () => {
    for (const programId of [
      'new_blood', 'good_behavior', 'veterano', 'solitary_confinement', 'supermax',
    ]) {
      const s = withProgram(programId, true);
      const meta = buildMeta(s, catalog, 'Asia/Seoul', '19:00');
      assert.ok(meta !== null, `${programId}: meta null`);
      assert.ok(!('일' in meta!.days), `${programId}: 일 키가 없어야 한다`);
    }
  });

  it('잠긴 종목은 days 에서 제외된다 (planDay 가 필터링)', () => {
    // good_behavior 금요일 = hspu + bridge. 잠긴 상태(초기 2단계) 에서는 둘 다 빠진다.
    const s = withProgram('good_behavior');
    const meta = buildMeta(s, catalog, 'Asia/Seoul', '19:00');
    assert.ok(meta !== null);
    // 금요일 종목이 모두 잠겼으므로 "금" 키가 없다.
    assert.ok(!('금' in meta!.days), '금 키가 없어야 한다');
  });

  it('빅4 를 올려 금요일 잠금을 풀면 "금" 키에 두 종목이 들어온다', () => {
    const s = withProgram('good_behavior', true);
    const meta = buildMeta(s, catalog, 'Asia/Seoul', '19:00');
    assert.ok(meta !== null);
    assert.ok('금' in meta!.days, '금 키가 있어야 한다');
    assert.equal(meta!.days['금']!.length, 2);
  });

  it('종목이 없는 요일(휴식일)은 days 에 키가 없다', () => {
    // new_blood 는 월·목만 운동일, 나머지 요일은 휴식.
    const s = withProgram('new_blood');
    const meta = buildMeta(s, catalog, 'Asia/Seoul', '19:00');
    assert.ok(meta !== null);
    assert.ok('월' in meta!.days);
    assert.ok('목' in meta!.days);
    for (const d of ['화', '수', '금', '토', '일']) {
      assert.ok(!(d in meta!.days), `${d} 키가 없어야 한다`);
    }
  });

  it('같은 입력을 주면 항상 같은 직렬화 결과를 낸다', () => {
    const s = withProgram('solitary_confinement', true);
    const a = JSON.stringify(buildMeta(s, catalog, 'Asia/Seoul', '19:00'));
    const b = JSON.stringify(buildMeta(s, catalog, 'Asia/Seoul', '19:00'));
    assert.equal(a, b);
  });

  it('다섯 프로그램 모두 직렬화 결과가 1024 바이트 이하다', () => {
    for (const programId of [
      'new_blood', 'good_behavior', 'veterano', 'solitary_confinement', 'supermax',
    ]) {
      const s = withProgram(programId, true);
      const meta = buildMeta(s, catalog, 'America/Argentina/Buenos_Aires', '19:00');
      assert.ok(meta !== null, `${programId}: meta null`);
      const bytes = Buffer.byteLength(JSON.stringify(meta), 'utf8');
      assert.ok(bytes <= 1024, `${programId}: ${bytes} 바이트 (1024 초과)`);
    }
  });

  it('days 값은 한국어 종목명 배열 — progressionId 가 아니다', () => {
    const s = withProgram('new_blood', true);
    const meta = buildMeta(s, catalog, 'Asia/Seoul', '19:00');
    assert.ok(meta !== null);
    // new_blood 월요일: 푸시업 + 레그 레이즈
    assert.deepEqual(meta!.days['월'], ['푸시업', '레그 레이즈']);
    // new_blood 목요일: 풀업 + 스쿼트
    assert.deepEqual(meta!.days['목'], ['풀업', '스쿼트']);
  });
});
