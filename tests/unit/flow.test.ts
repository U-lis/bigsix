// @vitest-environment happy-dom
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { loadCatalog } from '../../src/lib/data/catalog.ts';
import {
  advanceProposals, getStep, initialState, planOn, recordSession, selectProgram, setStep,
  topStandard, valueOf,
} from '../../src/lib/domain/index.ts';
import type { AppState } from '../../src/lib/domain/types.ts';

/**
 * 관통 테스트 — 도메인과 저장 계층을 실제 사용 순서대로 한 번 태운다.
 *
 * 단위 테스트들은 각 함수의 계약을 지키지만, "미선택 상태에서 시작해 프로그램을
 * 고르고 그날 계획대로 기록하면 승급한다" 는 **연결**은 아무도 보지 않는다.
 * 0.1.0 의 C-2(applySession 이 필드를 조용히 버림)가 단위 테스트를 전부 통과하고도
 * 살아남았던 것이 그 틈이다. 여기서 그 틈을 덮는다.
 */
describe('관통 — 선택부터 승급까지', () => {
  const catalog = loadCatalog();

  it('프로그램 선택 → 첫 운동일 계획 → 세션 기록 → 승급까지 이어진다', () => {
    let s: AppState = initialState(2);

    // 1. 미선택 상태에서는 계획이 없다.
    assert.equal(planOn(s, catalog, '2026-09-07').kind, 'no-program');

    // 2. 첫 실행 단계 조정 (FR-3.5).
    s = setStep(s, catalog, 'pushup', 3);
    assert.equal(s.steps.pushup, 3);

    // 3. 프로그램 선택.
    s = selectProgram(s, catalog, 'new_blood', '2026-09-07');
    const mon = planOn(s, catalog, '2026-09-07');
    assert.equal(mon.kind, 'plan');
    if (mon.kind !== 'plan') return;
    assert.equal(mon.rest, false);
    assert.ok(mon.exercises.length > 0, '운동일에는 종목이 있다');

    // 4. 그날 계획대로 전 종목을 기록한다. 계획상의 목표가 아니라 그 단계의
    //    최상위 기준(상급자/최상급자)을 넘겨야 승급한다 — 세트 수도 그 기준을 따른다.
    for (const ex of mon.exercises) {
      const step = getStep(catalog, ex.progressionId, ex.step);
      const top = topStandard(step);
      const out = recordSession(s, catalog, {
        date: '2026-09-07',
        progressionId: ex.progressionId,
        step: ex.step,
        sets: Array.from({ length: top.sets }, () => valueOf(top) + 5),
        kind: 'work',
      });
      s = out.state;
    }

    // 5. 상급자 기준을 크게 넘겼으니 승급했어야 한다.
    for (const ex of mon.exercises) {
      assert.ok(
        s.steps[ex.progressionId] > ex.step,
        `${ex.progressionId} 가 승급하지 않았다 (${ex.step} -> ${s.steps[ex.progressionId]})`,
      );
    }

    // 6. 부팅마다 advanceProposals 를 여러 번 불러도 제안이 중복되지 않는다 (EC-19).
    const a = advanceProposals(s, catalog, '2026-09-14');
    const b = advanceProposals(a, catalog, '2026-09-14');
    assert.equal(b.proposals.length, a.proposals.length);
  });

  it('저장 계층이 왕복한다 — 쓰고 읽으면 같은 상태다', async () => {
    const { readAppState, writeAppState } = await import('../../src/lib/ui/storage.ts');
    let s: AppState = selectProgram(initialState(2), loadCatalog(), 'new_blood', '2026-09-07');
    s = setStep(s, loadCatalog(), 'pushup', 4);
    writeAppState(s);
    const back = readAppState();
    assert.equal(back.status, 'ok');
    if (back.status !== 'ok') return;
    assert.deepEqual(back.value, s);
    assert.equal(back.value.adjustedAtSessionIndex?.pushup, 0);
  });
});
