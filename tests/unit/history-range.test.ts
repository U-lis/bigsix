// 기록 탭 범위·30일 창 계산 (FR-24.1 / FR-24.7 / NFR-24).

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { historyRange, windowsBack } from '../../src/lib/ui/history/range.ts';
import { addDays, initialState } from '../../src/lib/domain/index.ts';
import type {
  AppState, IsoDate, ProgramStint, SessionRecord,
} from '../../src/lib/domain/types.ts';

const TODAY: IsoDate = '2026-09-21';

function baseState(overrides: Partial<AppState> = {}): AppState {
  return { ...initialState(2), ...overrides };
}

function stint(programId: string, selectedAt: IsoDate, startedAt: IsoDate): ProgramStint {
  return { programId, selectedAt, startedAt, endedAt: null };
}

function rec(date: IsoDate): SessionRecord {
  return { date, progressionId: 'pushup', step: 2, sets: [5, 5], kind: 'work' };
}

describe('historyRange — 표시 범위 (FR-24.1 / EC-66)', () => {
  it('기록도 구간도 없으면 null', () => {
    assert.equal(historyRange(baseState(), TODAY), null);
  });

  it('기록만 있으면 from 은 첫 record.date, to 는 today', () => {
    const s = baseState({ history: [rec('2026-08-15'), rec('2026-09-01')] });
    assert.deepEqual(historyRange(s, TODAY), { from: '2026-08-15', to: TODAY });
  });

  it('구간만 있으면 from 은 첫 stint.selectedAt, to 는 today', () => {
    const s = baseState({ stints: [stint('good_behavior', '2026-08-01', '2026-08-03')] });
    assert.deepEqual(historyRange(s, TODAY), { from: '2026-08-01', to: TODAY });
  });

  it('둘 다 있으면 이른 쪽 (selectedAt < record.date)', () => {
    const s = baseState({
      stints: [stint('good_behavior', '2026-07-20', '2026-07-22')],
      history: [rec('2026-08-15')],
    });
    assert.equal(historyRange(s, TODAY)?.from, '2026-07-20');
  });

  it('둘 다 있으면 이른 쪽 (record.date < selectedAt) — EC-66 자유 운동 선행 케이스', () => {
    const s = baseState({
      stints: [stint('good_behavior', '2026-08-10', '2026-08-11')],
      history: [rec('2026-07-15')], // 프로그램 미선택 기간의 자유 운동 상당
    });
    assert.equal(historyRange(s, TODAY)?.from, '2026-07-15');
  });
});

describe('windowsBack — 30일 페이지 창 (FR-24.7)', () => {
  it('최신 창이 배열 앞에 온다', () => {
    // 범위 60일: [today-59 .. today]
    const from = addDays(TODAY, -59);
    const windows = windowsBack({ from, to: TODAY }, 30);
    assert.equal(windows[0].to, TODAY);
    // 뒤 창의 to 는 앞 창의 from 보다 하루 이르다.
    for (let i = 1; i < windows.length; i += 1) {
      assert.equal(windows[i].to, addDays(windows[i - 1].from, -1));
    }
  });

  it('첫 창은 [to-29, to], 다음 창은 [to-59, to-30] 형태', () => {
    const from = addDays(TODAY, -89);
    const windows = windowsBack({ from, to: TODAY }, 30);
    assert.deepEqual(windows[0], { from: addDays(TODAY, -29), to: TODAY });
    assert.deepEqual(windows[1], { from: addDays(TODAY, -59), to: addDays(TODAY, -30) });
    assert.deepEqual(windows[2], { from: addDays(TODAY, -89), to: addDays(TODAY, -60) });
  });

  it('마지막 창은 range.from 을 포함하고 그 이전으로 넘어가지 않는다', () => {
    const from = addDays(TODAY, -45); // 46일 범위 → 두 창
    const windows = windowsBack({ from, to: TODAY }, 30);
    assert.equal(windows.length, 2);
    assert.equal(windows[0].to, TODAY);
    assert.equal(windows[0].from, addDays(TODAY, -29));
    // 두 번째 창은 range.from 에서 멈춘다 — 16일 폭만 남는다.
    assert.equal(windows[1].to, addDays(TODAY, -30));
    assert.equal(windows[1].from, from);
  });

  it('범위가 30일 미만이면 창 하나 안에 다 든다', () => {
    const from = addDays(TODAY, -5);
    const windows = windowsBack({ from, to: TODAY }, 30);
    assert.deepEqual(windows, [{ from, to: TODAY }]);
  });

  it('from === to 면 하루짜리 창 하나', () => {
    const windows = windowsBack({ from: TODAY, to: TODAY }, 30);
    assert.deepEqual(windows, [{ from: TODAY, to: TODAY }]);
  });
});
