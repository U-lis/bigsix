import { WEEKDAYS } from './types.ts';
import type { IsoDate, Weekday } from './types.ts';

/**
 * 'YYYY-MM-DD' → UTC epoch ms.
 * 문자열을 Date 생성자에 넘기지 않는다 (ADR-5).
 * ISO 문자열 파싱은 UTC 로 해석되어 UTC-N 타임존에서 하루 밀린다.
 */
function toUTC(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** UTC epoch ms → 'YYYY-MM-DD'. 항상 zero-padded 로 만든다. */
function toIso(ms: number): IsoDate {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** 하루의 밀리초. */
const DAY_MS = 86_400_000;

/**
 * 날짜의 요일 (FR-6.2).
 * `getUTCDay()` 는 일요일이 0 이고 WEEKDAYS 는 월요일이 인덱스 0 이므로 +6 후 7로 나눈 나머지를 쓴다.
 */
export function weekdayOf(date: IsoDate): Weekday {
  const day = new Date(toUTC(date)).getUTCDay();
  return WEEKDAYS[(day + 6) % 7];
}

/** n 일 뒤 날짜. n 이 음수면 그만큼 앞의 날짜다. */
export function addDays(date: IsoDate, n: number): IsoDate {
  return toIso(toUTC(date) + n * DAY_MS);
}

/**
 * from 에서 to 까지의 일수(`to - from`).
 * 음수를 그대로 돌려준다 (EC-10). 클램프는 호출자 책임이다.
 */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

/**
 * from 부터 to 까지의 날짜 목록. 양끝을 포함한다 (FR-5.2).
 * `from > to` 면 빈 배열이다. 길이 상한을 두지 않는다 (FR-3.6).
 */
export function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const span = diffDays(from, to);
  if (span < 0) return [];
  const out: IsoDate[] = [];
  for (let i = 0; i <= span; i += 1) out.push(addDays(from, i));
  return out;
}

/** 월요일인지. 전환 제안 생성일 판정에 쓴다 (FR-4.6). */
export function isMonday(date: IsoDate): boolean {
  return weekdayOf(date) === '월';
}
