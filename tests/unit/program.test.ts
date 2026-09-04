import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import { addDays, weekdayOf } from '../../src/lib/domain/date.ts';
import {
  currentStint, dayNumber, dayNumberOn, describeProgram, describePrograms,
  firstTrainingDay, selectProgram, stintAt, switchProgram,
} from '../../src/lib/domain/program.ts';
import { getProgram } from '../../src/lib/domain/schedule.ts';
import { WEEKDAYS } from '../../src/lib/domain/types.ts';
import type { AppState, ProgramStint, ProgressionId, SessionRecord } from '../../src/lib/domain/types.ts';
import { catalog, rec, stateAt } from './helpers.ts';

// 날짜 기준점: 2026-09-07(월) ~ 2026-09-13(일)
const MON = '2026-09-07';
const TUE = '2026-09-08';
const WED = '2026-09-09';
const THU = '2026-09-10';
const FRI = '2026-09-11';
const SUN = '2026-09-13';
const NEXT_MON = '2026-09-14';

const BIG_SIX: ProgressionId[] = ['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'];
const PROGRAM_IDS = [
  'new_blood', 'good_behavior', 'veterano', 'solitary_confinement', 'supermax',
];

/** 로컬 픽스처 — test/helpers.ts 는 수정하지 않는다. */
function stintFixture(
  programId: string, selectedAt: string, startedAt: string, endedAt: string | null = null,
): ProgramStint {
  return { programId, selectedAt, startedAt, endedAt };
}

/** 구간 목록을 갈아 끼운 새 상태. */
function withStints(state: AppState, ...stints: ProgramStint[]): AppState {
  return { ...state, stints };
}

/** 아무 것도 선택하지 않은 기본 상태. */
const empty = (): AppState => stateAt({});

const sorted = (xs: readonly string[]) => [...xs].sort();

describe('describeProgram / describePrograms', () => {
  it('5종 전부를 카탈로그 순서대로 반환한다 (FR-2.2)', () => {
    assert.deepEqual(describePrograms(catalog).map((d) => d.id), PROGRAM_IDS);
  });

  const days: [string, number, number][] = [
    ['new_blood', 2, 5],
    ['good_behavior', 3, 4],
    ['veterano', 6, 1],
    ['solitary_confinement', 6, 1],
    ['supermax', 6, 1],
  ];
  for (const [id, training, rest] of days) {
    it(`${id} 의 운동일 ${training}일 / 휴식일 ${rest}일`, () => {
      const d = describeProgram(catalog, id);
      assert.equal(d.trainingDays, training);
      assert.equal(d.restDays, rest);
    });
  }

  it('모든 프로그램에서 운동일 + 휴식일 = 7', () => {
    for (const d of describePrograms(catalog)) {
      assert.equal(d.trainingDays + d.restDays, 7, d.id);
    }
  });

  it('new_blood 의 종목은 푸시업·스쿼트·풀업·레그 레이즈 4종이다', () => {
    assert.deepEqual(
      sorted(describeProgram(catalog, 'new_blood').progressionIds),
      sorted(['pushup', 'squat', 'pullup', 'legraise']),
    );
  });

  for (const id of ['good_behavior', 'veterano', 'solitary_confinement', 'supermax']) {
    it(`${id} 의 종목은 빅6 전체이고 중복이 없다`, () => {
      const ids = describeProgram(catalog, id).progressionIds;
      assert.deepEqual(sorted(ids), sorted(BIG_SIX));
      assert.equal(new Set(ids).size, ids.length);
    });
  }

  it('solitary_confinement 의 풀업은 월·목 두 번 나오지만 목록에는 1개다', () => {
    const schedule = getProgram(catalog, 'solitary_confinement').schedule;
    const 등장 = WEEKDAYS
      .filter((w) => (schedule[w] ?? []).some(([label]) => label === '풀업')).length;
    assert.equal(등장, 2);
    const ids = describeProgram(catalog, 'solitary_confinement').progressionIds;
    assert.equal(ids.filter((x) => x === 'pullup').length, 1);
  });

  it('FR-12 — ProgramDescription 에 accessories 키가 없다', () => {
    // solitary_confinement 는 악력·종아리·목이 요일표에 있는 유일한 프로그램이다.
    // 그 라벨들이 어디에도 남지 않아야 한다.
    for (const d of describePrograms(catalog)) {
      assert.equal('accessories' in (d as unknown as Record<string, unknown>), false, d.id);
    }
  });

  it('보조 운동이 progressionIds 에 섞이지 않는다', () => {
    for (const d of describePrograms(catalog)) {
      for (const id of d.progressionIds) {
        assert.ok(BIG_SIX.includes(id), `${d.id}: ${id}`);
      }
    }
  });

  it('supermax 만 note 를 가진다', () => {
    for (const d of describePrograms(catalog)) {
      if (d.id === 'supermax') assert.equal(typeof d.note, 'string');
      else assert.equal(d.note, undefined, d.id);
    }
  });

  it('frequency 가 카탈로그 값 그대로다', () => {
    assert.equal(describeProgram(catalog, 'good_behavior').frequency, '주 3회 (격일)');
  });

  it('name.en / name.ko 가 카탈로그 값 그대로다', () => {
    const d = describeProgram(catalog, 'veterano');
    assert.deepEqual(d.name, { en: 'Veterano', ko: '베테랑' });
  });

  it('src/lib/data/progressions.json 에 파생 필드가 저장되어 있지 않다 (제약 c)', () => {
    const raw = JSON.parse(
      readFileSync(new URL('../../src/lib/data/progressions.json', import.meta.url).pathname, 'utf-8'),
    );
    for (const p of raw.programs) {
      for (const key of ['trainingDays', 'restDays', 'progressionIds', 'accessories']) {
        assert.ok(!(key in p), `${p.id} 에 ${key} 가 저장되어 있다`);
      }
    }
  });

  it('카탈로그 객체를 변형하지 않는다 (NFR-2)', () => {
    const before = JSON.stringify(catalog.programs);
    describePrograms(catalog);
    assert.equal(JSON.stringify(catalog.programs), before);
  });

  it('알 수 없는 프로그램이면 예외를 던진다', () => {
    assert.throws(() => describeProgram(catalog, 'nope'), /알 수 없는 프로그램/);
  });
});

