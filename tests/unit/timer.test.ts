// 타이머 (FR-6.12 ~ FR-6.17, EC-14 / EC-28 / EC-29 / EC-30).
// 시각을 주입 가능한 Clock 으로 대체하고 tick 을 명시적으로 호출한다 —
// requestAnimationFrame 실제 스케줄러를 목킹하지 않는다.

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { createTimer, READY_MS, type Clock } from '../../src/lib/ui/timer.svelte.ts';

/** 테스트용 목 클록. */
function fakeClock(start: number): Clock & { advance(ms: number): void; value: number } {
  let t = start;
  return {
    now() {
      return t;
    },
    advance(ms: number) {
      t += ms;
    },
    get value() {
      return t;
    },
  };
}

// ── FR-6.12 EC-14 준비 5초 카운트다운 ─────────────────────────────────────

describe('타이머 — EC-14 unit: seconds 세트 & FR-6.12 준비 5초', () => {
  it('start 직후는 phase=ready, elapsedMs=0', () => {
    const t = createTimer();
    const c = fakeClock(1_000_000);
    t.setClock(c);
    t.start(120, () => {});
    t.tick();
    assert.equal(t.phase, 'ready');
    assert.equal(t.elapsedMs, 0);
    assert.equal(t.readyRemainingMs, READY_MS);
  });

  it('준비 4.9초 시점은 여전히 ready', () => {
    const t = createTimer();
    const c = fakeClock(1_000_000);
    t.setClock(c);
    t.start(120, () => {});
    c.advance(4_900);
    t.tick();
    assert.equal(t.phase, 'ready');
    assert.equal(t.elapsedMs, 0);
  });

  it('준비 5.1초 시점에 phase=running, elapsedMs > 0', () => {
    const t = createTimer();
    const c = fakeClock(1_000_000);
    t.setClock(c);
    t.start(120, () => {});
    c.advance(5_100);
    t.tick();
    assert.equal(t.phase, 'running');
    assert.ok(t.elapsedMs > 0);
    // startAt = start + 5000. 경과 = 5100 - 5000 = 100.
    assert.equal(t.elapsedMs, 100);
  });
});

// ── FR-6.13 EC-28 목표에서 멈추지 않는다 ──────────────────────────────────

describe('타이머 — FR-6.13 / EC-28 목표 초과 지속', () => {
  it('목표 120초 지나 130초까지 흐른다', () => {
    const t = createTimer();
    const c = fakeClock(0);
    t.setClock(c);
    t.start(120, () => {});
    c.advance(READY_MS + 130_000);
    t.tick();
    assert.equal(t.phase, 'running');
    assert.equal(t.elapsedMs, 130_000);
  });
});

// ── FR-6.14 목표 도달 시 1회 알림, 반복하지 않는다 ────────────────────────

describe('타이머 — FR-6.14 목표 도달 알림', () => {
  it('목표 도달 시 onAlert 정확히 1회', () => {
    const t = createTimer();
    const c = fakeClock(0);
    t.setClock(c);
    let calls = 0;
    t.start(60, () => {
      calls += 1;
    });
    c.advance(READY_MS + 59_000);
    t.tick();
    assert.equal(calls, 0);
    c.advance(1_500); // 60.5초
    t.tick();
    assert.equal(calls, 1);
    c.advance(10_000); // 70.5초
    t.tick();
    // 반복 호출 없음
    assert.equal(calls, 1);
  });
});

// ── FR-6.15 정지 전까지 계속 흐른다 ───────────────────────────────────────

describe('타이머 — FR-6.15 알림 후에도 정지 전까지 흐른다', () => {
  it('알림 후 흐름이 멈추지 않는다', () => {
    const t = createTimer();
    const c = fakeClock(0);
    t.setClock(c);
    t.start(60, () => {});
    c.advance(READY_MS + 90_000);
    t.tick();
    assert.equal(t.elapsedMs, 90_000);
    // 정지 전에는 phase 가 running 이다.
    assert.equal(t.phase, 'running');
  });
});

// ── FR-6.16 EC-29 정지 시각 == 기록 ───────────────────────────────────────

describe('타이머 — FR-6.16 / EC-29 정지 시각이 기록', () => {
  it('90초에 정지 → seconds === 90', () => {
    const t = createTimer();
    const c = fakeClock(0);
    t.setClock(c);
    t.start(60, () => {});
    c.advance(READY_MS + 90_000);
    const { seconds } = t.stop();
    assert.equal(seconds, 90);
    assert.equal(t.phase, 'stopped');
  });

  it('목표 시간 전에 정지도 가능하다 (EC-29 하한 없음)', () => {
    const t = createTimer();
    const c = fakeClock(0);
    t.setClock(c);
    t.start(120, () => {});
    c.advance(READY_MS + 30_000);
    const { seconds } = t.stop();
    assert.equal(seconds, 30);
  });
});

// ── FR-6.17 수동 정정 수단 ─────────────────────────────────────────────────

describe('타이머 — FR-6.17 수동 정정 수단', () => {
  it('overrideSeconds 로 기록을 갈아 쓸 수 있다', () => {
    const t = createTimer();
    const c = fakeClock(0);
    t.setClock(c);
    t.start(60, () => {});
    c.advance(READY_MS + 90_000);
    t.stop();
    t.overrideSeconds(120);
    assert.equal(Math.round(t.elapsedMs / 1000), 120);
  });
});

// ── EC-30 timestamp 기반 계산 ─────────────────────────────────────────────
//
// requestAnimationFrame 이 백그라운드에서 멈춰도, 재활성화 시 tick 을 부르면
// elapsedMs 는 Date.now() - startAt 로 즉시 정확히 계산된다.

describe('타이머 — EC-30 timestamp 기반 (틱 카운트 아님)', () => {
  it('중간에 tick 을 아예 부르지 않아도 정지 시점에 정확한 값', () => {
    const t = createTimer();
    const c = fakeClock(0);
    t.setClock(c);
    t.start(60, () => {});
    // 준비 5초 + 60초. tick 을 안 부른 채 시간만 흐른다 (백그라운드 탭 시뮬레이션).
    c.advance(READY_MS + 60_000);
    // 재활성화 → 곧바로 stop.
    const { seconds } = t.stop();
    assert.equal(seconds, 60);
  });

  it('화면 이탈 후 재진입 (tick 공백) 이 있어도 값이 어긋나지 않는다', () => {
    const t = createTimer();
    const c = fakeClock(0);
    t.setClock(c);
    t.start(60, () => {});
    c.advance(READY_MS + 10_000);
    t.tick();
    assert.equal(t.elapsedMs, 10_000);
    // 백그라운드 20초 동안 tick 이 안 불림.
    c.advance(20_000);
    t.tick(); // 재진입.
    assert.equal(t.elapsedMs, 30_000);
  });
});
