// @vitest-environment happy-dom
//
// 다중 알림 (FR-6.14 / EC-24).
// DOM · WebAudio · vibrate 를 부분적으로만 스텁하고, alert 가 예외를 던지지 않고
// 세 수단을 각각 시도하는지 확인한다.

import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';

import { alert as notifyAlert } from '../../src/lib/ui/notify.ts';

// happy-dom 은 AudioContext 를 기본 제공하지 않는다. 최소 스텁을 씌운다.
class MockAudioContext {
  destination = {};
  currentTime = 0;
  createOscillator() {
    return {
      type: 'sine',
      frequency: { value: 0 },
      connect() {},
      start() {},
      stop() {},
    };
  }
  createGain() {
    return { gain: { value: 0 }, connect() {} };
  }
  close() {
    return Promise.resolve();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  // 스텁 정리
  try {
    delete (globalThis as { AudioContext?: unknown }).AudioContext;
  } catch {
    // ignore
  }
  try {
    if ('vibrate' in navigator) {
      delete (navigator as unknown as { vibrate?: unknown }).vibrate;
    }
  } catch {
    // ignore
  }
  try {
    document.body?.removeAttribute('data-flash');
  } catch {
    // ignore
  }
});

// ── EC-24 3수단 동시 시도 ─────────────────────────────────────────────────

describe('alert — EC-24 3수단 동시 시도', () => {
  it('소리 · 진동 · 화면 점멸이 각각 시도된다', () => {
    // 소리
    (globalThis as unknown as { AudioContext: unknown }).AudioContext =
      MockAudioContext as unknown as typeof AudioContext;
    // 진동
    const vibrateSpy = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrateSpy,
    });

    notifyAlert({ durationMs: 5_000 });

    // 진동은 최초 1회 호출.
    assert.ok(vibrateSpy.mock.calls.length >= 1);
    // 화면 점멸은 body[data-flash] 로 표현.
    assert.equal(document.body.getAttribute('data-flash'), 'on');
  });
});

describe('alert — 소리 실패해도 진동·점멸은 살아 있다', () => {
  it('AudioContext 가 없는 환경', () => {
    // AudioContext 를 심지 않는다 — 소리 실패.
    const vibrateSpy = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrateSpy,
    });
    notifyAlert({ durationMs: 5_000 });
    assert.ok(vibrateSpy.mock.calls.length >= 1);
    assert.equal(document.body.getAttribute('data-flash'), 'on');
  });
});

describe('alert — 진동 미지원이어도 소리·점멸은 살아 있다', () => {
  it('navigator.vibrate 가 없는 환경', () => {
    (globalThis as unknown as { AudioContext: unknown }).AudioContext =
      MockAudioContext as unknown as typeof AudioContext;
    // vibrate 자체를 미정의로 둔다.
    try {
      delete (navigator as unknown as { vibrate?: unknown }).vibrate;
    } catch {
      // ignore
    }
    // 예외 없이 실행되어야 한다.
    notifyAlert({ durationMs: 5_000 });
    assert.equal(document.body.getAttribute('data-flash'), 'on');
  });
});

// ── FR-6.14 5초 후 자동 종료 ──────────────────────────────────────────────

describe('alert — 5초 후 자동 종료 (FR-6.14)', () => {
  it('durationMs 지나면 data-flash 가 제거된다', () => {
    notifyAlert({ durationMs: 5_000 });
    assert.equal(document.body.getAttribute('data-flash'), 'on');
    vi.advanceTimersByTime(5_100);
    assert.equal(document.body.getAttribute('data-flash'), null);
  });
});

describe('alert — 취소 (cancel)', () => {
  it('handle.cancel() 로 즉시 종료할 수 있다', () => {
    const h = notifyAlert({ durationMs: 5_000 });
    assert.equal(document.body.getAttribute('data-flash'), 'on');
    h.cancel();
    assert.equal(document.body.getAttribute('data-flash'), null);
  });
});
