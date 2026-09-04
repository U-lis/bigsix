import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { catalog, stateAt } from './helpers.ts';
import { addDays } from '../src/date.ts';
import {
  PROGRAM_ORDER,
  activeProposal,
  commitProposal,
  declineProposal,
  effectiveFloorIndex,
  lastSetbackIndex,
  maintenanceCount,
  markAccepted,
  nextProgramId,
  programProgressions,
  promotionBaselineIndex,
  proposeSwitch,
} from '../src/proposal.ts';
import type {
  AppState, IsoDate, ProgramStint, ProgressionId, SessionRecord, SwitchProposal,
} from '../src/types.ts';

// ── 로컬 픽스처 (test/helpers.ts 는 수정하지 않는다) ──────────────────────────

/** 승급이 일어난 세션. */
function promoted(id: ProgressionId, step: number, date: IsoDate): SessionRecord {
  return { date, progressionId: id, step, sets: [10, 10], kind: 'work', promotedTo: step + 1 };
}

/** 승급 없는 평범한 세션. */
function plainSession(id: ProgressionId, step: number, date: IsoDate): SessionRecord {
  return { date, progressionId: id, step, sets: [8, 8], kind: 'work' };
}

/** '불가능' 을 눌러 중단한 세션 (강등). */
function abandoned(id: ProgressionId, step: number, date: IsoDate): SessionRecord {
  return { date, progressionId: id, step, sets: [2], kind: 'work', outcome: 'abandoned' };
}

/** 이전 단계를 다지는 세션 (강등). */
function consolidation(id: ProgressionId, step: number, date: IsoDate): SessionRecord {
  return {
    date, progressionId: id, step, performedStep: step - 1,
    sets: [8, 8], kind: 'consolidation',
  };
}

/** RPE 거부권으로 승급이 보류된 세션 (EC-11). */
function rpeBlocked(id: ProgressionId, step: number, date: IsoDate): SessionRecord {
  return { date, progressionId: id, step, sets: [10, 10], kind: 'work', rpe: 9, blockedBy: 'rpe' };
}

/** 10단계라 더 올라갈 곳이 없어 보류된 세션. */
function masterBlocked(id: ProgressionId, step: number, date: IsoDate): SessionRecord {
  return { date, progressionId: id, step, sets: [10, 10], kind: 'work', blockedBy: 'master' };
}

/** 여러 종목을 promoteDate 에 승급시키고 그 이후 n 회의 유지 세션을 붙인다. */
function maintained(ids: ProgressionId[], promoteDate: IsoDate, n: number): SessionRecord[] {
  const out: SessionRecord[] = [];
  for (const id of ids) {
    out.push(promoted(id, 3, promoteDate));
    for (let i = 1; i <= n; i += 1) out.push(plainSession(id, 4, addDays(promoteDate, i * 2)));
  }
  return out;
}

const MON = '2026-09-07';
const NEXT_MON = '2026-09-14';
const FLOOR = '2026-09-01';

/** good_behavior 는 빅6 전부를 다룬다. 빅4 만 해금된 상태의 픽스처. */
const BIG4: ProgressionId[] = ['pushup', 'squat', 'pullup', 'legraise'];

/**
 * good_behavior 를 수행 중인 구간.
 * Phase 3.5 에서 `activeProposal` 이 현재 구간을 읽게 되었으므로 (W-3 (a)),
 * 미결 제안이 있는 상태는 그 제안을 낸 구간도 함께 가지고 있어야 한다.
 */
const GB_STINT: ProgramStint = {
  programId: 'good_behavior', selectedAt: FLOOR, startedAt: FLOOR, endedAt: null,
};

function big4State(history: SessionRecord[], proposals: SwitchProposal[] = []): AppState {
  return stateAt(
    { pushup: 4, squat: 4, pullup: 4, legraise: 4 }, history, [GB_STINT], proposals,
  );
}

function allUnlockedState(history: SessionRecord[], proposals: SwitchProposal[] = []): AppState {
  return stateAt(
    { pushup: 7, squat: 7, pullup: 7, legraise: 7, bridge: 4, hspu: 4 },
    history, [GB_STINT], proposals,
  );
}

const opts = (programId = 'good_behavior', floorDate: IsoDate = FLOOR) => ({ programId, floorDate });

// ── nextProgramId (FR-4.7) ───────────────────────────────────────────────────

describe('nextProgramId', () => {
  it('고정 순서를 따른다', () => {
    assert.equal(nextProgramId('new_blood'), 'good_behavior');
    assert.equal(nextProgramId('good_behavior'), 'veterano');
    assert.equal(nextProgramId('veterano'), 'solitary_confinement');
    assert.equal(nextProgramId('solitary_confinement'), 'supermax');
  });

  it('supermax 에서는 제안하지 않는다', () => {
    assert.equal(nextProgramId('supermax'), null);
  });

  it('알 수 없는 id 는 예외가 아니라 null 이다', () => {
    assert.equal(nextProgramId('unknown_program'), null);
  });

  it('PROGRAM_ORDER 가 카탈로그의 5종 id 와 정확히 일치한다', () => {
    assert.deepEqual(
      [...PROGRAM_ORDER].sort(),
      catalog.programs.map((p) => p.id).sort(),
    );
  });
});

