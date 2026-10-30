import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  addCustomProgram, advanceProposals, describeProgram, firstTrainingDay, initialState,
  isCustomProgramId, isProgramUsed, planDay, planOn, programToInput, proposeSwitchForCurrent,
  removeCustomProgram, reviewDay, selectProgram, setStep, switchProgram, updateCustomProgram,
  validateCustomProgram, withCustomPrograms, getProgram,
} from '../../src/lib/domain/index.ts';
import type { AppState, CustomProgramInput } from '../../src/lib/domain/types.ts';
import { ALL_UNLOCKED_STEPS, catalog, stateAt } from './helpers.ts';

// 이슈 #13 의 예: 월 푸시업 / 화 레그 레이즈 / 목 풀업 / 금 스쿼트.
const FOUR_DAY: CustomProgramInput = {
  name: '주 4일 빅4',
  days: { 월: ['pushup'], 화: ['legraise'], 목: ['pullup'], 금: ['squat'] },
};

function withFourDay(state: AppState = initialState()): { state: AppState; id: string } {
  const r = addCustomProgram(state, catalog, FOUR_DAY);
  return { state: r.state, id: r.programId };
}

describe('addCustomProgram — 만들기 (#13)', () => {
  it('custom-1 id 로 Program 모양을 저장한다', () => {
    const { state, id } = withFourDay();
    assert.equal(id, 'custom-1');
    assert.ok(isCustomProgramId(id));
    const p = state.customPrograms![0];
    assert.deepEqual(p.name, { en: '주 4일 빅4', ko: '주 4일 빅4' });
    assert.equal(p.frequency, '주 4일');
    assert.deepEqual(p.schedule.월, [['푸시업', '']]);
    assert.deepEqual(p.schedule.수, []);
    assert.deepEqual(p.schedule.일, []);
  });

  it('인자 상태를 바꾸지 않는다', () => {
    const before = initialState();
    addCustomProgram(before, catalog, FOUR_DAY);
    assert.equal(before.customPrograms, undefined);
  });

  it('이름 앞뒤 공백을 지운다', () => {
    const r = addCustomProgram(initialState(), catalog, { ...FOUR_DAY, name: '  내 루틴  ' });
    assert.equal(r.state.customPrograms![0].name.ko, '내 루틴');
  });

  it('하루 여러 종목은 정해진 순서로 정렬한다', () => {
    const r = addCustomProgram(initialState(), catalog, {
      name: 'x', days: { 월: ['hspu', 'pushup', 'squat'] },
    });
    assert.deepEqual(
      r.state.customPrograms![0].schedule.월.map(([l]) => l),
      ['푸시업', '스쿼트', '핸드스탠드 푸시업'],
    );
  });

  it('같은 종목을 여러 요일에 넣을 수 있다', () => {
    const r = addCustomProgram(initialState(), catalog, {
      name: 'x', days: { 월: ['pushup'], 수: ['pushup'], 금: ['pushup'] },
    });
    assert.equal(r.state.customPrograms![0].frequency, '주 3일');
  });

  it('id 번호는 남은 커스텀 · 구간이 가리키는 id 의 최대값 다음', () => {
    let s = withFourDay().state;
    s = addCustomProgram(s, catalog, { ...FOUR_DAY, name: '둘째' }).state;
    s = removeCustomProgram(s, 'custom-2');
    const r = addCustomProgram(s, catalog, { ...FOUR_DAY, name: '셋째' });
    // custom-2 는 지워졌고 남은 최대는 1 — 쓰인 적 없으므로 2 를 다시 받는다.
    assert.equal(r.programId, 'custom-2');
    // 구간에 쓰인 id 는 커스텀 목록에서 빠져 있어도 피한다.
    const used = { ...r.state, customPrograms: [], stints: [
      { programId: 'custom-7', selectedAt: '2026-10-01', startedAt: '2026-10-01', endedAt: '2026-10-02' },
    ] };
    assert.equal(addCustomProgram(used, catalog, { ...FOUR_DAY, name: '넷째' }).programId, 'custom-8');
  });
});

