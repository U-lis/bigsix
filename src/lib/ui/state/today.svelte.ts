/**
 * "오늘이 며칠인가" 를 소유하는 유일한 지점 (FR-4).
 *
 * 도메인은 시스템 시각을 읽지 않는다 (NFR-5a). 여기서 산출한 `IsoDate` 를 도메인에
 * 넘긴다. **컴포넌트에서 `new Date()` 를 호출하지 마라 (FR-4.4).** 로컬 자정 기준으로
 * 산출하며 (FR-4.2 / EC-6) UTC 기준을 쓰지 않는다.
 *
 * 세션 완료 시각(`completedAt`)도 여기서 가져간다 (ADR-24 / FR-28.4). `nowIsoLocal()` 은
 * 로컬 오프셋 포함 ISO 8601 문자열을 낸다 — `toISOString()` 은 UTC 라 오프셋을 잃는다.
 */

import type { IsoDate } from '$lib/domain/types';

/**
 * 시각 소스. 테스트에서 fake time 을 주입해 결정적 값을 얻기 위한 훅 (ADR-24).
 * `timer.svelte.ts` 의 `Clock` 과 같은 형태다.
 */
export interface Clock {
  now(): number;
}

const defaultClock: Clock = { now: () => Date.now() };

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * `Date` 하나에서 로컬 달력 기준의 `YYYY-MM-DD` 를 만든다.
 *
 * `getFullYear/Month/Date` 는 로컬 타임존 기준이므로 KST 자정 = UTC 15시 상황에서도
 * 로컬 하루가 넘어간 뒤에만 값이 바뀐다. `toISOString()` 을 쓰면 UTC 기준이라
 * 하루가 밀린다 — 그래서 여기서 그것을 쓰지 않는다.
 */
export function computeIsoLocal(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * 로컬 시각과 오프셋을 조합해 `YYYY-MM-DDTHH:mm:ss±HH:MM` 형식으로 만든다 (ADR-24).
 *
 * `offsetMinutes` 는 `Date.getTimezoneOffset()` 값과 같은 규약이다 — **UTC 대비 부호가 반대**.
 * (예: KST(UTC+9) 에서 `getTimezoneOffset()` 은 -540, ISO 표기는 `+09:00`.)
 *
 * 순수 함수로 뺀 이유는 오프셋 계산 자체를 테스트에서 결정적으로 검증하기 위함이다 —
 * 프로세스 TZ 를 강제하는 대신 offset 값을 직접 주면 된다.
 */
export function formatIsoLocal(date: Date, offsetMinutes: number): string {
  const y = date.getFullYear();
  const mo = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const h = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  const s = pad2(date.getSeconds());
  // getTimezoneOffset 의 부호를 뒤집어 ISO 표기(UTC 대비 +/-)로 만든다.
  const sign = offsetMinutes <= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const oh = pad2(Math.floor(abs / 60));
  const om = pad2(abs % 60);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${sign}${oh}:${om}`;
}

class TodayClock {
  #today = $state<IsoDate>(computeIsoLocal(new Date()));
  #midnightTimer: ReturnType<typeof setTimeout> | null = null;
  #visibilityHandler: (() => void) | null = null;
  #clock: Clock = defaultClock;

  get today(): IsoDate {
    return this.#today;
  }

  /** 테스트에서 시각 소스 주입 (ADR-24). 기본은 `Date.now`. */
  setClock(clock: Clock): void {
    this.#clock = clock;
  }

  /**
   * 세션 완료 시각용 로컬 오프셋 포함 ISO 8601 문자열 (FR-28.4 / ADR-24).
   * `2026-09-18T13:45:23+09:00`.
   */
  nowIsoLocal(): string {
    const d = new Date(this.#clock.now());
    return formatIsoLocal(d, d.getTimezoneOffset());
  }

  /** 재계산해서 저장된 값을 갱신한다. 테스트와 자정 넘김 훅에서 사용한다. */
  recompute(now: Date = new Date(this.#clock.now())): void {
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
