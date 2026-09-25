import { test } from 'vitest';
import assert from 'node:assert/strict';
import { checkGate, unlockedProgressions } from '../../src/lib/domain/gate.ts';
import { catalog, stateAt } from './helpers.ts';

test('빅4는 항상 열려 있다', () => {
  const s = stateAt({});
  for (const id of ['pushup', 'squat', 'pullup', 'legraise'] as const) {
    assert.equal(checkGate(s, catalog, id).unlocked, true);
  }
});

test('시작 상태에서 브리지·핸드스탠드는 잠겨 있다', () => {
  const s = stateAt({});
  for (const id of ['bridge', 'hspu'] as const) {
    const g = checkGate(s, catalog, id);
    assert.equal(g.unlocked, false);
    assert.equal(g.blocking.length, 4);
  }
  assert.deepEqual(unlockedProgressions(s, catalog).sort(),
    ['legraise', 'pullup', 'pushup', 'squat']);
});

test('빅4 중 하나라도 6단계를 완료하지 못하면 계속 잠긴다', () => {
  const s = stateAt({ pushup: 7, squat: 7, pullup: 7, legraise: 6 });
  const g = checkGate(s, catalog, 'bridge');
  assert.equal(g.unlocked, false);
  assert.deepEqual(g.blocking.map((b) => b.progressionId), ['legraise']);
  assert.match(g.reason, /레그 레이즈 6단계/);
});

test('빅4 전부 6단계 완료 시 해금된다', () => {
  const s = stateAt({ pushup: 7, squat: 7, pullup: 7, legraise: 7 });
  assert.equal(checkGate(s, catalog, 'bridge').unlocked, true);
  assert.equal(checkGate(s, catalog, 'hspu').unlocked, true);
  assert.equal(unlockedProgressions(s, catalog).length, 6);
});