// ── lastSetbackIndex (FR-4.3, EC-5) ──────────────────────────────────────────
//
// 반환값은 날짜가 아니라 `history` 인덱스다 (W-1 수정).
// 같은 날 안에서의 순서를 구분해야 EC-4(같은 날 2회)가 정확해지기 때문이다.

describe('lastSetbackIndex', () => {
  it('강등 기록이 없으면 null', () => {
    const h = [promoted('pushup', 3, MON), plainSession('pushup', 4, '2026-09-09')];
    assert.equal(lastSetbackIndex(h, 'pushup', FLOOR), null);
  });

  it("outcome: 'abandoned' 세션의 인덱스를 반환한다", () => {
    const h = [plainSession('pushup', 4, '2026-09-07'), abandoned('pushup', 4, '2026-09-09')];
    assert.equal(lastSetbackIndex(h, 'pushup', FLOOR), 1);
    assert.equal(h[1].date, '2026-09-09');
  });

  it("kind: 'consolidation' 세션의 인덱스를 반환한다", () => {
    const h = [plainSession('pushup', 4, '2026-09-07'), consolidation('pushup', 4, '2026-09-09')];
    assert.equal(lastSetbackIndex(h, 'pushup', FLOOR), 1);
    assert.equal(h[1].date, '2026-09-09');
  });

  it('강등이 2개면 가장 늦은 것을 반환한다', () => {
    const h = [abandoned('pushup', 4, '2026-09-09'), consolidation('pushup', 4, '2026-09-15')];
    assert.equal(lastSetbackIndex(h, 'pushup', FLOOR), 1);
  });

  it('같은 날 강등이 2개면 뒤에 기록된 것을 반환한다', () => {
    // 날짜만으로는 구분되지 않는 경계다 — 인덱스라서 구분된다.
    const h = [abandoned('pushup', 4, MON), consolidation('pushup', 4, MON)];
    assert.equal(lastSetbackIndex(h, 'pushup', FLOOR), 1);
  });

  it('floorDate 이전의 강등은 무시된다', () => {
    const h = [abandoned('pushup', 4, '2026-09-09')];
    assert.equal(lastSetbackIndex(h, 'pushup', '2026-09-14'), null);
  });

  it('다른 종목의 강등은 무시된다', () => {
    const h = [abandoned('squat', 4, '2026-09-09')];
    assert.equal(lastSetbackIndex(h, 'pushup', FLOOR), null);
  });
});

// ── effectiveFloorIndex (EC-5 하한 승격) ─────────────────────────────────────
//
// 날짜 하한(`floorDate`)이 아니라 **인덱스 하한**을 돌려준다.
// 날짜 하한은 조회 시점에 따로 적용되므로, 여기서 검증하는 것은
// "강등 바로 다음 세션부터 다시 본다" 하나다.

describe('effectiveFloorIndex', () => {
  it('강등이 없으면 인덱스 제약이 없다 (0)', () => {
    assert.equal(effectiveFloorIndex([], 'pushup', FLOOR), 0);
    const h = [promoted('pushup', 3, MON), plainSession('pushup', 4, '2026-09-09')];
    assert.equal(effectiveFloorIndex(h, 'pushup', FLOOR), 0);
  });

  it('강등이 있으면 그 다음 인덱스부터 본다', () => {
    const h = [promoted('pushup', 3, MON), abandoned('pushup', 4, '2026-09-09')];
    assert.equal(effectiveFloorIndex(h, 'pushup', FLOOR), 2);
  });

  it('강등이 floorDate 보다 이르면 무시되어 하한이 오르지 않는다', () => {
    const h = [abandoned('pushup', 4, '2026-09-09'), promoted('pushup', 3, '2026-09-16')];
    assert.equal(effectiveFloorIndex(h, 'pushup', '2026-09-14'), 0);
    // 날짜 하한은 조회 시점에 적용되므로 09-09 세션은 어차피 후보가 아니다.
    assert.equal(promotionBaselineIndex(h, 'pushup', '2026-09-14'), 1);
  });

  it('강등이 여러 개면 마지막 것 기준이다', () => {
    const h = [abandoned('pushup', 4, '2026-09-09'), consolidation('pushup', 4, '2026-09-15')];
    assert.equal(effectiveFloorIndex(h, 'pushup', FLOOR), 2);
  });
});

// ── promotionBaselineIndex (ADR-7, EC-5, EC-6, EC-11) ────────────────────────

