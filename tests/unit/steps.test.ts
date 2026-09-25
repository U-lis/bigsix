import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  advanceProposals, applySession, initialState, MAX_STEP, MIN_STEP, setStep, switchProgram,
} from '../../src/lib/domain/index.ts';
import { maintenanceCount, proposeSwitchForCurrent } from '../../src/lib/domain/proposal.ts';
import { abandonChallenge, recordSession } from '../../src/lib/domain/session.ts';
import type { AppState, SessionInput } from '../../src/lib/domain/types.ts';
import {
  ALL_UNLOCKED_STEPS, catalog, plainSession, promoted, readyForProposal, rec, stateAt,
  stintFixture,
} from './helpers.ts';

describe('setStep — 허용 범위 (FR-13.2)', () => {
  const s = stateAt(ALL_UNLOCKED_STEPS);

  it('1~10 은 받는다', () => {
    for (let n = MIN_STEP; n <= MAX_STEP; n += 1) {
      assert.equal(setStep(s, catalog, 'pushup', n).steps.pushup, n);
    }
  });

  it('0 과 11 은 거절한다', () => {
    for (const n of [0, 11, -1, 100]) {
      assert.throws(() => setStep(s, catalog, 'pushup', n), /1~10/);
    }
  });

  it('정수가 아니면 거절한다', () => {
    for (const n of [1.5, NaN, Infinity]) {
      assert.throws(() => setStep(s, catalog, 'pushup', n), /1~10/);
    }
  });
});

describe('setStep — 잠긴 종목 (FR-13.2 / FR-13.5 / EC-27)', () => {
  it('해금 전 브리지·핸드스탠드는 조정할 수 없다', () => {
    const fresh = initialState(2);
    for (const id of ['bridge', 'hspu'] as const) {
      assert.throws(() => setStep(fresh, catalog, id, 5), /잠긴 종목/);
    }
  });

  it('해금 조건을 우회할 수 없다 — 빅4 를 올려 해금한 뒤에야 된다', () => {
    const fresh = initialState(2);
    assert.throws(() => setStep(fresh, catalog, 'bridge', 5));
    const unlocked = stateAt(ALL_UNLOCKED_STEPS);
    assert.equal(setStep(unlocked, catalog, 'bridge', 5).steps.bridge, 5);
  });

  it('무리하게 높은 단계로 올리는 것은 막지 않는다 (FR-13.6)', () => {
    assert.equal(setStep(stateAt(ALL_UNLOCKED_STEPS), catalog, 'pushup', 10).steps.pushup, 10);
  });
});

describe('setStep — history 를 손대지 않는다 (FR-13.4)', () => {
  const history = [rec('pushup', 5, [20, 20]), rec('squat', 5, [30])];

  it('history 배열이 그대로다', () => {
    const before = stateAt(ALL_UNLOCKED_STEPS, history);
    const after = setStep(before, catalog, 'pushup', 3);
    assert.deepEqual(after.history, history);
  });

  it('원본 상태를 변형하지 않는다', () => {
    const before = stateAt(ALL_UNLOCKED_STEPS, history);
    const snapshot = JSON.stringify(before);
    setStep(before, catalog, 'pushup', 3);
    assert.equal(JSON.stringify(before), snapshot);
  });
});

describe('setStep — 앵커 (FR-13.3)', () => {
  it('조정 시점의 history.length 를 앵커로 남긴다', () => {
    const s = stateAt(ALL_UNLOCKED_STEPS, [rec('pushup', 5, [20]), rec('squat', 5, [30])]);
    assert.equal(setStep(s, catalog, 'pushup', 6).adjustedAtSessionIndex?.pushup, 2);
  });

  it('조정하지 않은 종목에는 앵커가 없다', () => {
    const s = setStep(stateAt(ALL_UNLOCKED_STEPS), catalog, 'pushup', 6);
    assert.equal(s.adjustedAtSessionIndex?.squat, undefined);
  });

  it('여러 종목을 조정하면 앵커가 누적된다', () => {
    let s: AppState = stateAt(ALL_UNLOCKED_STEPS, [rec('pushup', 5, [20])]);
    s = setStep(s, catalog, 'pushup', 6);
    s = setStep(s, catalog, 'squat', 4);
    assert.deepEqual(s.adjustedAtSessionIndex, { pushup: 1, squat: 1 });
  });

  it('같은 종목을 다시 조정하면 앵커가 갱신된다', () => {
    let s: AppState = stateAt(ALL_UNLOCKED_STEPS, [rec('pushup', 5, [20])]);
    s = setStep(s, catalog, 'pushup', 6);
    assert.equal(s.adjustedAtSessionIndex?.pushup, 1);
    s = { ...s, history: [...s.history, rec('pushup', 6, [20])] };
    s = setStep(s, catalog, 'pushup', 7);
    assert.equal(s.adjustedAtSessionIndex?.pushup, 2);
  });
});

