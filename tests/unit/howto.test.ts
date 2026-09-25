/**
 * 동작 설명 순수 함수 (FR-30 / EC-71 / EC-73).
 *
 * `howtoFor` 는 `progressions.json` 의 `Step.summary` 를 화면이 부를 형태로 낸다.
 * 문구를 **가공하지 않는다** (NFR-2 / FR-30.5) — 배열이 문자열 동등해야 한다.
 * `pairWith` 가 있으면 동반 단계까지 두 개, 없으면 하나. `summary` 가 비었으면 그 항목이 빠진다.
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { howtoFor } from '../../src/lib/ui/session/howto.ts';
import type { Catalog, ProgressionId } from '../../src/lib/domain/types.ts';
import { getStep } from '../../src/lib/domain/catalog.ts';
import { catalog } from './helpers.ts';

const BIG_SIX: ProgressionId[] = ['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'];

describe('howtoFor (FR-30)', () => {
  it('푸시업 1단계 이름(한/영) · 쪽수 · summary 를 그대로 낸다', () => {
    const step = getStep(catalog, 'pushup', 1);
    const [h] = howtoFor(catalog, 'pushup', 1);
    assert.equal(h.step, 1);
    assert.equal(h.nameKo, step.name.ko);
    assert.equal(h.nameEn, step.name.en);
    assert.equal(h.page, step.page);
    assert.equal(h.unit, step.unit);
    assert.equal(h.perSide, step.perSide === true);
    // 문자열 동등 — 가공 0.
    assert.deepEqual(h.lines, step.summary);
  });

  it('가공을 하지 않는다 — 반환 줄 배열이 progressions.json 의 summary 와 문자열 동등', () => {
    for (const id of BIG_SIX) {
      for (let n = 1; n <= 10; n += 1) {
        const step = getStep(catalog, id, n);
        const [h] = howtoFor(catalog, id, n);
        assert.deepEqual(h.lines, step.summary, `${id} ${n}단계 lines`);
      }
    }
  });

  it('60단계 전부에 대해 최소 1줄을 낸다 (현재 summary 비어 있는 단계 0건)', () => {
    for (const id of BIG_SIX) {
      for (let n = 1; n <= 10; n += 1) {
        const items = howtoFor(catalog, id, n);
        assert.ok(items.length >= 1, `${id} ${n}단계 최소 1개 항목`);
        assert.ok(items[0].lines.length >= 1, `${id} ${n}단계 최소 1줄`);
      }
    }
  });

  it('unit · perSide 가 카탈로그와 같다 (FR-30.3)', () => {
    for (const id of BIG_SIX) {
      for (let n = 1; n <= 10; n += 1) {
        const step = getStep(catalog, id, n);
        const [h] = howtoFor(catalog, id, n);
        assert.equal(h.unit, step.unit, `${id} ${n}단계 unit`);
        assert.equal(h.perSide, step.perSide === true, `${id} ${n}단계 perSide`);
      }
    }
  });

  it('pairWith 가 있는 단계(핸드스탠드 2단계)는 결과가 2개, 순서는 수행 단계 → 동반 단계', () => {
    // FR-30.4 / EC-73.
    const items = howtoFor(catalog, 'hspu', 2);
    assert.equal(items.length, 2, '수행 단계 + 동반 단계');
    assert.equal(items[0].step, 2, '첫 번째는 수행 단계 그 자체');
    assert.equal(items[1].step, 1, '두 번째는 pairWith 대상');
    // 두 줄 모두 실제 카탈로그 summary 와 동등.
    assert.deepEqual(items[0].lines, getStep(catalog, 'hspu', 2).summary);
    assert.deepEqual(items[1].lines, getStep(catalog, 'hspu', 1).summary);
  });

  it('pairWith 가 없으면 결과가 1개', () => {
    const items = howtoFor(catalog, 'pushup', 1);
    assert.equal(items.length, 1);
    assert.equal(items[0].step, 1);
  });

  it('summary 가 빈 배열인 단계는 결과에서 빠진다 (EC-71)', () => {
    const modified = structuredClone(catalog) as Catalog;
    const pushup = modified.progressions.find((p) => p.id === 'pushup')!;
    const step1 = pushup.steps.find((s) => s.n === 1)!;
    step1.summary = []; // 강제로 빈 배열.
    const items = howtoFor(modified, 'pushup', 1);
    assert.deepEqual(items, [], '빈 summary 단계는 항목 자체가 없다');
  });

  it('pairWith 중 한 쪽 summary 만 비면 남은 쪽만 낸다 (EC-71 × pairWith)', () => {
    const modified = structuredClone(catalog) as Catalog;
    const hspu = modified.progressions.find((p) => p.id === 'hspu')!;
    const paired = hspu.steps.find((s) => s.n === 1)!;
    paired.summary = []; // pairWith 대상만 빈 상태.
    const items = howtoFor(modified, 'hspu', 2);
    assert.equal(items.length, 1, '수행 단계만 남는다');
    assert.equal(items[0].step, 2);
  });

  it('잠긴 종목(브리지·핸드스탠드)이어도 설명 자체는 낸다 — 잠금 판정은 호출부의 몫', () => {
    // 카탈로그만 필요하다. state 를 보지 않으므로 잠금과 무관하게 값이 나온다.
    for (const id of ['bridge', 'hspu'] as const) {
      for (let n = 1; n <= 10; n += 1) {
        const items = howtoFor(catalog, id, n);
        assert.ok(items.length >= 1, `${id} ${n}단계 설명`);
      }
    }
  });
});
