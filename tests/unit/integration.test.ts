import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ALL_UNLOCKED_STEPS, catalog, maintainedHistory, plainSession, promoted,
  readyForProposal, stateAt, stintFixture,
} from './helpers.ts';
import {
  MAINTENANCE_SESSIONS, abandonChallenge, acceptProposal, activeProposal, advanceProposals,
  commitProposal, currentStint, dayNumber, declineProposal, initialState, maintenanceCount,
  proposeSwitch, proposeSwitchForCurrent, recordConsolidation, recordSession, switchProgram,
} from '../../src/lib/domain/index.ts';
import * as api from '../../src/lib/domain/index.ts';
import type { AppState, IsoDate, SwitchProposal } from '../../src/lib/domain/types.ts';

// ── 날짜 상수 ────────────────────────────────────────────────────────────────
// 2026-09 의 월요일: 07, 14, 21, 28
const MON_07: IsoDate = '2026-09-07';
const MON_14: IsoDate = '2026-09-14';
const MON_21: IsoDate = '2026-09-21';
const TUE_08: IsoDate = '2026-09-08';
const WED_16: IsoDate = '2026-09-16';
const THU_17: IsoDate = '2026-09-17';

/** good_behavior 구간이 08-31 에 시작하고 09-01 에 전 종목이 승급한 상태. */
const ready = () => readyForProposal('good_behavior', '2026-08-31', '2026-09-01');

const src = (name: string) =>
  readFileSync(new URL(`../../src/lib/domain/${name}`, import.meta.url).pathname, 'utf8');

/**
 * 모듈이 **정적 import** 하는 지정자 목록.
 * 주석이나 문자열에 모듈 이름이 언급되는 것만으로는 잡히지 않는다.
 */
const importsOf = (name: string): string[] =>
  [...src(name).matchAll(/^\s*import\s[\s\S]*?from\s*'([^']+)'/gm)].map((m) => m[1]);

/** good_behavior / veterano 가 다루는 빅6 전부. */
const BIG6 = ['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'] as const;

// ── proposeSwitchForCurrent (EC-7 배선) ──────────────────────────────────────

describe('proposeSwitchForCurrent', () => {
  it('프로그램 미선택 상태에서는 예외가 아니라 null', () => {
    assert.equal(proposeSwitchForCurrent(initialState(), catalog, MON_14), null);
  });

  it('currentStint 의 programId 가 fromProgramId 로 전달된다', () => {
    const p = proposeSwitchForCurrent(ready(), catalog, MON_14);
    assert.notEqual(p, null);
    assert.equal(p!.fromProgramId, 'good_behavior');
    assert.equal(p!.toProgramId, 'veterano');
  });

  it('EC-7 currentStint.startedAt 이 floorDate 로 전달된다 — 구간 이전의 승급은 세지 않는다', () => {
    // 승급은 09-07, 구간 시작은 09-14. 하한이 구간 시작일이므로 카운트가 0 이다.
    const state = readyForProposal('good_behavior', MON_14, MON_07);
    assert.equal(proposeSwitchForCurrent(state, catalog, MON_21), null);
  });

  it('화요일에는 여전히 null (FR-4.6)', () => {
    assert.equal(proposeSwitchForCurrent(ready(), catalog, TUE_08), null);
  });

  it('NFR-2 원본 state 를 변형하지 않는다', () => {
    const state = ready();
    const before = JSON.stringify(state);
    proposeSwitchForCurrent(state, catalog, MON_14);
    assert.equal(JSON.stringify(state), before);
  });
});

// ── activeProposal — 현재 구간 필터 (W-3 (a)) ────────────────────────────────