describe('promotionBaselineIndex', () => {
  it('승급 레코드가 없으면 null', () => {
    const h = [
      plainSession('pushup', 3, MON),
      plainSession('pushup', 3, '2026-09-09'),
      plainSession('pushup', 3, '2026-09-11'),
    ];
    assert.equal(promotionBaselineIndex(h, 'pushup', FLOOR), null);
  });

  it('승급 레코드 1개의 인덱스를 반환한다', () => {
    const h = [plainSession('pushup', 3, FLOOR), promoted('pushup', 3, MON)];
    assert.equal(promotionBaselineIndex(h, 'pushup', FLOOR), 1);
  });

  it('EC-6 승급이 2개면 가장 이른 것이 기준점이다', () => {
    const h = [
      promoted('pushup', 3, MON),
      plainSession('pushup', 4, '2026-09-09'),
      promoted('pushup', 4, '2026-09-11'),
    ];
    assert.equal(promotionBaselineIndex(h, 'pushup', FLOOR), 0);
    assert.equal(h[0].date, MON);
  });

  it('floorDate 이전의 승급은 무시된다', () => {
    const h = [promoted('pushup', 3, '2026-09-01')];
    assert.equal(promotionBaselineIndex(h, 'pushup', MON), null);
  });

  it('EC-5 강등 이전의 승급은 기준점이 되지 않는다', () => {
    const h = [
      promoted('pushup', 3, MON),
      abandoned('pushup', 4, '2026-09-09'),
      promoted('pushup', 3, '2026-09-20'),
    ];
    assert.equal(promotionBaselineIndex(h, 'pushup', FLOOR), 2);
    assert.equal(h[2].date, '2026-09-20');
  });

  it('floorDate 당일의 승급은 포함된다', () => {
    const h = [promoted('pushup', 3, MON)];
    assert.equal(promotionBaselineIndex(h, 'pushup', MON), 0);
  });

  it('다른 종목의 승급은 무시된다', () => {
    const h = [promoted('pushup', 3, MON)];
    assert.equal(promotionBaselineIndex(h, 'squat', FLOOR), null);
  });

  it('EC-11 RPE 보류 세션은 기준점이 되지 않는다', () => {
    const h = [rpeBlocked('pushup', 3, MON), plainSession('pushup', 3, '2026-09-09')];
    assert.equal(promotionBaselineIndex(h, 'pushup', FLOOR), null);
  });

  it("blockedBy: 'master' 세션도 기준점이 되지 않는다", () => {
    const h = [masterBlocked('pushup', 10, MON)];
    assert.equal(promotionBaselineIndex(h, 'pushup', FLOOR), null);
  });

  it('W-1 강등 당일의 재승급도 기준점이 된다', () => {
    // 날짜 하한(강등일 + 1일)이었을 때는 같은 날 재승급이 통째로 밀려났다.
    const h = [
      promoted('pushup', 3, MON),
      abandoned('pushup', 4, MON),
      promoted('pushup', 3, MON),
    ];
    assert.equal(effectiveFloorIndex(h, 'pushup', FLOOR), 2);
    assert.equal(promotionBaselineIndex(h, 'pushup', FLOOR), 2);
  });
});

// ── maintenanceCount (FR-4.1, FR-4.2, EC-4, EC-5, EC-6, EC-7) ────────────────

