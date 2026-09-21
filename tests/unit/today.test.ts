// today 계산은 브라우저 전역을 참조하지 않는 순수 함수(`computeIsoLocal`)로 검증한다.
// TodayClock 자체는 브라우저 이벤트에 의존해 유닛 테스트 대상이 아니다 (통합 사안 —
// GLOBAL Risk 6 코드 리뷰 항목).
//
// FR-28.4 / ADR-24: `nowIsoLocal` 은 로컬 오프셋 포함 ISO 문자열을 낸다.
// 결정성 확보를 위해 `setClock` 훅을 두어 fake time 주입을 허용한다. 순수 포매터
// `formatIsoLocal` 은 offset 을 직접 받으므로 UTC 환경을 강제하지 않고도 검증된다.

import { afterEach, describe, it } from 'vitest';
import assert from 'node:assert/strict';

import {
  computeIsoLocal,
  formatIsoLocal,
  todayClock,
} from '../../src/lib/ui/state/today.svelte.ts';

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

// ── FR-28.4 / ADR-24 : nowIsoLocal · setClock · formatIsoLocal ────────────

const ISO_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

describe('formatIsoLocal — 순수 포매터 (FR-28.4)', () => {
  it('offset=0 (UTC) 이면 표기가 +00:00 이다', () => {
    // getTimezoneOffset 값 0 = UTC. 실제 프로세스 TZ 와 무관하게 순수 포매터로 검증.
    const d = new Date(2026, 8, 18, 13, 45, 23);
    const s = formatIsoLocal(d, 0);
    assert.match(s, ISO_LOCAL_RE);
    assert.ok(s.endsWith('+00:00'), `expected +00:00, got ${s}`);
  });

  it('offset=-540 (KST, UTC+9) 이면 표기가 +09:00 이다 — 부호가 뒤집힌다', () => {
    const d = new Date(2026, 8, 18, 13, 45, 23);
    const s = formatIsoLocal(d, -540);
    assert.match(s, ISO_LOCAL_RE);
    assert.ok(s.endsWith('+09:00'), `expected +09:00, got ${s}`);
  });

  it('offset=+300 (EST) 이면 표기가 -05:00 이다', () => {
    const d = new Date(2026, 8, 18, 13, 45, 23);
    const s = formatIsoLocal(d, 300);
    assert.match(s, ISO_LOCAL_RE);
    assert.ok(s.endsWith('-05:00'), `expected -05:00, got ${s}`);
  });

  it('zero-padded HH:mm:ss', () => {
    const d = new Date(2026, 0, 3, 4, 5, 6);
    const s = formatIsoLocal(d, -540);
    assert.equal(s, '2026-01-03T04:05:06+09:00');
  });
});

describe('todayClock.nowIsoLocal — 결정성 (FR-28.4 / ADR-24)', () => {
  afterEach(() => {
    // 다른 테스트에 영향 없도록 기본 시계로 복원.
    todayClock.setClock({ now: () => Date.now() });
  });

  it('setClock 로 시각을 고정하면 nowIsoLocal 이 결정적이다', () => {
    // 2026-09-18 13:45:23 로컬. TZ 는 프로세스 TZ 를 따르지만, 여러 번 불러도 값이 같다.
    const fixed = new Date(2026, 8, 18, 13, 45, 23).getTime();
    todayClock.setClock({ now: () => fixed });
    const a = todayClock.nowIsoLocal();
    const b = todayClock.nowIsoLocal();
    assert.equal(a, b);
    assert.match(a, ISO_LOCAL_RE);
  });

  it('반환 형식이 `YYYY-MM-DDTHH:mm:ss±HH:MM`', () => {
    todayClock.setClock({ now: () => new Date(2026, 8, 18, 13, 45, 23).getTime() });
    assert.match(todayClock.nowIsoLocal(), ISO_LOCAL_RE);
  });
});