describe('activeProposal — 현재 구간 필터 (W-3 (a))', () => {
  /** good_behavior 구간에서 제안이 하나 적재된 상태. */
  function withPending(): AppState {
    return advanceProposals(ready(), catalog, MON_14);
  }

  it('현재 구간과 fromProgramId 가 일치하는 pending 을 반환한다', () => {
    const state = withPending();
    assert.equal(activeProposal(state)!.fromProgramId, 'good_behavior');
  });

  it('수동 전환으로 생긴 고아 pending 은 반환하지 않는다', () => {
    const state = switchProgram(withPending(), catalog, 'veterano', '2026-09-15');
    assert.equal(activeProposal(state), null);
  });

  it('고아 pending 이 proposals 에서 삭제되지 않는다 — 이력 보존', () => {
    const state = switchProgram(withPending(), catalog, 'veterano', '2026-09-15');
    assert.equal(state.proposals.length, 1);
    assert.equal(state.proposals[0].status, 'pending');
  });

  it('고아 pending 이 새 제안 생성을 막지 않는다 (FR-4.6b)', () => {
    // veterano 로 수동 전환한 뒤, 새 구간 기준으로 다시 조건을 채운다.
    let state = switchProgram(withPending(), catalog, 'veterano', '2026-09-15');
    const stint = currentStint(state)!;
    state = {
      ...state,
      history: [...state.history, ...maintainedHistory(['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'], stint.startedAt)],
    };
    const again = proposeSwitchForCurrent(state, catalog, '2026-09-28');
    assert.notEqual(again, null);
    assert.equal(again!.fromProgramId, 'veterano');
  });

  it('프로그램 미선택 상태에서는 null', () => {
    const proposal: SwitchProposal = {
      proposedAt: MON_14,
      fromProgramId: 'good_behavior',
      toProgramId: 'veterano',
      status: 'pending',
      resolvedAt: null,
    };
    assert.equal(activeProposal(stateAt({}, [], [], [proposal])), null);
  });

  it('FR-4.6a 미결 제안은 날짜와 무관하게 계속 노출된다', () => {
    const state = withPending();
    const p = activeProposal(state);
    assert.notEqual(p, null);
    assert.equal(p!.proposedAt, MON_14);

    // 제안일로부터 한 달 뒤까지 세션이 쌓여도 같은 제안이 그대로 노출된다.
    const later: AppState = {
      ...state,
      history: [...state.history, plainSession('pushup', 5, '2026-10-14')],
    };
    assert.deepEqual(activeProposal(later), p);

    // 사라지는 유일한 조건은 승인·거절이다 — 날짜가 아니다.
    assert.equal(activeProposal(declineProposal(later, '2026-10-15')), null);
  });

  it('원래 프로그램으로 되돌아오면 그 pending 이 다시 보인다 — 필터는 가시성 조건이다', () => {
    let state = switchProgram(withPending(), catalog, 'veterano', '2026-09-15');
    assert.equal(activeProposal(state), null);
    state = switchProgram(state, catalog, 'good_behavior', WED_16);
    assert.equal(activeProposal(state)!.fromProgramId, 'good_behavior');
  });
});

// ── advanceProposals (W-3 (b)) ───────────────────────────────────────────────

describe('advanceProposals', () => {
  it('조건 미달이면 인자 state 를 그대로 반환한다', () => {
    const state = stateAt(ALL_UNLOCKED_STEPS, [], [stintFixture('good_behavior', '2026-08-31', '2026-08-31')]);
    assert.equal(advanceProposals(state, catalog, MON_14), state);
  });

  it('화요일에는 상태가 변하지 않는다 (FR-4.6)', () => {
    const state = ready();
    assert.equal(advanceProposals(state, catalog, TUE_08), state);
  });

  it('월요일에 조건이 충족되면 pending 이 적재된다', () => {
    const next = advanceProposals(ready(), catalog, MON_14);
    assert.equal(next.proposals.length, 1);
    assert.equal(next.proposals.at(-1)!.status, 'pending');
  });

  it('proposeSwitchForCurrent + commitProposal 을 순서대로 부른 결과와 같다', () => {
    const state = ready();
    const manual = commitProposal(state, proposeSwitchForCurrent(state, catalog, MON_14)!);
    assert.deepEqual(advanceProposals(state, catalog, MON_14), manual);
  });

  it('같은 날 두 번 호출해도 pending 은 1개다 (FR-4.6b)', () => {
    const once = advanceProposals(ready(), catalog, MON_14);
    const twice = advanceProposals(once, catalog, MON_14);
    assert.equal(twice.proposals.filter((p) => p.status === 'pending').length, 1);
  });

  it('프로그램 미선택 상태에서는 no-op', () => {
    const state = initialState();
    assert.equal(advanceProposals(state, catalog, MON_14), state);
  });

  it('NFR-2 원본 state 를 변형하지 않는다', () => {
    const state = ready();
    advanceProposals(state, catalog, MON_14);
    assert.equal(state.proposals.length, 0);
  });

  it('advanceProposals 와 별개로, opts 를 직접 주는 2단계 경로도 그대로 동작한다', () => {
    const state = ready();
    const p = proposeSwitch(state, catalog, MON_14, {
      floorDate: '2026-08-31', programId: 'good_behavior',
    });
    assert.notEqual(p, null);
    assert.equal(commitProposal(state, p!).proposals.length, 1);

    // 넘긴 opts 가 실제로 판정에 쓰인다 — 하한을 승급일 뒤로 옮기면 같은 상태에서도 null 이다.
    assert.equal(proposeSwitch(state, catalog, MON_14, {
      floorDate: '2026-09-08', programId: 'good_behavior',
    }), null);
    // programId 도 마찬가지다 — supermax 는 다음 순번이 없다 (FR-4.7).
    assert.equal(proposeSwitch(state, catalog, MON_14, {
      floorDate: '2026-08-31', programId: 'supermax',
    }), null);
  });
});