describe('maintenanceCount', () => {
  it('승급이 없으면 0', () => {
    const h = [plainSession('pushup', 3, MON), plainSession('pushup', 3, '2026-09-09')];
    assert.equal(maintenanceCount(h, 'pushup', FLOOR), 0);
  });

  it('승급 후 세션 3회면 3', () => {
    const h = [
      promoted('pushup', 3, MON),
      plainSession('pushup', 4, '2026-09-09'),
      plainSession('pushup', 4, '2026-09-11'),
      plainSession('pushup', 4, NEXT_MON),
    ];
    assert.equal(maintenanceCount(h, 'pushup', FLOOR), 3);
  });

  it('승급 세션 자신은 카운트에 포함되지 않는다', () => {
    assert.equal(maintenanceCount([promoted('pushup', 3, MON)], 'pushup', FLOOR), 0);
  });

  it('FR-4.3 이 FR-4.2 보다 우선한다 — 대상 종목의 다지기는 하한을 올리므로 카운트되지 않는다', () => {
    // maintenanceCount 의 필터에 kind 조건은 없지만, 그 종목의 consolidation 은
    // FR-4.3 이 강등으로 보아 effectiveFloorIndex 를 그 뒤로 밀어 올린다 (ADR-7).
    // 결과적으로 기준점 자체가 사라져 카운트가 0 이 된다 — 절대 세어지지 않는다.
    const h = [
      promoted('pushup', 3, MON),
      plainSession('pushup', 4, '2026-09-09'),
      consolidation('pushup', 4, '2026-09-10'),
      plainSession('pushup', 3, '2026-09-11'),
      plainSession('pushup', 3, NEXT_MON),
    ];
    assert.equal(lastSetbackIndex(h, 'pushup', FLOOR), 2);
    assert.equal(effectiveFloorIndex(h, 'pushup', FLOOR), 3);
    assert.equal(promotionBaselineIndex(h, 'pushup', FLOOR), null);
    assert.equal(maintenanceCount(h, 'pushup', FLOOR), 0);
  });

  it('다른 종목의 다지기는 이 종목의 하한도 카운트도 건드리지 않는다', () => {
    const h = [
      promoted('pushup', 3, MON),
      plainSession('pushup', 4, '2026-09-09'),
      consolidation('squat', 4, '2026-09-10'),
      plainSession('pushup', 4, '2026-09-11'),
    ];
    assert.equal(effectiveFloorIndex(h, 'pushup', FLOOR), 0);
    assert.equal(maintenanceCount(h, 'pushup', FLOOR), 2);
    // squat 은 승급이 없으므로 0 이다 — pushup 의 세션이 섞이지 않는다.
    assert.equal(maintenanceCount(h, 'squat', FLOOR), 0);
  });

  it('EC-4 같은 날 2회 세션은 2로 센다', () => {
    const h = [
      promoted('pushup', 3, MON),
      plainSession('pushup', 4, '2026-09-09'),
      plainSession('pushup', 4, '2026-09-09'),
    ];
    assert.equal(maintenanceCount(h, 'pushup', FLOOR), 2);
  });

  it('EC-4/W-1 승급 당일의 두 번째 세션도 카운트된다', () => {
    // 날짜 비교(`date > baseline`)였을 때 통째로 누락되던 경계다.
    // FR-4.2 는 날짜 3일이 아니라 세션 3회를 요구한다.
    const h = [
      promoted('pushup', 3, MON),
      plainSession('pushup', 4, MON),
      plainSession('pushup', 4, '2026-09-09'),
      plainSession('pushup', 4, '2026-09-11'),
    ];
    assert.equal(promotionBaselineIndex(h, 'pushup', FLOOR), 0);
    assert.equal(maintenanceCount(h, 'pushup', FLOOR), 3);
  });

  it('EC-4/W-1 승급 당일에 같은 종목을 세 번 더 하면 3이다', () => {
    const h = [
      promoted('pushup', 3, MON),
      plainSession('pushup', 4, MON),
      plainSession('pushup', 4, MON),
      plainSession('pushup', 4, MON),
    ];
    assert.equal(maintenanceCount(h, 'pushup', FLOOR), 3);
  });

  it('W-1 승급 당일의 강등은 그 승급을 기준점에서 밀어낸다', () => {
    const h = [
      promoted('pushup', 3, MON),
      consolidation('pushup', 4, MON),
      plainSession('pushup', 3, '2026-09-09'),
      plainSession('pushup', 3, '2026-09-11'),
      plainSession('pushup', 3, NEXT_MON),
    ];
    assert.equal(effectiveFloorIndex(h, 'pushup', FLOOR), 2);
    assert.equal(promotionBaselineIndex(h, 'pushup', FLOOR), null);
    assert.equal(maintenanceCount(h, 'pushup', FLOOR), 0);
  });

  it('W-1 승급 → 당일 강등 → 당일 재승급이면 재승급이 기준점이다', () => {
    // 날짜 하한(강등일 + 1일)이었을 때는 같은 날 재승급까지 밀려나 0 이 되었다.
    const h = [
      promoted('pushup', 3, MON),
      abandoned('pushup', 4, MON),
      promoted('pushup', 3, MON),
      plainSession('pushup', 4, MON),
      plainSession('pushup', 4, '2026-09-09'),
      plainSession('pushup', 4, '2026-09-11'),
    ];
    assert.equal(promotionBaselineIndex(h, 'pushup', FLOOR), 2);
    assert.equal(maintenanceCount(h, 'pushup', FLOOR), 3);
  });

  it('EC-5 승급 직후 abandoned 가 있고 재승급이 없으면 0', () => {
    const h = [
      promoted('pushup', 3, MON),
      abandoned('pushup', 4, '2026-09-09'),
      plainSession('pushup', 3, '2026-09-11'),
      plainSession('pushup', 3, NEXT_MON),
      plainSession('pushup', 3, '2026-09-16'),
    ];
    assert.equal(maintenanceCount(h, 'pushup', FLOOR), 0);
  });

  it('EC-5 승급 직후 consolidation 이 있고 재승급이 없으면 0', () => {
    const h = [
      promoted('pushup', 3, MON),
      consolidation('pushup', 4, '2026-09-09'),
      plainSession('pushup', 3, '2026-09-11'),
      plainSession('pushup', 3, NEXT_MON),
      plainSession('pushup', 3, '2026-09-16'),
    ];
    assert.equal(maintenanceCount(h, 'pushup', FLOOR), 0);
  });

  it('EC-5 강등 후 재승급하면 카운트가 0 이 아니라 새로 시작된다', () => {
    const h = [
      promoted('pushup', 3, MON),
      abandoned('pushup', 4, '2026-09-09'),
      promoted('pushup', 3, '2026-09-20'),
      plainSession('pushup', 4, '2026-09-22'),
      plainSession('pushup', 4, '2026-09-24'),
      plainSession('pushup', 4, '2026-09-26'),
    ];
    assert.equal(effectiveFloorIndex(h, 'pushup', FLOOR), 2);
    assert.equal(promotionBaselineIndex(h, 'pushup', FLOOR), 2);
    assert.equal(h[2].date, '2026-09-20');
    assert.equal(maintenanceCount(h, 'pushup', FLOOR), 3);
  });

  it('EC-5 재승급 후 세션이 2회뿐이면 2', () => {
    const h = [
      promoted('pushup', 3, MON),
      abandoned('pushup', 4, '2026-09-09'),
      promoted('pushup', 3, '2026-09-20'),
      plainSession('pushup', 4, '2026-09-22'),
      plainSession('pushup', 4, '2026-09-24'),
    ];
    assert.equal(maintenanceCount(h, 'pushup', FLOOR), 2);
  });

  it('EC-5 강등 → 재승급 → 또 강등 → 또 재승급도 정상 재계수된다', () => {
    const h = [
      promoted('pushup', 3, MON),
      abandoned('pushup', 4, '2026-09-09'),
      promoted('pushup', 3, '2026-09-20'),
      plainSession('pushup', 4, '2026-09-22'),
      abandoned('pushup', 4, '2026-09-24'),
      promoted('pushup', 3, '2026-10-01'),
      plainSession('pushup', 4, '2026-10-03'),
      plainSession('pushup', 4, '2026-10-05'),
      plainSession('pushup', 4, '2026-10-07'),
    ];
    assert.equal(effectiveFloorIndex(h, 'pushup', FLOOR), 5);
    assert.equal(promotionBaselineIndex(h, 'pushup', FLOOR), 5);
    assert.equal(h[5].date, '2026-10-01');
    assert.equal(maintenanceCount(h, 'pushup', FLOOR), 3);
  });

  it('EC-6 카운트 도중 추가 승급이 있어도 유지된다', () => {
    const h = [
      promoted('pushup', 3, MON),
      plainSession('pushup', 4, '2026-09-09'),
      promoted('pushup', 4, '2026-09-11'),
      plainSession('pushup', 5, NEXT_MON),
    ];
    assert.equal(maintenanceCount(h, 'pushup', FLOOR), 3);
  });

  it('EC-7 전제 floorDate 를 뒤로 옮기면 카운트가 0 이 된다', () => {
    const h = [
      promoted('pushup', 3, MON),
      plainSession('pushup', 4, '2026-09-09'),
      promoted('pushup', 4, '2026-09-11'),
      plainSession('pushup', 5, NEXT_MON),
    ];
    assert.equal(maintenanceCount(h, 'pushup', '2026-09-20'), 0);
  });

  it('다른 종목의 세션은 세지 않는다', () => {
    const h = [
      promoted('pushup', 3, MON),
      plainSession('squat', 4, '2026-09-09'),
      plainSession('squat', 4, '2026-09-11'),
      plainSession('pushup', 4, NEXT_MON),
    ];
    assert.equal(maintenanceCount(h, 'pushup', FLOOR), 1);
  });

  it('빈 history 는 0', () => {
    assert.equal(maintenanceCount([], 'pushup', FLOOR), 0);
  });

  it('floorDate === baseline 인 경우에도 정상 동작한다', () => {
    const h = [
      promoted('pushup', 3, MON),
      plainSession('pushup', 4, '2026-09-09'),
      plainSession('pushup', 4, '2026-09-11'),
      plainSession('pushup', 4, NEXT_MON),
    ];
    assert.equal(maintenanceCount(h, 'pushup', MON), 3);
  });
});