describe('validateCustomProgram — 검사 문구 (#13)', () => {
  const s = initialState();
  const v = (input: CustomProgramInput) => validateCustomProgram(s, catalog, input);

  it('정상 입력은 null', () => {
    assert.equal(v(FOUR_DAY), null);
  });

  it('빈 이름', () => {
    assert.match(v({ ...FOUR_DAY, name: '   ' })!, /이름이 비어/);
  });

  it('21자 이름', () => {
    assert.match(v({ ...FOUR_DAY, name: 'ㄱ'.repeat(21) })!, /20자 이하/);
    assert.equal(v({ ...FOUR_DAY, name: 'ㄱ'.repeat(20) }), null);
  });

  it('카탈로그 5종과 같은 이름', () => {
    assert.match(v({ ...FOUR_DAY, name: '신참' })!, /같은 이름/);
    assert.match(v({ ...FOUR_DAY, name: 'New Blood' })!, /같은 이름/);
  });

  it('다른 커스텀과 같은 이름 — 수정할 때 자기 자신은 허용', () => {
    const { state, id } = withFourDay();
    assert.match(validateCustomProgram(state, catalog, FOUR_DAY)!, /같은 이름/);
    assert.equal(validateCustomProgram(state, catalog, FOUR_DAY, id), null);
  });

  it('운동일이 없다', () => {
    assert.match(v({ name: 'x', days: {} })!, /운동일이 하루도/);
    assert.match(v({ name: 'x', days: { 월: [] } })!, /운동일이 하루도/);
  });

  it('하루에 같은 종목 두 번', () => {
    assert.match(v({ name: 'x', days: { 화: ['pushup', 'pushup'] } })!, /화요일에 같은 종목/);
  });

  it('모르는 종목', () => {
    assert.match(v({ name: 'x', days: { 화: ['plank' as never] } })!, /알 수 없는 종목: plank/);
  });

  it('addCustomProgram 은 같은 문구로 예외를 던진다', () => {
    assert.throws(() => addCustomProgram(s, catalog, { name: '', days: {} }), /이름이 비어/);
  });
});

describe('withCustomPrograms — 합친 카탈로그 (#13)', () => {
  it('커스텀이 없으면 같은 카탈로그 객체', () => {
    assert.equal(withCustomPrograms(catalog, initialState()), catalog);
  });

  it('5종 뒤에 커스텀이 붙는다', () => {
    const { state, id } = withFourDay();
    const merged = withCustomPrograms(catalog, state);
    assert.equal(merged.programs.length, catalog.programs.length + 1);
    assert.equal(merged.programs.at(-1)!.id, id);
    assert.equal(merged.progressions, catalog.progressions);
  });

  it('이미 합친 카탈로그를 다시 넣어도 커스텀이 두 번 들어가지 않는다', () => {
    const { state } = withFourDay();
    const twice = withCustomPrograms(withCustomPrograms(catalog, state), state);
    assert.equal(twice.programs.length, catalog.programs.length + 1);
  });
});

describe('커스텀 프로그램으로 운동하기 — 기존 함수 그대로 (#13)', () => {
  const { state: base, id } = withFourDay(stateAt(ALL_UNLOCKED_STEPS));
  const merged = withCustomPrograms(catalog, base);

  it('describeProgram 이 운동일 · 종목을 계산한다', () => {
    const d = describeProgram(merged, id);
    assert.equal(d.trainingDays, 4);
    assert.equal(d.restDays, 3);
    assert.deepEqual(d.progressionIds, ['legraise', 'pullup', 'pushup', 'squat']);
  });

  it('요일 계획이 그 종목을 낸다', () => {
    assert.deepEqual(planDay(base, merged, id, '목').exercises.map((e) => e.progressionId), ['pullup']);
    assert.equal(planDay(base, merged, id, '수').rest, true);
  });

  it('수요일에 고르면 목요일이 1일차', () => {
    // 2026-10-28 은 수요일.
    assert.equal(firstTrainingDay(merged, id, '2026-10-28'), '2026-10-29');
    const s = selectProgram(base, merged, id, '2026-10-28');
    const agenda = planOn(s, merged, '2026-10-29');
    assert.equal(agenda.kind, 'plan');
    if (agenda.kind === 'plan') {
      assert.equal(agenda.dayNumber, 1);
      assert.deepEqual(agenda.exercises.map((e) => e.progressionId), ['pullup']);
    }
  });

  it('지난 날의 수행 판정도 커스텀 요일표로 한다', () => {
    const s = selectProgram(base, merged, id, '2026-10-26'); // 월
    assert.equal(reviewDay(s, merged, '2026-10-26').status, 'missed');
    assert.equal(reviewDay(s, merged, '2026-10-28').status, 'rest');
  });

  it('잠긴 종목을 넣으면 그날 잠김으로 선다', () => {
    const r = addCustomProgram(initialState(), catalog, { name: '브리지 날', days: { 토: ['bridge', 'pushup'] } });
    const m = withCustomPrograms(catalog, r.state);
    const plan = planDay(r.state, m, r.programId, '토');
    assert.deepEqual(plan.exercises.map((e) => e.progressionId), ['pushup']);
    assert.deepEqual(plan.locked.map((l) => l.progressionId), ['bridge']);
  });

  it('자동 전환 제안을 내지 않는다', () => {
    const s = selectProgram(base, merged, id, '2026-10-26');
    assert.equal(proposeSwitchForCurrent(s, merged, '2026-11-02'), null);
    assert.equal(advanceProposals(s, merged, '2026-11-02'), s);
  });

  it('카탈로그 5종에서 커스텀으로 전환할 수 있다', () => {
    let s = selectProgram(base, merged, 'new_blood', '2026-10-19');
    s = switchProgram(s, merged, id, '2026-10-26');
    assert.equal(s.stints.at(-1)!.programId, id);
    assert.equal(s.stints[0].endedAt, '2026-10-26');
  });
});

