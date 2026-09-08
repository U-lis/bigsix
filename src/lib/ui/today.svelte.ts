/**
 * "오늘이 며칠인가" 를 소유하는 유일한 지점 (FR-4).
 *
 * 도메인은 시스템 시각을 읽지 않는다 (NFR-5a). 여기서 산출한 `IsoDate` 를 도메인에
 * 넘긴다. **컴포넌트에서 `new Date()` 를 호출하지 마라 (FR-4.4).** 로컬 자정 기준으로
 * 산출하며 (FR-4.2 / EC-6) UTC 기준을 쓰지 않는다.
 */

import type { IsoDate } from '../domain/types.ts';

/**
 * `Date` 하나에서 로컬 달력 기준의 `YYYY-MM-DD` 를 만든다.
 *
 * `getFullYear/Month/Date` 는 로컬 타임존 기준이므로 KST 자정 = UTC 15시 상황에서도
 * 로컬 하루가 넘어간 뒤에만 값이 바뀐다. `toISOString()` 을 쓰면 UTC 기준이라
 * 하루가 밀린다 — 그래서 여기서 그것을 쓰지 않는다.
 */
export function computeIsoLocal(date: Date): IsoDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

class TodayClock {
  #today = $state<IsoDate>(computeIsoLocal(new Date()));
  #midnightTimer: ReturnType<typeof setTimeout> | null = null;
  #visibilityHandler: (() => void) | null = null;

  get today(): IsoDate {
    return this.#today;
  }

  /** 재계산해서 저장된 값을 갱신한다. 테스트와 자정 넘김 훅에서 사용한다. */
  recompute(now: Date = new Date()): void {
    const next = computeIsoLocal(now);
    if (next !== this.#today) this.#today = next;
  }

  /**
   * 자정 넘김 감지를 시작한다 (EC-6).
   * `setTimeout` 은 브라우저 백그라운드에서 느슨해지므로 `visibilitychange` 도 함께 건다.
   * 서버 사이드에서 호출되면 조용히 아무 것도 하지 않는다.
   */
  start(): void {
    if (typeof window === 'undefined') return;
    this.stop();
    this.recompute();
    this.#scheduleMidnight();

    this.#visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this.recompute();
        // 백그라운드에 있는 사이 자정을 지나쳤을 수 있다. 다시 예약한다.
        this.#scheduleMidnight();
      }
    };
    document.addEventListener('visibilitychange', this.#visibilityHandler);
  }

  stop(): void {
    if (this.#midnightTimer !== null) {
      clearTimeout(this.#midnightTimer);
      this.#midnightTimer = null;
    }
    if (this.#visibilityHandler !== null && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.#visibilityHandler);
      this.#visibilityHandler = null;
    }
  }

  #scheduleMidnight(): void {
    if (this.#midnightTimer !== null) clearTimeout(this.#midnightTimer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const ms = next.getTime() - now.getTime();
    // 로컬 자정 다음 1초에 한 번 재계산하고 다시 예약한다.
    this.#midnightTimer = setTimeout(() => {
      this.recompute();
      this.#scheduleMidnight();
    }, ms);
  }
}

export const todayClock = new TodayClock();
