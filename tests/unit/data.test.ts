import { test } from 'vitest';
import assert from 'node:assert/strict';
import { topStandard, valueOf } from '../../src/lib/domain/catalog.ts';
import { catalog } from './helpers.ts';

test('6종 × 10단계', () => {
  assert.equal(catalog.progressions.length, 6);
  for (const p of catalog.progressions) {
    assert.equal(p.steps.length, 10, p.id);
    assert.deepEqual(p.steps.map((s) => s.n), [1,2,3,4,5,6,7,8,9,10]);
  }
});

test('모든 단계에 이름·페이지·요약이 있다', () => {
  for (const p of catalog.progressions) {
    for (const s of p.steps) {
      assert.ok(s.name.ko && s.name.en, `${p.id} ${s.n} 이름`);
      assert.ok(s.page > 0, `${p.id} ${s.n} 페이지`);
      assert.ok(s.summary.length >= 2, `${p.id} ${s.n} 요약`);
    }
  }
});

test('기준은 초보자 ≤ 중급자 ≤ 최종 순으로 커진다(총 반복량 기준)', () => {
  const load = (s: { sets: number; value: number | [number, number] }) =>
    s.sets * (Array.isArray(s.value) ? s.value[0] : s.value);
  for (const p of catalog.progressions) {
    for (const s of p.steps) {
      assert.ok(load(s.beginner) <= load(s.intermediate), `${p.id} ${s.n} 초보→중급`);
      assert.ok(load(s.intermediate) <= load(topStandard(s)), `${p.id} ${s.n} 중급→최종`);
    }
  }
});

test('10단계만 elite 를 쓰고 1~9단계는 progression 을 쓴다', () => {
  for (const p of catalog.progressions) {
    for (const s of p.steps) {
      if (s.n === 10) { assert.ok(s.elite); assert.equal(s.progression, undefined); }
      else { assert.ok(s.progression); assert.equal(s.elite, undefined); }
    }
  }
});

test('핸드스탠드 1~3단계만 시간 단위다', () => {
  for (const p of catalog.progressions) {
    for (const s of p.steps) {
      const expected = p.id === 'hspu' && s.n <= 3 ? 'seconds' : 'reps';
      assert.equal(s.unit, expected, `${p.id} ${s.n}`);
    }
  }
});

test('브리지·핸드스탠드만 선행 조건이 있다', () => {
  const gated = catalog.progressions.filter((p) => p.requires !== null).map((p) => p.id);
  assert.deepEqual(gated.sort(), ['bridge', 'hspu']);
});

test('책과 어긋났던 값들이 확정된 대로 들어 있다', () => {
  const get = (id: string, n: number) =>
    catalog.progressions.find((p) => p.id === id)!.steps.find((s) => s.n === n)!;
  // 스쿼트 4단계 상급자 2×50 (본문·요약표 일치)
  assert.deepEqual(get('squat', 4).progression, { sets: 2, value: 50 });
  // 핸드스탠드 5단계 — 본문 2세트 / 요약표 3세트 중 큰 쪽
  assert.deepEqual(get('hspu', 5).progression, { sets: 3, value: 15 });
  assert.ok(get('hspu', 5).conflict, '불일치 사유가 기록돼 있어야 한다');
  // 핸드스탠드 10단계 최상급자 2×5
  assert.deepEqual(get('hspu', 10).elite, { sets: 2, value: 5 });
  // 풀업은 1.5단계 없이 10단계
  assert.equal(get('pullup', 2).name.en, 'Horizontal Pullup');
});

test('프로그램 요일 키는 7개', () => {
  for (const p of catalog.programs) {
    assert.deepEqual(Object.keys(p.schedule), ['월','화','수','목','금','토','일'], p.id);
  }
});