describe('firstTrainingDay (FR-2.6)', () => {
  it('from 자신이 운동일이면 from 을 그대로 반환한다', () => {
    assert.equal(firstTrainingDay(catalog, 'new_blood', MON), MON);
  });

  it('EC-2 선택일이 휴식일이면 다음 운동일을 반환한다', () => {
    assert.equal(firstTrainingDay(catalog, 'new_blood', TUE), THU);
  });

  it('주 경계를 넘어 탐색한다', () => {
    assert.equal(firstTrainingDay(catalog, 'new_blood', FRI), NEXT_MON);
  });

  it('일요일만 쉬는 프로그램에서 일요일에 선택하면 월요일이다', () => {
    assert.equal(firstTrainingDay(catalog, 'veterano', SUN), NEXT_MON);
  });

  it('good_behavior 화요일 선택은 수요일이다', () => {
    assert.equal(firstTrainingDay(catalog, 'good_behavior', TUE), WED);
  });

  it('5종 × 7요일 = 35 조합 전부 0~6일 이내의 운동일을 반환한다', () => {
    let 조합 = 0;
    for (const id of PROGRAM_IDS) {
      const schedule = getProgram(catalog, id).schedule;
      for (let i = 0; i < 7; i += 1) {
        const from = addDays(MON, i);
        const got = firstTrainingDay(catalog, id, from);
        const 간격 = WEEKDAYS.length; // 탐색 상한 확인용
        assert.ok((schedule[weekdayOf(got)] ?? []).length > 0, `${id} ${from} → ${got}`);
        const offset = [...Array(간격).keys()].find((n) => addDays(from, n) === got);
        assert.ok(offset !== undefined, `${id} ${from} → ${got} 가 7일 밖이다`);
        조합 += 1;
      }
    }
    assert.equal(조합, 35);
  });

  it('알 수 없는 programId 면 예외를 던진다 — 조용히 from 을 반환하지 않는다', () => {
    assert.throws(() => firstTrainingDay(catalog, 'nope', MON), /알 수 없는 프로그램/);
  });
});

