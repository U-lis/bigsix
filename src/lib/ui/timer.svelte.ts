/**
 * unit: 'seconds' 세트용 카운트업 타이머 (FR-6.12 ~ FR-6.17).
 *
 * 흐름 — 준비 5초 카운트다운 → 카운트업 시작. 목표 시간에서 멈추지 않는다.
 * 목표 도달 시 `onAlert` 를 한 번 부르고 (`notify.alert()` 가 5초간 울리고 자동 조용해짐),
 * 알림 이후에도 정지 버튼 전까지 계속 흐른다.
 *
 * 경과 시간은 **시작 timestamp 기준으로 계산**한다 (EC-30). 틱 카운트에 의존하면
 * 백그라운드에서 어긋난다 — `requestAnimationFrame` 은 백그라운드 탭에서 멈추지만
 * `elapsedMs = Date.now() - startAt` 은 재활성화 시 즉시 정확한 값이 계산된다.
 *
 * 정지 시각이 곧 그 세트의 기록이다 (FR-6.16). 사람이 숫자를 입력하지 않는다.
 * 오작동 대비 수동 수정 수단은 스토어의 `overrideSeconds(sec)` 로 남긴다 (FR-6.17).
 */

export type TimerPhase = 'idle' | 'ready' | 'running' | 'stopped';

/** 준비 카운트다운 밀리초 (FR-6.12). 5초. */
export const READY_MS = 5_000;

/** 시각 소스를 주입 가능하게 열어 둔다 — 테스트에서 fake time. */
export interface Clock {
  now(): number;
}

const defaultClock: Clock = { now: () => Date.now() };

class TimerStore {
  phase = $state<TimerPhase>('idle');
  elapsedMs = $state(0);
  targetSec = $state(0);
  /** 준비 카운트다운 남은 밀리초. `phase === 'ready'` 일 때만 유의미. */
  readyRemainingMs = $state(0);

  #clock: Clock = defaultClock;
  #readyEndsAt = 0;
  #startAt = 0;
  #stoppedElapsedMs = 0;
  #alerted = false;
  #onAlert: (() => void) | null = null;
  #rafHandle: number | null = null;

  /** 테스트에서 시각 소스 주입. */
  setClock(clock: Clock): void {
    this.#clock = clock;
  }

  /**
   * 타이머를 시작한다.
   * @param targetSec 목표 시간(초). 알림 판정 기준.
   * @param onAlert 목표 도달 시 정확히 1회 호출. `notify.alert()` 를 넘긴다.
   */
  start(targetSec: number, onAlert: () => void): void {
    this.targetSec = targetSec;
    this.#onAlert = onAlert;
    this.#alerted = false;
    this.elapsedMs = 0;
    this.#stoppedElapsedMs = 0;

    const now = this.#clock.now();
    this.#readyEndsAt = now + READY_MS;
    this.#startAt = this.#readyEndsAt;
    this.phase = 'ready';
    this.readyRemainingMs = READY_MS;

    this.#scheduleTick();
  }

  /**
   * 화면이 리 렌더될 때 호출해 값을 갱신한다.
   * $effect 를 스토어 안에 두지 않고, 화면·테스트가 자기 시점에 호출한다 —
   * 시각 주입을 깨끗하게 유지하기 위함.
   */
  tick(): void {
    if (this.phase === 'idle' || this.phase === 'stopped') return;
    const now = this.#clock.now();

    if (this.phase === 'ready') {
      if (now < this.#readyEndsAt) {
        this.readyRemainingMs = this.#readyEndsAt - now;
        this.elapsedMs = 0;
        return;
      }
      // 준비 종료 → 카운트업 시작.
      this.phase = 'running';
      this.readyRemainingMs = 0;
    }

    // running
    this.elapsedMs = now - this.#startAt;
    if (!this.#alerted && this.elapsedMs >= this.targetSec * 1000) {
      this.#alerted = true;
      const cb = this.#onAlert;
      if (cb !== null) cb(); // FR-6.14 — 5초만 울리고 자동 조용 (notify.alert 안에서)
    }
  }

  /**
   * 정지 — 그 시점의 경과 시간이 세트 기록이다 (FR-6.16).
   * 반환하는 seconds 는 반올림된 정수다.
   */
  stop(): { seconds: number } {
    if (this.phase === 'idle' || this.phase === 'stopped') {
      return { seconds: Math.round(this.elapsedMs / 1000) };
    }
    this.tick(); // 정지 순간의 마지막 값을 반영
    this.#stoppedElapsedMs = this.elapsedMs;
    this.phase = 'stopped';
    this.#cancelRaf();
    return { seconds: Math.round(this.#stoppedElapsedMs / 1000) };
  }

  /** 오작동 · 오터치 대비 수동 정정 수단 (FR-6.17). */
  overrideSeconds(sec: number): void {
    this.#stoppedElapsedMs = sec * 1000;
    this.elapsedMs = this.#stoppedElapsedMs;
    this.phase = 'stopped';
  }

  reset(): void {
    this.phase = 'idle';
    this.elapsedMs = 0;
    this.readyRemainingMs = 0;
    this.targetSec = 0;
    this.#alerted = false;
    this.#stoppedElapsedMs = 0;
    this.#startAt = 0;
    this.#readyEndsAt = 0;
    this.#onAlert = null;
    this.#cancelRaf();
  }

  #scheduleTick(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    const step = () => {
      this.tick();
      if (this.phase === 'ready' || this.phase === 'running') {
        this.#rafHandle = requestAnimationFrame(step);
      }
    };
    this.#rafHandle = requestAnimationFrame(step);
  }

  #cancelRaf(): void {
    if (this.#rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.#rafHandle);
    }
    this.#rafHandle = null;
  }
}

/** 세트 하나당 하나의 인스턴스를 쓰기 위한 팩토리. 전역 싱글턴은 두지 않는다. */
export function createTimer(): TimerStore {
  return new TimerStore();
}

export type { TimerStore };