// ── acceptProposal (FR-4.8) ──────────────────────────────────────────────────

describe('acceptProposal (FR-4.8)', () => {
  const pending = () => advanceProposals(ready(), catalog, MON_14);

  it('pending 이 없으면 no-op', () => {
    const state = ready();
    assert.equal(acceptProposal(state, catalog, WED_16), state);
  });

  it('제안이 accepted 로 갱신된다', () => {
    const next = acceptProposal(pending(), catalog, WED_16);
    assert.equal(next.proposals.at(-1)!.status, 'accepted');
    assert.equal(next.proposals.at(-1)!.resolvedAt, WED_16);
  });

  it('새 구간이 생성된다', () => {
    const before = pending();
    const next = acceptProposal(before, catalog, WED_16);
    assert.equal(next.stints.length, before.stints.length + 1);
    assert.equal(currentStint(next)!.programId, 'veterano');
  });

  it('이전 구간이 승인일로 마감된다', () => {
    const next = acceptProposal(pending(), catalog, WED_16);
    assert.equal(next.stints[0].endedAt, WED_16);
  });

  it('FR-4.8 승인일이 월요일이 아니어도 전환된다 — 요일 검사가 없다', () => {
    const next = acceptProposal(pending(), catalog, THU_17);
    assert.equal(currentStint(next)!.programId, 'veterano');
    assert.equal(currentStint(next)!.selectedAt, THU_17);
  });

  it('FR-2.6 승인일이 새 루틴의 휴식일이면 startedAt 이 다음 첫 운동일이다', () => {
    // new_blood 는 월·목만 운동한다. 화요일에 승인하면 목요일이 1일차다.
    const proposal: SwitchProposal = {
      proposedAt: MON_07,
      fromProgramId: 'good_behavior',
      toProgramId: 'new_blood',
      status: 'pending',
      resolvedAt: null,
    };
    const state = stateAt(
      ALL_UNLOCKED_STEPS, [],
      [stintFixture('good_behavior', '2026-08-31', '2026-08-31')], [proposal],
    );
    const next = acceptProposal(state, catalog, TUE_08);
    const stint = currentStint(next)!;
    assert.equal(stint.programId, 'new_blood');
    assert.equal(stint.selectedAt, TUE_08);
    assert.equal(stint.startedAt, '2026-09-10');
  });

  it('승인일이 새 루틴의 운동일이면 selectedAt 과 startedAt 이 같다', () => {
    // veterano 는 월~토 운동한다.
    const stint = currentStint(acceptProposal(pending(), catalog, WED_16))!;
    assert.equal(stint.selectedAt, WED_16);
    assert.equal(stint.startedAt, WED_16);
  });

  it('FR-3.5 steps 와 history 가 변경되지 않는다', () => {
    const before = pending();
    const next = acceptProposal(before, catalog, WED_16);
    assert.deepEqual(next.steps, before.steps);
    assert.deepEqual(next.history, before.history);
  });

  it('승인 후 activeProposal 이 null', () => {
    assert.equal(activeProposal(acceptProposal(pending(), catalog, WED_16)), null);
  });

  it('NFR-2 원본 state 를 변형하지 않는다', () => {
    const state = pending();
    const before = JSON.stringify(state);
    acceptProposal(state, catalog, WED_16);
    assert.equal(JSON.stringify(state), before);
  });

  it('markAccepted 와 switchProgram 의 효과가 모두 반영된다', () => {
    const next = acceptProposal(pending(), catalog, WED_16);
    assert.equal(next.proposals.at(-1)!.status, 'accepted');
    assert.equal(next.stints.length, 2);
  });

  it('연속 두 번 호출하면 두 번째는 no-op', () => {
    const once = acceptProposal(pending(), catalog, WED_16);
    assert.equal(acceptProposal(once, catalog, THU_17), once);
  });
});