// ── programProgressions ──────────────────────────────────────────────────────

describe('programProgressions', () => {
  it('new_blood 는 빅4만 다룬다', () => {
    assert.deepEqual(
      programProgressions(catalog, 'new_blood').sort(),
      [...BIG4].sort(),
    );
  });

  it('good_behavior 는 빅6 전부를 다룬다', () => {
    assert.equal(programProgressions(catalog, 'good_behavior').length, 6);
  });

  it('보조 운동 이름은 포함하지 않는다', () => {
    const ids = programProgressions(catalog, 'veterano');
    assert.ok(ids.every((id) => BIG4.includes(id) || id === 'bridge' || id === 'hspu'));
  });
});

// ── proposeSwitch — 조기 반환 경로 ───────────────────────────────────────────

describe('proposeSwitch — 요일 (FR-4.6)', () => {
  const ready = () => big4State(maintained(BIG4, MON, 3));

  it('화요일에는 null', () => {
    assert.equal(proposeSwitch(ready(), catalog, '2026-09-08', opts()), null);
  });

  it('수·목·금·토·일 5일도 전부 null', () => {
    for (const d of ['2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']) {
      assert.equal(proposeSwitch(ready(), catalog, d, opts()), null, `${d} 는 null 이어야 한다`);
    }
  });

  it('같은 조건에서 월요일에는 제안이 생긴다', () => {
    const p = proposeSwitch(ready(), catalog, NEXT_MON, opts());
    assert.notEqual(p, null);
    assert.equal(p!.status, 'pending');
  });
});