describe('selectProgram (FR-2.1 / FR-2.4)', () => {
  it('미선택 상태에서 선택하면 구간이 1개 생긴다', () => {
    const s = selectProgram(empty(), catalog, 'good_behavior', MON);
    assert.equal(s.stints.length, 1);
    assert.equal(s.stints[0].programId, 'good_behavior');
    assert.equal(s.stints[0].endedAt, null);
  });

  it('selectedAt 은 인자로 준 날짜다', () => {
    const s = selectProgram(empty(), catalog, 'good_behavior', MON);
    assert.equal(s.stints[0].selectedAt, MON);
  });

  it('EC-2 휴식일에 선택하면 startedAt 이 첫 운동일이다', () => {
    const s = selectProgram(empty(), catalog, 'new_blood', TUE);
    assert.equal(s.stints[0].selectedAt, TUE);
    assert.equal(s.stints[0].startedAt, THU);
  });

  it('운동일에 선택하면 selectedAt 과 startedAt 이 같다', () => {
    const s = selectProgram(empty(), catalog, 'new_blood', MON);
    assert.equal(s.stints[0].selectedAt, MON);
    assert.equal(s.stints[0].startedAt, MON);
  });

  it('FR-3.5 steps 가 변경되지 않는다', () => {
    const base = stateAt({ pushup: 5, bridge: 3 });
    const s = selectProgram(base, catalog, 'veterano', MON);
    assert.deepEqual(s.steps, base.steps);
  });

  it('FR-3.5 history 가 변경되지 않는다', () => {
    const history: SessionRecord[] = [
      rec('pushup', 3, [10, 10]), rec('squat', 2, [15]), rec('pullup', 1, [8, 8]),
    ];
    const base = stateAt({}, history);
    const s = selectProgram(base, catalog, 'veterano', MON);
    assert.equal(s.history.length, 3);
    assert.deepEqual(s.history, history);
  });

  it('NFR-2 원본 state 를 변형하지 않는다', () => {
    const base = empty();
    selectProgram(base, catalog, 'veterano', MON);
    assert.equal(base.stints.length, 0);
  });

  it('proposals 가 보존된다', () => {
    const base = stateAt({}, [], [], [{
      proposedAt: MON, fromProgramId: 'new_blood', toProgramId: 'good_behavior',
      status: 'pending', resolvedAt: null,
    }]);
    const s = selectProgram(base, catalog, 'veterano', NEXT_MON);
    assert.deepEqual(s.proposals, base.proposals);
  });

  it('알 수 없는 programId 면 예외가 전파된다', () => {
    assert.throws(() => selectProgram(empty(), catalog, 'nope', MON), /알 수 없는 프로그램/);
  });
});

describe('switchProgram (FR-3.1 ~ FR-3.3)', () => {
  it('이전 구간이 전환일로 마감된다', () => {
    const a = selectProgram(empty(), catalog, 'new_blood', MON);
    const b = switchProgram(a, catalog, 'good_behavior', NEXT_MON);
    assert.equal(b.stints[0].endedAt, NEXT_MON);
    assert.equal(b.stints[1].endedAt, null);
  });

  it('FR-3.2 새 구간의 startedAt 이 FR-2.6 규칙을 따른다', () => {
    const a = selectProgram(empty(), catalog, 'good_behavior', MON);
    const b = switchProgram(a, catalog, 'new_blood', TUE);
    assert.equal(b.stints[1].selectedAt, TUE);
    assert.equal(b.stints[1].startedAt, THU);
  });

  it('EC-3 A → B → A 가 새 구간이 된다', () => {
    let s = selectProgram(empty(), catalog, 'new_blood', MON);
    s = switchProgram(s, catalog, 'good_behavior', NEXT_MON);
    s = switchProgram(s, catalog, 'new_blood', '2026-09-21');
    assert.equal(s.stints.length, 3);
    assert.equal(s.stints[2].programId, 'new_blood');
    assert.notEqual(s.stints[2].startedAt, s.stints[0].startedAt);
  });

  it('EC-3 / FR-3.3 되돌아온 구간의 며칠차가 1부터 시작한다', () => {
    let s = selectProgram(empty(), catalog, 'new_blood', MON);
    s = switchProgram(s, catalog, 'good_behavior', NEXT_MON);
    s = switchProgram(s, catalog, 'new_blood', '2026-09-21');
    const 세번째 = s.stints[2];
    assert.equal(dayNumber(세번째, 세번째.startedAt), 1);
  });

  it('같은 프로그램으로 전환해도 새 구간이 생긴다', () => {
    const a = selectProgram(empty(), catalog, 'new_blood', MON);
    const b = switchProgram(a, catalog, 'new_blood', NEXT_MON);
    assert.equal(b.stints.length, 2);
  });

  it('FR-3.5 전환이 steps / history 를 변경하지 않는다', () => {
    const history = [rec('pushup', 3, [10, 10])];
    const base = stateAt({ pushup: 3 }, history);
    let s = selectProgram(base, catalog, 'new_blood', MON);
    s = switchProgram(s, catalog, 'veterano', NEXT_MON);
    assert.deepEqual(s.steps, base.steps);
    assert.deepEqual(s.history, history);
  });

  it('FR-3.6 전환 10회 후에도 구간이 잘리지 않는다', () => {
    let s = selectProgram(empty(), catalog, 'new_blood', MON);
    for (let i = 1; i < 10; i += 1) {
      s = switchProgram(s, catalog, PROGRAM_IDS[i % 5], addDays(MON, i * 7));
    }
    assert.equal(s.stints.length, 10);
    assert.equal(s.stints[0].programId, 'new_blood');
    assert.equal(s.stints[0].selectedAt, MON);
  });

  it('FR-3.6 전환 100회 후에도 첫 구간이 보존된다 — 개수 상한이 없다', () => {
    let s = selectProgram(empty(), catalog, 'new_blood', MON);
    for (let i = 1; i < 100; i += 1) {
      s = switchProgram(s, catalog, PROGRAM_IDS[i % 5], addDays(MON, i * 7));
    }
    assert.equal(s.stints.length, 100);
    assert.equal(s.stints[0].selectedAt, MON);
    assert.equal(s.stints[0].endedAt, addDays(MON, 7));
  });
});