// ── EC-7: 프로그램 전환 시 3회 카운트 리셋 ───────────────────────────────────

describe('EC-7 프로그램 전환 시 카운트 리셋', () => {
  it('전환 전에는 제안이 생성되고, 전환 직후에는 생성되지 않는다', () => {
    const before = ready();
    assert.notEqual(proposeSwitchForCurrent(before, catalog, MON_14), null);

    const after = switchProgram(before, catalog, 'veterano', '2026-09-15');
    assert.equal(proposeSwitchForCurrent(after, catalog, MON_21), null);
  });

  it('전환 후 새 구간 기준으로 다시 3회를 채우면 제안이 생성된다', () => {
    let state = switchProgram(ready(), catalog, 'veterano', '2026-09-15');
    const stint = currentStint(state)!;
    state = {
      ...state,
      history: [...state.history, ...maintainedHistory(['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'], stint.startedAt)],
    };
    const p = proposeSwitchForCurrent(state, catalog, '2026-09-28');
    assert.notEqual(p, null);
    assert.equal(p!.fromProgramId, 'veterano');
    assert.equal(p!.toProgramId, 'solitary_confinement');
  });

  it('전환해도 history 는 삭제되지 않는다 — 리셋은 판정 범위 축소다', () => {
    const before = ready();
    const after = switchProgram(before, catalog, 'veterano', '2026-09-15');
    assert.equal(after.history.length, before.history.length);
    assert.deepEqual(after.history, before.history);
  });

  it('EC-7 리셋은 데이터 삭제가 아니라 판정 범위 축소다 (ADR-7)', () => {
    // 전용 리셋 코드가 없다는 것을 소스 문자열이 아니라 동작으로 확인한다.
    // 카운트가 파생 계산이라면, 같은 history 를 옛 하한으로 계산했을 때
    // 전환 이전의 카운트가 그대로 되살아나야 한다.
    const before = ready();
    const oldFloor = currentStint(before)!.startedAt;
    const after = switchProgram(before, catalog, 'veterano', '2026-09-15');
    const newFloor = currentStint(after)!.startedAt;

    assert.deepEqual(after.history, before.history);
    for (const id of BIG6) {
      // 새 구간 하한으로는 0 — 이것이 EC-7 의 "리셋" 이다.
      assert.equal(maintenanceCount(after.history, id, newFloor), 0, `${id} 새 하한`);
      // 옛 하한으로는 전환 전 카운트가 그대로다 — 지워진 데이터가 없다.
      assert.ok(
        maintenanceCount(after.history, id, oldFloor) >= MAINTENANCE_SESSIONS,
        `${id} 옛 하한`,
      );
    }
  });
});

// ── 제안 승인 → 새 구간 1일차 전체 흐름 ──────────────────────────────────────