describe('proposeSwitch — 조건 판정', () => {
  it('FR-4.7 supermax 에서는 월요일이어도 null', () => {
    const state = allUnlockedState(maintained(
      ['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'], MON, 3,
    ));
    assert.equal(proposeSwitch(state, catalog, NEXT_MON, opts('supermax')), null);
  });

  it('알 수 없는 programId 면 null', () => {
    const state = big4State(maintained(BIG4, MON, 3));
    assert.equal(proposeSwitch(state, catalog, NEXT_MON, opts('unknown')), null);
  });

  it('FR-4.6b 이미 pending 이 있으면 null', () => {
    const pending: SwitchProposal = {
      proposedAt: MON,
      fromProgramId: 'good_behavior',
      toProgramId: 'veterano',
      status: 'pending',
      resolvedAt: null,
    };
    const state = big4State(maintained(BIG4, MON, 3), [pending]);
    assert.equal(proposeSwitch(state, catalog, NEXT_MON, opts()), null);
  });

  it('종목 하나라도 3회 미달이면 null', () => {
    const history = [
      ...maintained(['pushup', 'squat', 'pullup'], MON, 3),
      ...maintained(['legraise'], MON, 2),
    ];
    assert.equal(proposeSwitch(big4State(history), catalog, NEXT_MON, opts()), null);
  });

  it('카운트가 정확히 3이면 제안이 생성된다 (경계 포함)', () => {
    const p = proposeSwitch(big4State(maintained(BIG4, MON, 3)), catalog, NEXT_MON, opts());
    assert.notEqual(p, null);
  });

  it('카운트가 2면 null', () => {
    assert.equal(
      proposeSwitch(big4State(maintained(BIG4, MON, 2)), catalog, NEXT_MON, opts()),
      null,
    );
  });

  it('카운트가 10이어도 제안이 생성된다', () => {
    const p = proposeSwitch(big4State(maintained(BIG4, MON, 10)), catalog, NEXT_MON, opts());
    assert.notEqual(p, null);
  });

  it('생성된 제안의 필드가 정확하다', () => {
    const p = proposeSwitch(big4State(maintained(BIG4, MON, 3)), catalog, NEXT_MON, opts());
    assert.deepEqual(p, {
      proposedAt: NEXT_MON,
      fromProgramId: 'good_behavior',
      toProgramId: 'veterano',
      status: 'pending',
      resolvedAt: null,
    });
  });

  it('빈 history 면 null', () => {
    assert.equal(proposeSwitch(big4State([]), catalog, NEXT_MON, opts()), null);
  });
});

// ── proposeSwitch — 잠긴 종목 (FR-4.5) ───────────────────────────────────────

describe('proposeSwitch — 잠긴 종목 (FR-4.5)', () => {
  it('잠긴 bridge/hspu 는 판정 대상에서 제외된다', () => {
    // 빅4 가 4단계라 bridge/hspu 는 잠겨 있다. 해금된 빅4 만 3회씩 충족.
    const state = big4State(maintained(BIG4, MON, 3));
    const p = proposeSwitch(state, catalog, NEXT_MON, opts());
    assert.notEqual(p, null);
  });

  it('해금된 상태에서는 bridge/hspu 도 판정 대상이다', () => {
    // 빅4 는 7단계 → bridge/hspu 해금. 빅4만 3회 충족, bridge/hspu 는 0회.
    const state = allUnlockedState(maintained(BIG4, MON, 3));
    assert.equal(proposeSwitch(state, catalog, NEXT_MON, opts()), null);
  });

  it('new_blood 는 빅4만 다루므로 잠금과 무관하다', () => {
    const state = big4State(maintained(BIG4, MON, 3));
    const p = proposeSwitch(state, catalog, NEXT_MON, opts('new_blood'));
    assert.notEqual(p, null);
    assert.equal(p!.toProgramId, 'good_behavior');
  });
});

// ── proposeSwitch — 순수성 (FR-4.10, NFR-2) ──────────────────────────────────

describe('proposeSwitch — 순수성', () => {
  it('호출 후 state.proposals 가 변하지 않는다', () => {
    const state = big4State(maintained(BIG4, MON, 3));
    const before = JSON.stringify(state);
    proposeSwitch(state, catalog, NEXT_MON, opts());
    assert.equal(state.proposals.length, 0);
    assert.equal(JSON.stringify(state), before);
  });

  it('같은 인자로 두 번 호출하면 같은 결과', () => {
    const state = big4State(maintained(BIG4, MON, 3));
    assert.deepEqual(
      proposeSwitch(state, catalog, NEXT_MON, opts()),
      proposeSwitch(state, catalog, NEXT_MON, opts()),
    );
  });
});

// ── 상태 전이 (ADR-6) ────────────────────────────────────────────────────────

const sample: SwitchProposal = {
  proposedAt: MON,
  fromProgramId: 'good_behavior',
  toProgramId: 'veterano',
  status: 'pending',
  resolvedAt: null,
};