describe('FR-13.3 불변식 — 조정 이후 세션만 유지 횟수에 센다', () => {
  const START = '2026-09-07';
  const PROMOTE = '2026-09-08';

  it('앵커가 없으면 0.1.0 과 같게 센다', () => {
    const s = readyForProposal('new_blood', START, PROMOTE);
    assert.equal(maintenanceCount(s.history, 'pushup', START), 3);
  });

  it('조정하면 그 시점 이전 세션이 유지 횟수에서 빠진다', () => {
    const before = readyForProposal('new_blood', START, PROMOTE);
    const after = setStep(before, catalog, 'pushup', 6);
    assert.equal(
      maintenanceCount(after.history, 'pushup', START, after.adjustedAtSessionIndex?.pushup),
      0,
      '조정 직후에는 승급 기준점 자체가 없어 0 이다',
    );
  });

  it('조정 뒤 다시 승급하고 3회 채우면 그때부터 다시 센다', () => {
    let s: AppState = setStep(readyForProposal('new_blood', START, PROMOTE), catalog, 'pushup', 6);
    s = { ...s, history: [...s.history, promoted('pushup', 7, '2026-09-14')] };
    for (const d of ['2026-09-15', '2026-09-16', '2026-09-17']) {
      s = { ...s, history: [...s.history, plainSession('pushup', 7, d)] };
    }
    assert.equal(
      maintenanceCount(s.history, 'pushup', START, s.adjustedAtSessionIndex?.pushup), 3,
    );
  });

  it('조정한 종목이 하나라도 있으면 전환 제안이 뜨지 않는다 (EC-26)', () => {
    const MONDAY = '2026-09-14';
    const before = readyForProposal('new_blood', START, PROMOTE);
    assert.notEqual(proposeSwitchForCurrent(before, catalog, MONDAY), null,
      '조정 전에는 제안이 뜬다');
    const after = setStep(before, catalog, 'pushup', 6);
    assert.equal(proposeSwitchForCurrent(after, catalog, MONDAY), null,
      '조정하면 그 종목의 유지 횟수가 0 이 되어 제안이 사라진다');
  });
});

describe('AppState 필드 보존 계약 (Risk 5 / C-2 재발 방지)', () => {
  // 0.1.0 의 applySession 은 { steps, history } 리터럴을 반환해 stints/proposals 를
  // 조용히 버렸다. 컴파일러가 없어 사람이 코드를 읽어서 잡았다. 같은 부류의 결함이
  // adjustedAtSessionIndex 에서 되살아나지 않게 계약으로 고정한다.
  const START = '2026-09-07';
  const seeded = (): AppState => setStep(
    stateAt(
      ALL_UNLOCKED_STEPS,
      [rec('pushup', 7, [20, 20])],
      [stintFixture('new_blood', START, START)],
    ),
    catalog, 'squat', 5,
  );

  const survives = (label: string, f: (s: AppState) => AppState) => {
    it(`${label} 이후에도 앵커가 남는다`, () => {
      const out = f(seeded());
      assert.deepEqual(out.adjustedAtSessionIndex, { squat: 1 }, label);
    });
  };

  const work: SessionInput = {
    date: '2026-09-09', progressionId: 'pushup', step: 7, sets: [20, 20], kind: 'work',
  };

  survives('applySession', (s) => applySession(s, catalog, work).state);
  survives('recordSession', (s) => recordSession(s, catalog, work).state);
  survives('abandonChallenge',
    (s) => abandonChallenge(s, catalog, 'pushup', '2026-09-09', [3]).state);
  survives('switchProgram', (s) => switchProgram(s, catalog, 'good_behavior', '2026-09-09'));
  survives('advanceProposals', (s) => advanceProposals(s, catalog, '2026-09-14'));

  it('조정한 적 없는 상태는 필드가 undefined 로 남는다 (v1 데이터 호환)', () => {
    const s = stateAt(ALL_UNLOCKED_STEPS, [], [stintFixture('new_blood', START, START)]);
    assert.equal(s.adjustedAtSessionIndex, undefined);
    const out = applySession(s, catalog, {
      date: '2026-09-09', progressionId: 'pushup', step: 7, sets: [20, 20], kind: 'work',
    }).state;
    assert.equal(out.adjustedAtSessionIndex, undefined);
  });
});