describe('생성 → 커밋 → 매일 노출 → 승인 → 새 구간 1일차', () => {
  it('전체 흐름이 이어진다 (FR-4.6 → FR-4.6a → FR-4.8 → FR-2.6)', () => {
    const state = ready();
    const proposal = proposeSwitchForCurrent(state, catalog, MON_14);
    assert.notEqual(proposal, null);

    const committed = commitProposal(state, proposal!);
    assert.deepEqual(activeProposal(committed), proposal);

    // 날짜를 받지 않으므로 화·수에도 같은 제안이 그대로 노출된다.
    assert.deepEqual(activeProposal(committed), proposal);

    const accepted = acceptProposal(committed, catalog, WED_16);
    const stint = currentStint(accepted)!;
    assert.equal(stint.programId, 'veterano');
    assert.equal(stint.selectedAt, WED_16);
    assert.equal(stint.startedAt, WED_16);
    assert.equal(dayNumber(stint, WED_16), 1);
    assert.equal(activeProposal(accepted), null);
  });

  it('거절하면 구간이 바뀌지 않는다', () => {
    const committed = advanceProposals(ready(), catalog, MON_14);
    const declined = declineProposal(committed, WED_16);
    assert.equal(declined.stints.length, committed.stints.length);
    assert.equal(currentStint(declined)!.programId, 'good_behavior');
    assert.equal(declined.proposals.at(-1)!.status, 'declined');
  });

  it('FR-4.9 거절 후 다음 월요일에 재제안되고, 그때 승인하면 전환된다', () => {
    let state = declineProposal(advanceProposals(ready(), catalog, MON_14), WED_16);
    state = advanceProposals(state, catalog, MON_21);
    assert.notEqual(activeProposal(state), null);

    state = acceptProposal(state, catalog, MON_21);
    assert.equal(currentStint(state)!.programId, 'veterano');
  });
});

// ── 3C ↔ 3B: 포기 기록이 카운트를 무효화한다 (EC-5) ──────────────────────────

describe('3C ↔ 3B 상호작용 (EC-5)', () => {
  it('abandonChallenge 가 남긴 기록이 제안을 막는다', () => {
    const base = ready();
    assert.notEqual(proposeSwitchForCurrent(base, catalog, MON_14), null);

    const { state } = abandonChallenge(base, catalog, 'pushup', '2026-09-15', [2]);
    assert.equal(proposeSwitchForCurrent(state, catalog, MON_21), null);
  });

  it('recordConsolidation 이 남긴 다지기 기록도 동일하게 작동한다', () => {
    const base = ready();
    const { state } = recordConsolidation(base, catalog, 'squat', '2026-09-15', [8, 8]);
    assert.equal(proposeSwitchForCurrent(state, catalog, MON_21), null);
  });
});

// ── 3C ↔ 3A: 전환이 세션 기록을 건드리지 않는다 (FR-3.5) ─────────────────────

describe('3C ↔ 3A 상호작용 (FR-3.5)', () => {
  it('여러 세션을 기록한 뒤 전환해도 history 와 steps 가 보존된다', () => {
    let state = stateAt(
      { pushup: 2, squat: 2, pullup: 2, legraise: 2 }, [],
      [stintFixture('good_behavior', '2026-08-31', '2026-08-31')],
    );

    const dates: IsoDate[] = ['2026-09-01', '2026-09-03', '2026-09-05', '2026-09-07', '2026-09-09'];
    // 앞의 두 번은 목표를 크게 넘겨 승급시키고, 나머지는 유지 세션이다.
    dates.forEach((date, i) => {
      const sets = i < 2 ? [60, 60, 60] : [5, 5];
      const id = i < 2 ? (i === 0 ? 'pushup' : 'squat') : 'pullup';
      state = recordSession(state, catalog, {
        date, progressionId: id, step: state.steps[id], sets, kind: 'work',
      }).state;
    });

    assert.equal(state.history.length, 5);
    assert.equal(state.history.filter((r) => r.promotedTo !== undefined).length, 2);

    const stepsBefore = { ...state.steps };
    const after = switchProgram(state, catalog, 'veterano', MON_14);
    assert.equal(after.history.length, 5);
    assert.deepEqual(after.history, state.history);
    assert.deepEqual(after.steps, stepsBefore);
  });
});

// ── 병합 정합성 / 경계 ───────────────────────────────────────────────────────