describe('고치기 · 지우기 — 쓴 프로그램은 잠근다 (#13)', () => {
  it('쓰지 않은 프로그램은 고칠 수 있다', () => {
    const { state, id } = withFourDay();
    const next = updateCustomProgram(state, catalog, id, { name: '바꾼 이름', days: { 토: ['squat'] } });
    const p = getProgram(withCustomPrograms(catalog, next), id);
    assert.equal(p.name.ko, '바꾼 이름');
    assert.equal(p.frequency, '주 1일');
  });

  it('쓰지 않은 프로그램은 지울 수 있다', () => {
    const { state, id } = withFourDay();
    assert.deepEqual(removeCustomProgram(state, id).customPrograms, []);
  });

  it('구간에 한 번이라도 쓰였으면 고치기 · 지우기 모두 거절한다', () => {
    const { state, id } = withFourDay();
    let s = selectProgram(state, withCustomPrograms(catalog, state), id, '2026-10-26');
    s = switchProgram(s, withCustomPrograms(catalog, s), 'new_blood', '2026-10-27');
    assert.ok(isProgramUsed(s, id));
    assert.throws(() => updateCustomProgram(s, catalog, id, FOUR_DAY), /고치거나 지울 수 없다/);
    assert.throws(() => removeCustomProgram(s, id), /고치거나 지울 수 없다/);
  });

  it('카탈로그 5종은 커스텀이 아니라서 고칠 수 없다', () => {
    assert.throws(() => removeCustomProgram(initialState(), 'new_blood'), /커스텀 프로그램이 아니다/);
  });

  it('고칠 때도 입력을 검사한다', () => {
    const { state, id } = withFourDay();
    assert.throws(() => updateCustomProgram(state, catalog, id, { name: 'x', days: {} }), /운동일이 하루도/);
  });
});

describe('programToInput — 고치기 · 복제의 처음 값 (#13)', () => {
  it('커스텀 프로그램은 입력으로 되돌아간다', () => {
    const { state, id } = withFourDay();
    const input = programToInput(catalog, getProgram(withCustomPrograms(catalog, state), id));
    assert.deepEqual(input, FOUR_DAY);
  });

  it('카탈로그 5종은 빅6 밖 라벨(악력 · 종아리 · 목)을 뺀다', () => {
    const input = programToInput(catalog, getProgram(catalog, 'solitary_confinement'));
    assert.deepEqual(input.days.월, ['pullup', 'squat']);
    assert.equal(input.days.일, undefined);
    assert.equal(input.name, '독방 감금');
  });
});

describe('setStep — 조정 이력 (#4)', () => {
  it('onDate 를 주면 이전 · 이후 단계를 남긴다', () => {
    const s0 = stateAt({ pushup: 5 });
    const s1 = setStep(s0, catalog, 'pushup', 3, '2026-10-29');
    const s2 = setStep(s1, catalog, 'squat', 4, '2026-10-30');
    assert.deepEqual(s2.stepAdjustments, [
      { date: '2026-10-29', progressionId: 'pushup', from: 5, to: 3, fromTier: 'beginner', toTier: 'beginner' },
      { date: '2026-10-30', progressionId: 'squat', from: 2, to: 4, fromTier: 'beginner', toTier: 'beginner' },
    ]);
  });

  it('onDate 가 없으면 이력을 남기지 않는다 — 판정 앵커는 그대로 남긴다', () => {
    const s = setStep(stateAt({ pushup: 5 }), catalog, 'pushup', 3);
    assert.equal(s.stepAdjustments, undefined);
    assert.equal(s.adjustedAtSessionIndex?.pushup, 0);
  });

  it('인자 상태의 이력 배열을 바꾸지 않는다', () => {
    const s1 = setStep(stateAt({ pushup: 5 }), catalog, 'pushup', 3, '2026-10-29');
    setStep(s1, catalog, 'pushup', 4, '2026-10-30');
    assert.equal(s1.stepAdjustments!.length, 1);
  });
});
