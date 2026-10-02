// 발송 판정 — I/O 없는 순수 함수 (SPEC FR-35.2, FR-35.5, FR-35.6, FR-35.8).
//
// 현재 시각은 항상 `nowUtc` 인자로 받는다. 시스템 시각은 진입점(`push.ts`) 에서
// 한 번만 읽는다. 타임존 변환은 `Intl.DateTimeFormat` 만 쓴다 (SPEC FR-35.6 / FR-35.2-2).
//
// 외부 날짜 라이브러리 없음. 신규 npm 의존성 없음 (ADR-37).

/** 릴레이 `/v1/subscriptions` 응답의 한 항목. meta 는 아직 검증 전이라 `unknown`. */
export interface SubscriptionItem {
  id: string;
  meta: unknown;
  createdAt: string;
  updatedAt: string;
}

/** 검증된 meta — SPEC FR-34.1. 선택 필드 `test` 는 FR-33.11 테스트 발송 버튼 전용. */
export interface ValidMeta {
  v: 1;
  tz: string;
  /** `HH:MM`. */
  notifyAt: string;
  program: string;
  days: Record<string, string[]>;
  /** ISO 초 단위 UTC 문자열. dev 인스턴스만 읽는다 — prod 는 무시 (FR-35.8). */
  test?: string;
}

export interface DecideResult {
  subscriptionId: string;
  meta: ValidMeta;
}

/** 월~일 영어 약어를 Weekday 한글 키로 매핑한다 — meta.days 의 키 (SPEC FR-34.1). */
const WEEKDAY_MAP: Record<string, string> = {
  Mon: '월',
  Tue: '화',
  Wed: '수',
  Thu: '목',
  Fri: '금',
  Sat: '토',
  Sun: '일',
};

/**
 * meta 가 FR-34.1 형식에 맞는지 검사한다. 실패하면 null — 진입점이 로그에 남긴다.
 *
 * - `v !== 1` → null
 * - 알 수 없는 `tz` (`Intl.DateTimeFormat` 생성이 던지면) → null
 * - `notifyAt` 이 `HH:MM` 패턴에 안 맞거나 범위 벗어나면 → null
 * - 필수 필드(`tz` · `notifyAt` · `program` · `days`) 없음 → null
 */
export function validateMeta(raw: unknown): ValidMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (r.v !== 1) return null;

  if (typeof r.tz !== 'string' || r.tz.length === 0) return null;
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat('en-US', { timeZone: r.tz });
  } catch {
    return null;
  }

  if (typeof r.notifyAt !== 'string' || !/^\d{2}:\d{2}$/.test(r.notifyAt)) return null;
  const [hh, mm] = r.notifyAt.split(':').map((s) => Number(s));
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  if (typeof r.program !== 'string' || r.program.length === 0) return null;

  if (!r.days || typeof r.days !== 'object' || Array.isArray(r.days)) return null;
  const days = r.days as Record<string, unknown>;
  for (const key of Object.keys(days)) {
    const val = days[key];
    if (!Array.isArray(val)) return null;
    for (const item of val) {
      if (typeof item !== 'string') return null;
    }
  }

  const meta: ValidMeta = {
    v: 1,
    tz: r.tz,
    notifyAt: r.notifyAt,
    program: r.program,
    days: r.days as Record<string, string[]>,
  };
  if (typeof r.test === 'string') meta.test = r.test;
  return meta;
}

interface LocalParts {
  weekday: string;
  hour: number;
  minute: number;
}

/** `nowUtc` 를 `tz` 현지 시각으로 변환한다 — 요일 한글 키 · 시 · 분. */
function toLocal(nowUtc: Date, tz: string): LocalParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(nowUtc);
  const wdEn = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const weekday = WEEKDAY_MAP[wdEn] ?? '';
  return { weekday, hour: h, minute: m };
}

/**
 * 보낼 차례인지 (SPEC FR-35.2-3):
 *   1. 현지 요일이 `meta.days` 의 키이고 해당 배열이 비어 있지 않다.
 *   2. 현지 시각이 `[notifyAt, notifyAt + 30분)` 안이다.
 *   3. 창은 현지 자정을 넘지 않는다 (EC-80) — 23:50 설정이면 23:50~23:59.
 */
export function shouldSend(meta: ValidMeta, nowUtc: Date): boolean {
  const { weekday, hour, minute } = toLocal(nowUtc, meta.tz);
  const exercises = meta.days[weekday];
  if (!exercises || exercises.length === 0) return false;

  const [nhh, nmm] = meta.notifyAt.split(':').map((s) => Number(s));
  const startMin = nhh * 60 + nmm;
  const nowMin = hour * 60 + minute;
  const endMin = Math.min(startMin + 30, 24 * 60); // 현지 자정에서 자른다 (EC-80)
  return nowMin >= startMin && nowMin < endMin;
}

/**
 * 각 구독에 validateMeta · shouldSend 를 적용해, 지금 보낼 것들만 추린다.
 * 검증 실패 항목은 건너뛴다 — 로그는 진입점이 남긴다 (FR-35.5).
 */
export function filterSubscriptions(items: SubscriptionItem[], nowUtc: Date): DecideResult[] {
  const results: DecideResult[] = [];
  for (const item of items) {
    const meta = validateMeta(item.meta);
    if (!meta) continue;
    if (shouldSend(meta, nowUtc)) {
      results.push({ subscriptionId: item.id, meta });
    }
  }
  return results;
}

/**
 * 테스트 발송 조건 (SPEC FR-35.8, FR-33.11). dev 인스턴스 전용 — prod 는 호출하지 않는다.
 *
 * true 조건:
 *   (1) `meta.test` 가 유효한 ISO 문자열이다 (`new Date(...).toString() !== 'Invalid Date'`).
 *   (2) `nowUtc - new Date(meta.test)` 가 0 이상 10 분 이하이다.
 *       — 미래 타임스탬프는 보내지 않는다 (오차 보정 아님).
 */
export function shouldTestSend(meta: ValidMeta, nowUtc: Date): boolean {
  if (typeof meta.test !== 'string') return false;
  const t = new Date(meta.test);
  if (t.toString() === 'Invalid Date') return false;
  const diffMs = nowUtc.getTime() - t.getTime();
  if (diffMs < 0) return false;
  return diffMs <= 10 * 60 * 1000;
}