describe('commitProposal', () => {
  it('proposals 에 push 된다', () => {
    const next = commitProposal(big4State([]), sample);
    assert.equal(next.proposals.length, 1);
    assert.equal(next.proposals.at(-1)!.status, 'pending');
  });

  it('원본 state 가 변하지 않는다', () => {
    const state = big4State([]);
    commitProposal(state, sample);
    assert.equal(state.proposals.length, 0);
  });

  it('steps/history/stints 를 잃지 않는다', () => {
    const history = maintained(BIG4, MON, 3);
    const state = big4State(history);
    const next = commitProposal(state, sample);
    assert.deepEqual(next.steps, state.steps);
    assert.equal(next.history.length, history.length);
    assert.deepEqual(next.stints, state.stints);
  });

  it('FR-4.6b 이미 pending 이 있으면 예외', () => {
    const state = big4State([], [sample]);
    assert.throws(() => commitProposal(state, sample), /불변식 위반/);
  });
});

describe('activeProposal (FR-4.6a)', () => {
  it('pending 이 있으면 반환한다', () => {
    assert.deepEqual(activeProposal(big4State([], [sample])), sample);
  });

  it('pending 이 없으면 null', () => {
    assert.equal(activeProposal(big4State([])), null);
  });

  it('accepted/declined 만 있으면 null', () => {
    const state = big4State([], [
      { ...sample, status: 'accepted', resolvedAt: '2026-09-08' },
      { ...sample, status: 'declined', resolvedAt: '2026-09-15' },
    ]);
    assert.equal(activeProposal(state), null);
  });

  it('날짜에 의존하지 않는다 — 제안일 전후로 멀리 떨어진 상태에서도 같은 결과다', () => {
    // 함수 arity 는 동작이 아니다. 기본값 인자 하나로 깨지고, 날짜를 받아 쓰더라도
    // 인자 이름만 바꾸면 통과한다. 날짜 무관성 자체를 동작으로 단언한다 (FR-4.6a).
    const base = big4State([], [sample]);
    assert.equal(sample.proposedAt, MON);

    // 제안일 한참 이전의 세션만 있는 상태
    const before = big4State([plainSession('pushup', 4, '2026-06-01')], [sample]);
    // 제안일 한참 이후까지 세션이 쌓인 상태
    const after = big4State([
      plainSession('pushup', 4, '2026-06-01'),
      plainSession('pushup', 4, NEXT_MON),
      plainSession('pushup', 4, '2026-12-25'),
    ], [sample]);

    for (const state of [base, before, after]) {
      assert.deepEqual(activeProposal(state), sample);
    }

    // 결과를 바꾸는 것은 날짜가 아니라 승인·거절뿐이다.
    assert.equal(activeProposal(declineProposal(after, '2026-12-26')), null);
  });

  it('월요일에 생성된 제안이 화·수·목에도 그대로 반환된다', () => {
    const state = commitProposal(big4State([]), sample);
    // 함수가 날짜를 받지 않으므로 어느 날 호출해도 결과가 같다.
    const first = activeProposal(state);
    assert.deepEqual(activeProposal(state), first);
    assert.deepEqual(activeProposal(state), sample);
  });
});

describe('declineProposal (FR-4.9)', () => {
  it("status 가 'declined' 로, resolvedAt 이 onDate 로 갱신된다", () => {
    const next = declineProposal(big4State([], [sample]), '2026-09-09');
    assert.equal(next.proposals[0].status, 'declined');
    assert.equal(next.proposals[0].resolvedAt, '2026-09-09');
  });

  it('이후 activeProposal 이 null', () => {
    const next = declineProposal(big4State([], [sample]), '2026-09-09');
    assert.equal(activeProposal(next), null);
  });

  it('거절 레코드가 proposals 에 보존된다', () => {
    const next = declineProposal(big4State([], [sample]), '2026-09-09');
    assert.equal(next.proposals.length, 1);
  });

  it('pending 이 없으면 no-op (예외 없음)', () => {
    const state = big4State([]);
    assert.equal(declineProposal(state, '2026-09-09'), state);
    const twice = declineProposal(declineProposal(state, '2026-09-09'), '2026-09-10');
    assert.equal(twice.proposals.length, 0);
  });

  it('원본 불변', () => {
    const state = big4State([], [sample]);
    declineProposal(state, '2026-09-09');
    assert.equal(state.proposals[0].status, 'pending');
    assert.equal(state.proposals[0].resolvedAt, null);
  });
});

describe('markAccepted', () => {
  it("status 가 'accepted' 로, resolvedAt 이 onDate 로 갱신된다", () => {
    const next = markAccepted(big4State([], [sample]), '2026-09-17');
    assert.equal(next.proposals[0].status, 'accepted');
    assert.equal(next.proposals[0].resolvedAt, '2026-09-17');
  });

  it('stints 가 변경되지 않는다 (구간 전환은 Phase 3.5)', () => {
    const stint = {
      programId: 'good_behavior', selectedAt: FLOOR, startedAt: FLOOR, endedAt: null,
    };
    const state = stateAt({}, [], [stint], [sample]);
    const next = markAccepted(state, '2026-09-17');
    assert.deepEqual(next.stints, [stint]);
  });

  it('pending 이 없으면 no-op', () => {
    const state = big4State([]);
    assert.equal(markAccepted(state, '2026-09-17'), state);
    assert.equal(markAccepted(markAccepted(state, '2026-09-17'), '2026-09-18').proposals.length, 0);
  });
});

