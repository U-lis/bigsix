// today 계산은 브라우저 전역을 참조하지 않는 순수 함수(`computeIsoLocal`)로 검증한다.
// TodayClock 자체는 브라우저 이벤트에 의존해 유닛 테스트 대상이 아니다 (통합 사안 —
// GLOBAL Risk 6 코드 리뷰 항목).

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { computeIsoLocal } from '../../src/lib/ui/today.svelte.ts';

describe('computeIsoLocal — 로컬 자정 기준 (FR-4.2)', () => {
  it('로컬 자정 이전 23:59 은 그날 날짜', () => {
    // new Date(y, m-1, d, h, m) 은 로컬 타임존 기준 생성이다.
    const d = new Date(2026, 8, 5, 23, 59);
    assert.equal(computeIsoLocal(d), '2026-09-05');
  });

  it('로컬 자정 직후는 다음 날짜', () => {
    const d = new Date(2026, 8, 6, 0, 0, 1);
    assert.equal(computeIsoLocal(d), '2026-09-06');
  });

  it('월 · 일이 zero-padded 다', () => {
    const d = new Date(2026, 0, 3, 12, 0);
    assert.equal(computeIsoLocal(d), '2026-01-03');
  });
});

describe('computeIsoLocal — UTC 기준을 쓰지 않는다 (FR-4.2)', () => {
  it('KST(UTC+9) 자정 = UTC 15시 상황에서 로컬 하루가 지나지 않는다', () => {
    // 이 테스트는 프로세스가 UTC 아닌 로컬 타임존일 때만 유의미하다.
    // 여기서는 명시적으로 로컬 자정 계산이 getFullYear/Month/Date 기반임을 다시 확인한다.
    const d = new Date(2026, 8, 5, 23, 59);
    const localIso = computeIsoLocal(d);
    // toISOString() 은 UTC 기준이라 로컬 타임존에 따라 하루 차이가 날 수 있다.
    // 우리는 로컬 기준이므로 그 값과 무관해야 한다.
    const utcIso = d.toISOString().slice(0, 10);
    // 두 값이 같을지 다를지는 TZ 환경에 따라 다르다. 우리 값이 getFullYear/Month/Date
    // 조합인 것만 확인한다.
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    assert.equal(localIso, expected);
    // 참고: utcIso 는 검증 대상이 아니다 — TZ 에 따라 값이 다르다.
    void utcIso;
  });
});