describe('currentStint / stintAt', () => {
  it('빈 stints 에서 currentStint 가 null 이다', () => {
    assert.equal(currentStint(empty()), null);
  });

  it('활성 구간이 있으면 그것을 반환한다', () => {
    const s = selectProgram(empty(), catalog, 'veterano', MON);
    assert.equal(currentStint(s), s.stints[0]);
  });

  it('모든 구간이 마감되었으면 null 이다', () => {
    const s = withStints(empty(), stintFixture('new_blood', MON, MON, NEXT_MON));
    assert.equal(currentStint(s), null);
  });

  const 두구간 = () => {
    const a = selectProgram(empty(), catalog, 'new_blood', MON);
    return switchProgram(a, catalog, 'good_behavior', NEXT_MON);
  };

  it('stintAt 이 과거 구간을 정확히 찾는다', () => {
    const s = 두구간();
    assert.equal(stintAt(s, THU), s.stints[0]);
  });

  it('전환 경계일에는 새 구간이 우선한다 (FR-3.2)', () => {
    const s = 두구간();
    assert.equal(stintAt(s, NEXT_MON), s.stints[1]);
  });

  it('첫 구간 selectedAt 이전 날짜는 null 이다', () => {
    const s = 두구간();
    assert.equal(stintAt(s, '2026-09-01'), null);
  });

  it('EC-10 selectedAt 과 startedAt 사이의 휴식일도 그 구간에 속한다', () => {
    const s = selectProgram(empty(), catalog, 'new_blood', TUE);
    assert.equal(s.stints[0].startedAt, THU);
    assert.equal(stintAt(s, WED), s.stints[0]);
  });

  it('구간 시작 당일이 그 구간이다', () => {
    const s = selectProgram(empty(), catalog, 'new_blood', MON);
    assert.equal(stintAt(s, MON), s.stints[0]);
  });

  it('하루짜리 구간 — 선택 당일 전환하면 endedAt === selectedAt 이고 그날은 새 구간이다', () => {
    const a = selectProgram(empty(), catalog, 'new_blood', MON);
    const b = switchProgram(a, catalog, 'veterano', MON);
    assert.equal(b.stints[0].selectedAt, MON);
    assert.equal(b.stints[0].endedAt, MON);
    assert.equal(stintAt(b, MON), b.stints[1]);
  });
});

