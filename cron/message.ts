// 메시지 조립 — I/O 없는 순수 함수 (SPEC FR-35.3, FR-35.6, FR-35.8, ADR-38).
//
// 알림 본문·dedupKey·icon URL 을 만든다. 시스템 시각은 `nowUtc` 인자로 받는다.
// 외부 날짜 라이브러리 없음 — `Intl.DateTimeFormat` · `crypto.randomBytes` 만 쓴다.

import { randomBytes } from 'node:crypto';
import type { DecideResult, ValidMeta } from './decide.ts';

/**
 * 릴레이 `/v1/send` 요청의 message 한 건. 스키마:
 * push-relay/schema/cron-v1/send-request.json 의 `#/$defs/message`.
 */
export interface CronMessage {
  to: string;
  notification: {
    title: string;
    body: string;
    url: string;
    tag: string;
    icon: string;
  };
  dedupKey: string;
}

/** 월~일 영어 약어 → Weekday 한글 키 (meta.days 의 키와 같다). */
const WEEKDAY_MAP: Record<string, string> = {
  Mon: '월',
  Tue: '화',
  Wed: '수',
  Thu: '목',
  Fri: '금',
  Sat: '토',
  Sun: '일',
};

function localWeekday(nowUtc: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
  const wd = fmt.format(nowUtc);
  return WEEKDAY_MAP[wd] ?? '';
}

/** `YYYY-MM-DD` (현지 날짜). en-CA 가 바로 ISO 형식을 돌려준다. */
function localDateString(nowUtc: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(nowUtc);
}

/** `HH:MM` (현지 시각). `hourCycle: h23` 로 00~23 범위를 보장한다. */
function localHHMM(utcSrc: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(utcSrc);
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

/** 그날 현지 요일로 본문을 만든다. 휴식일(요일 키 없음·배열 비어 있음)이면 '오늘 휴식일'. */
function regularBody(meta: ValidMeta, weekday: string): string {
  const list = meta.days[weekday];
  if (!list || list.length === 0) {
    return `${meta.program} · 오늘 휴식일`;
  }
  return `${meta.program} · ${list.join(', ')}`;
}

/**
 * 정규 발송 메시지 (SPEC FR-35.3).
 *
 * - `title`: `'BigSix'`
 * - `body`: `'<program> · <exercises.join(", ")>'` (현지 요일 기준)
 * - `url`: `'/'`
 * - `tag`: `'bigsix-workday'`
 * - `icon`: `${appBaseUrl}/icon-192.png` — 절대 URL (IR-6 상대 경로 모호성 우회)
 * - `dedupKey`: 현지 날짜 `YYYY-MM-DD` — 창 안에서 매 분 돌아도 하루 한 번 (ADR-38)
 */
export function buildMessage(result: DecideResult, appBaseUrl: string, nowUtc: Date): CronMessage {
  const meta = result.meta;
  const wd = localWeekday(nowUtc, meta.tz);
  return {
    to: result.subscriptionId,
    notification: {
      title: 'BigSix',
      body: regularBody(meta, wd),
      url: '/',
      tag: 'bigsix-workday',
      icon: `${appBaseUrl}/icon-192.png`,
    },
    dedupKey: localDateString(nowUtc, meta.tz),
  };
}

/**
 * dev 테스트 발송 메시지 (SPEC FR-35.8).
 *
 * - `body`: `'테스트 · <HH:MM> · <정규 본문>'`. HH:MM 은 `meta.test` 를 `meta.tz`
 *   현지 시각으로 변환한 값. 오늘이 휴식일이면 정규 본문 자리에 `'<program> · 오늘 휴식일'`.
 * - `url` · `tag` · `icon`: 정규와 같음.
 * - `dedupKey`: `'test-' + YYYYMMDDHHMMSS` (UTC, `meta.test` 기준, 초 단위).
 *   같은 초에 두 번 누르면 릴레이 dedup 으로 1건만 보내진다.
 *
 * `meta.test` 가 없는 경우는 호출자(push.ts)가 shouldTestSend 로 걸러낸다.
 */
export function buildTestMessage(result: DecideResult, appBaseUrl: string, nowUtc: Date): CronMessage {
  const meta = result.meta;
  const testIso = meta.test ?? '';
  const testDate = new Date(testIso);
  const localTime = localHHMM(testDate, meta.tz);
  const wd = localWeekday(nowUtc, meta.tz);

  const body = `테스트 · ${localTime} · ${regularBody(meta, wd)}`;

  const y = testDate.getUTCFullYear().toString().padStart(4, '0');
  const mo = (testDate.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = testDate.getUTCDate().toString().padStart(2, '0');
  const hh = testDate.getUTCHours().toString().padStart(2, '0');
  const mm = testDate.getUTCMinutes().toString().padStart(2, '0');
  const ss = testDate.getUTCSeconds().toString().padStart(2, '0');
  const dedupKey = `test-${y}${mo}${d}${hh}${mm}${ss}`;

  return {
    to: result.subscriptionId,
    notification: {
      title: 'BigSix',
      body,
      url: '/',
      tag: 'bigsix-workday',
      icon: `${appBaseUrl}/icon-192.png`,
    },
    dedupKey,
  };
}

/**
 * 발송 전에 로그에 남기는 requestId (ADR-38, SPEC FR-35.4).
 *
 * 형식: `bigsix-<UTC YYYY-MM-DDTHH:MM>-<4자리 hex>`.
 * 릴레이 스키마 `send-request.json` 의 `requestId.pattern = ^[A-Za-z0-9_.:-]{1,64}$` 안에 들어온다.
 */
export function buildRequestId(nowUtc: Date): string {
  const y = nowUtc.getUTCFullYear().toString().padStart(4, '0');
  const mo = (nowUtc.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = nowUtc.getUTCDate().toString().padStart(2, '0');
  const hh = nowUtc.getUTCHours().toString().padStart(2, '0');
  const mm = nowUtc.getUTCMinutes().toString().padStart(2, '0');
  const suffix = randomBytes(2).toString('hex'); // 4 hex chars
  return `bigsix-${y}-${mo}-${d}T${hh}:${mm}-${suffix}`;
}

/** JSON 직렬화 바이트 수 — 릴레이 상한 3072 바이트 확인용 (SPEC FR-35.3). */
export function estimatedMessageBytes(msg: CronMessage): number {
  return JSON.stringify(msg).length;
}