describe('병합 정합성', () => {
  it('3A 가 만든 상태를 3B·3C 함수에 그대로 넘길 수 있다', () => {
    let state = switchProgram(stateAt(ALL_UNLOCKED_STEPS), catalog, 'good_behavior', '2026-08-31');
    state = {
      ...state,
      history: maintainedHistory(['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'], '2026-09-01'),
    };
    state = advanceProposals(state, catalog, MON_14);
    assert.notEqual(activeProposal(state), null);

    const { state: afterSession } = recordConsolidation(state, catalog, 'pushup', '2026-09-15', [8, 8]);
    assert.equal(afterSession.stints.length, 1);
    assert.equal(afterSession.proposals.length, 1);
  });

  it('program.ts 는 proposals 를 읽지도 쓰지도 않는다 — 의존 방향이 단방향이다', () => {
    // 순환 없음의 실체는 "program 이 proposal 을 모른다" 이다.
    // 주석에 단어가 있는지가 아니라, 정적 import 지정자와 실제 동작으로 확인한다.
    assert.equal(importsOf('program.ts').some((spec) => spec.includes('proposal')), false);
    assert.ok(importsOf('proposal.ts').includes('./program.ts'));

    // pending 이 있는 상태를 program.ts 의 전이에 통과시켜도 proposals 는 손대지 않는다.
    const state = advanceProposals(ready(), catalog, MON_14);
    assert.equal(state.proposals.length, 1);
    const after = switchProgram(state, catalog, 'veterano', '2026-09-15');
    assert.equal(after.proposals, state.proposals, 'proposals 배열이 같은 참조여야 한다');

    // proposals 를 비운 상태에서도 program.ts 의 전이는 동일한 stints 를 만든다.
    const without = switchProgram({ ...state, proposals: [] }, catalog, 'veterano', '2026-09-15');
    assert.deepEqual(without.stints, after.stints);
  });

  it('index.ts 가 세 모듈의 공개 함수를 전부 export 한다', () => {
    for (const fn of [
      // 3A
      'describeProgram', 'describePrograms', 'firstTrainingDay', 'selectProgram',
      'switchProgram', 'currentStint', 'stintAt', 'dayNumber', 'dayNumberOn',
      // 3B + 3.5 배선
      'proposeSwitch', 'proposeSwitchForCurrent', 'advanceProposals', 'commitProposal',
      'activeProposal', 'declineProposal', 'markAccepted', 'nextProgramId', 'acceptProposal',
      // 3C
      'abandonChallenge', 'recordSession', 'recordConsolidation',
      // Phase 1/2 회귀
      'planDay', 'planWeek', 'planExercise', 'checkGate', 'applySession', 'initialState',
    ]) {
      assert.equal(typeof (api as Record<string, unknown>)[fn], 'function', `${fn} 미노출`);
    }
    assert.ok(Array.isArray(api.PROGRAM_ORDER));
  });
});

describe('경계 조건', () => {
  it('supermax 구간에서는 항상 null 이다', () => {
    const state = readyForProposal('supermax', '2026-08-31', '2026-09-01');
    assert.equal(proposeSwitchForCurrent(state, catalog, MON_14), null);
  });

  it('구간 시작 당일에 전환하면 endedAt 이 selectedAt 과 같은 하루짜리 구간이 된다', () => {
    const state = switchProgram(
      stateAt(ALL_UNLOCKED_STEPS, [], [stintFixture('good_behavior', MON_14, MON_14)]),
      catalog, 'veterano', MON_14,
    );
    assert.equal(state.stints[0].endedAt, MON_14);
    assert.equal(state.stints[0].selectedAt, MON_14);
  });

  it('제안 생성 당일(월요일)에 즉시 승인해도 정상 동작한다', () => {
    const state = acceptProposal(advanceProposals(ready(), catalog, MON_14), catalog, MON_14);
    assert.equal(currentStint(state)!.programId, 'veterano');
    assert.equal(currentStint(state)!.startedAt, MON_14);
  });

  it('프로그램 미선택 상태에서 acceptProposal 은 no-op', () => {
    const state = initialState();
    assert.equal(acceptProposal(state, catalog, MON_14), state);
  });

  it('구간 이전에 쌓인 유지 세션은 카운트에 들어가지 않는다', () => {
    // 승급 09-01, 유지 세션 09-03/05/07 — 전부 구간 시작(09-08) 이전이다.
    const state = stateAt(
      ALL_UNLOCKED_STEPS,
      [promoted('pushup', 3, '2026-09-01'), plainSession('pushup', 4, '2026-09-03')],
      [stintFixture('good_behavior', TUE_08, TUE_08)],
    );
    assert.equal(proposeSwitchForCurrent(state, catalog, MON_14), null);
  });
});