describe('dayNumber (FR-2.7 / FR-5.4 / EC-10)', () => {
  const stint = stintFixture('new_blood', MON, MON);

  it('startedAt 당일이 1일차다', () => {
    assert.equal(dayNumber(stint, MON), 1);
  });

  it('startedAt 다음날이 2일차다', () => {
    assert.equal(dayNumber(stint, TUE), 2);
  });

  it('EC-8 7일 뒤가 8일차다 — 기록이 없어도 증가한다', () => {
    assert.equal(dayNumber(stint, NEXT_MON), 8);
  });

  it('EC-8 기록이 있어도 결과가 같다 — 수행 기록을 보지 않는다', () => {
    const s = stateAt({}, [
      rec('pushup', 3, [10]), rec('squat', 2, [15]), rec('pullup', 1, [8]),
    ], [stint]);
    assert.equal(dayNumberOn(s, NEXT_MON), 8);
  });

  it('EC-10 startedAt 하루 전은 0 이다 (−1 이 아니다)', () => {
    assert.equal(dayNumber(stint, '2026-09-06'), 0);
  });

  it('EC-10 startedAt 한 달 전도 0 이다', () => {
    assert.equal(dayNumber(stint, '2026-08-07'), 0);
  });

  it('EC-10 / FR-5.4 선택일 ~ 첫 운동일 사이의 휴식일이 0 이다', () => {
    const s = selectProgram(empty(), catalog, 'new_blood', TUE);
    assert.equal(dayNumberOn(s, TUE), 0);
    assert.equal(dayNumberOn(s, WED), 0);
    assert.equal(dayNumberOn(s, THU), 1);
  });

  it('dayNumberOn 은 구간이 없으면 0 이다', () => {
    assert.equal(dayNumberOn(empty(), MON), 0);
  });

  it('월·연 경계를 넘는 며칠차', () => {
    const s = stintFixture('veterano', '2026-12-28', '2026-12-28');
    assert.equal(dayNumber(s, '2027-01-04'), 8);
  });
});

describe('통합 — 구간 이력 시나리오', () => {
  const 세구간 = () => {
    let s = selectProgram(empty(), catalog, 'new_blood', MON);
    s = switchProgram(s, catalog, 'good_behavior', '2026-09-21');
    return switchProgram(s, catalog, 'veterano', '2026-10-05');
  };

  it('각 구간 내부 날짜의 programId 와 며칠차가 정확하다', () => {
    const s = 세구간();
    const cases: [string, string, number][] = [
      ['2026-09-10', 'new_blood', 4],   // 09-07 시작
      ['2026-09-25', 'good_behavior', 5], // 09-21 시작
      ['2026-10-09', 'veterano', 5],    // 10-05 시작
    ];
    for (const [date, programId, day] of cases) {
      const stint = stintAt(s, date);
      assert.ok(stint !== null, date);
      assert.equal(stint.programId, programId, date);
      assert.equal(dayNumberOn(s, date), day, date);
    }
  });

  it('A-4 임의 날짜에 겹치는 구간이 없다 — 후보가 항상 0개 또는 1개', () => {
    const s = 세구간();
    for (let i = -5; i < 60; i += 1) {
      const date = addDays(MON, i);
      const 후보 = s.stints.filter((st) =>
        st.selectedAt <= date && (st.endedAt === null || date < st.endedAt));
      assert.ok(후보.length <= 1, `${date} 에 구간이 ${후보.length}개`);
      assert.equal(stintAt(s, date), 후보[0] ?? null, date);
    }
  });
});

describe('통합 — 설명 조회 → 선택 흐름 (FR-2.3 → FR-2.4)', () => {
  it('describePrograms 의 모든 id 로 selectProgram 이 성공한다', () => {
    for (const d of describePrograms(catalog)) {
      const s = selectProgram(empty(), catalog, d.id, MON);
      assert.equal(s.stints[0].programId, d.id);
      assert.equal(currentStint(s)?.programId, d.id);
    }
  });
});

describe('FR-3.6 — 정리 로직 부재 (코드 감사)', () => {
  it('src/lib/domain/program.ts 에 slice / splice / shift / 상한 상수가 없다', () => {
    const src = readFileSync(
      new URL('../../src/lib/domain/program.ts', import.meta.url).pathname, 'utf-8',
    );
    for (const 패턴 of [/\.slice\(/, /\.splice\(/, /\.shift\(/, /\bMAX_/]) {
      assert.equal(패턴.test(src), false, `금지 패턴 발견: ${패턴}`);
    }
  });
});