// ── 통합: 재제안 시나리오 (FR-4.9) ───────────────────────────────────────────

describe('재제안 시나리오 (FR-4.9)', () => {
  it('거절 후 다음 월요일에 같은 제안이 다시 생성된다', () => {
    let state = big4State(maintained(BIG4, '2026-09-01', 3));
    const first = proposeSwitch(state, catalog, MON, opts());
    assert.notEqual(first, null);
    state = commitProposal(state, first!);
    state = declineProposal(state, '2026-09-09');

    const again = proposeSwitch(state, catalog, NEXT_MON, opts());
    assert.notEqual(again, null);
    assert.equal(again!.toProgramId, first!.toProgramId);
  });

  it('거절을 3번 반복해도 4번째 월요일에 또 제안된다', () => {
    let state = big4State(maintained(BIG4, '2026-09-01', 3));
    for (const monday of [MON, NEXT_MON, '2026-09-21']) {
      const p = proposeSwitch(state, catalog, monday, opts());
      assert.notEqual(p, null, `${monday} 에 제안이 있어야 한다`);
      state = declineProposal(commitProposal(state, p!), addDays(monday, 1));
    }
    const fourth = proposeSwitch(state, catalog, '2026-09-28', opts());
    assert.notEqual(fourth, null);
    assert.equal(state.proposals.filter((p) => p.status === 'declined').length, 3);
  });

  it('거절 다음날(화요일)에는 재제안되지 않는다', () => {
    let state = big4State(maintained(BIG4, '2026-09-01', 3));
    state = commitProposal(state, proposeSwitch(state, catalog, MON, opts())!);
    state = declineProposal(state, '2026-09-08');
    assert.equal(proposeSwitch(state, catalog, '2026-09-08', opts()), null);
  });
});

// ── 통합: 강등이 제안을 영구 차단하지 않는다 (FR-4.9 + EC-5) ─────────────────

describe('강등 + 재제안 결합 (C-1 회귀 방지)', () => {
  it('강등으로 막혔다가 재승급 + 세션 3회 후 다시 제안된다', () => {
    const base = maintained(BIG4, '2026-09-01', 3);
    // pushup 만 09-09 에 강등
    const setback = [...base, abandoned('pushup', 4, '2026-09-09')];
    const blocked = big4State(setback);
    assert.equal(proposeSwitch(blocked, catalog, NEXT_MON, opts()), null);

    const recovered = big4State([
      ...setback,
      promoted('pushup', 3, '2026-09-16'),
      plainSession('pushup', 4, '2026-09-18'),
      plainSession('pushup', 4, '2026-09-19'),
      plainSession('pushup', 4, '2026-09-20'),
    ]);
    const p = proposeSwitch(recovered, catalog, '2026-09-21', opts());
    assert.notEqual(p, null);
    assert.equal(p!.toProgramId, 'veterano');
  });
});

// ── 통합: 주간 흐름 ──────────────────────────────────────────────────────────

describe('주간 흐름', () => {
  it('주중에 조건을 채워도 그 주에는 제안이 안 생긴다', () => {
    // 09-07(월) 시점에는 legraise 가 2회, 09-09(수) 에 3회째를 채운다.
    const before = [
      ...maintained(['pushup', 'squat', 'pullup'], '2026-09-01', 3),
      promoted('legraise', 3, '2026-09-01'),
      plainSession('legraise', 4, '2026-09-03'),
      plainSession('legraise', 4, '2026-09-05'),
    ];
    assert.equal(proposeSwitch(big4State(before), catalog, MON, opts()), null);

    const after = big4State([...before, plainSession('legraise', 4, '2026-09-09')]);
    for (const d of ['2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']) {
      assert.equal(proposeSwitch(after, catalog, d, opts()), null, `${d} 는 null 이어야 한다`);
    }
    assert.notEqual(proposeSwitch(after, catalog, NEXT_MON, opts()), null);
  });

  it('생성 → 커밋 → 매일 노출 → 승인 전체 흐름', () => {
    let state = big4State(maintained(BIG4, '2026-09-01', 3));
    const p = proposeSwitch(state, catalog, NEXT_MON, opts());
    assert.notEqual(p, null);
    state = commitProposal(state, p!);

    // 09-15 ~ 09-17 노출 — 함수가 날짜를 받지 않으므로 매일 동일하다
    for (let i = 0; i < 3; i += 1) assert.deepEqual(activeProposal(state), p);

    state = markAccepted(state, '2026-09-17');
    assert.equal(activeProposal(state), null);
    assert.equal(state.proposals.at(-1)!.status, 'accepted');
    assert.equal(state.proposals.at(-1)!.resolvedAt, '2026-09-17');
  });
});
