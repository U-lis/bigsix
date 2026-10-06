// cron 진입점 — I/O 와 흐름 제어만 담당한다 (SPEC FR-35.1, FR-35.2, FR-35.4, FR-35.5).
//
// Node 24 네이티브 TS 실행 (24.3+ 에서 `--experimental-strip-types` 가 기본). `src/` 를 import 하지 않는다 (ADR-37).
// 로컬 로그는 stdout/stderr → journald. API 키는 절대 로그에 남기지 않는다.
//
// 플로우:
//   1. --instance 인자 파싱 (prod | dev, 기본 prod).
//   2. 환경변수 읽기 (PUSH_RELAY_API · PUSH_RELAY_KEY).
//   3. nowUtc 한 번 읽고 requestId 를 로그에 남긴다 (발송 전).
//   4. /v1/subscriptions 를 next 가 null 이 될 때까지 페이지네이션으로 받는다.
//   5. 검증 실패 meta 는 건너뛰고 로그에 남긴다 (한 구독의 문제로 전체가 멈추지 않는다).
//   6. 정규 발송 메시지 조립.
//   7. dev 인스턴스면 shouldTestSend 가 true 인 구독에 테스트 메시지도 추가.
//   8. messages 가 0 건이면 /v1/send 호출을 건너뛴다.
//   9. POST /v1/send → status !== 'sent' 는 전부 로그에 남긴다 (FR-35.4).

import { fileURLToPath } from 'node:url';

import { readEnv } from './env.ts';
import {
  filterSubscriptions,
  shouldTestSend,
  validateMeta,
} from './decide.ts';
import type { SubscriptionItem } from './decide.ts';
import {
  buildMessage,
  buildRequestId,
  buildTestMessage,
  estimatedMessageBytes,
} from './message.ts';
import type { CronMessage } from './message.ts';

/** 운영 인스턴스 공개 주소 — icon 절대 URL 조립에 쓴다 (IR-6 우회). */
const APP_BASE_URL = 'https://bigsix.siot-ieung.duckdns.org';

/** 알림 하나는 JSON 3072 바이트 이하 (push-relay §6, send-request.json). */
const MESSAGE_BYTE_LIMIT = 3072;

export type Instance = 'prod' | 'dev';

export function parseInstance(argv: ReadonlyArray<string>): Instance {
  const idx = argv.indexOf('--instance');
  if (idx >= 0 && idx + 1 < argv.length) {
    const v = argv[idx + 1];
    if (v === 'dev') return 'dev';
    if (v === 'prod') return 'prod';
  }
  return 'prod';
}

/** 테스트에서 교체할 수 있는 fetch 추상화. 서명은 전역 `fetch` 와 같다. */
export type Fetcher = typeof fetch;

interface SubscriptionsResponse {
  items?: SubscriptionItem[];
  next?: string | null;
}

interface SendResult {
  to: string;
  status: 'sent' | 'suppressed' | 'not-found' | 'gone' | 'failed';
  reason?: string;
  pushStatus?: number;
}

interface SendResponse {
  requestId: string;
  results: SendResult[];
  summary?: Record<string, number>;
}

interface Logger {
  log: (msg: string) => void;
  error: (msg: string) => void;
}

/**
 * `/v1/subscriptions` 를 `next` 가 null 이 될 때까지 이어 받는다. 한 번에 최대 1000건.
 */
export async function listSubscriptions(
  relayApi: string,
  relayKey: string,
  fetchFn: Fetcher,
): Promise<SubscriptionItem[]> {
  const items: SubscriptionItem[] = [];
  let after: string | null = null;
  // next 가 null 이 될 때까지. 무한 루프 방지는 next 가 바뀌지 않으면 서버 쪽 문제 — 로그로 눈치챈다.
  // 최대 반복 횟수(총 ~백만 건 수준)는 넉넉히 1000 으로 둔다.
  for (let i = 0; i < 1000; i++) {
    const qs = after === null ? '' : `?after=${encodeURIComponent(after)}`;
    const url = `${relayApi}/v1/subscriptions${qs}`;
    const resp = await fetchFn(url, {
      headers: { Authorization: `Bearer ${relayKey}` },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(
        `구독 목록 조회 실패: ${resp.status} ${resp.statusText}${text ? ' ' + text : ''}`,
      );
    }
    const body = (await resp.json()) as SubscriptionsResponse;
    if (Array.isArray(body.items)) {
      items.push(...body.items);
    }
    const nextVal = body.next;
    if (typeof nextVal !== 'string' || nextVal.length === 0) break;
    after = nextVal;
  }
  return items;
}

/** POST /v1/send — 요청 본문 생성과 응답 파싱 (ADR-38 재시도 규칙은 호출자가 로깅으로 처리). */
export async function sendMessages(
  relayApi: string,
  relayKey: string,
  requestId: string,
  messages: CronMessage[],
  fetchFn: Fetcher,
): Promise<SendResponse> {
  const resp = await fetchFn(`${relayApi}/v1/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${relayKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ requestId, messages }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(
      `발송 실패: ${resp.status} ${resp.statusText}${text ? ' ' + text : ''}`,
    );
  }
  return (await resp.json()) as SendResponse;
}

export interface RunOptions {
  argv: ReadonlyArray<string>;
  env: NodeJS.ProcessEnv;
  nowUtc: Date;
  fetchFn?: Fetcher;
  logger?: Logger;
  /** 테스트에서 APP_BASE_URL 을 교체하려는 용도. 기본값은 운영 공개 주소. */
  appBaseUrl?: string;
}

export async function run(opts: RunOptions): Promise<void> {
  const instance = parseInstance(opts.argv);
  const { relayApi, relayKey } = readEnv(opts.env);
  const nowUtc = opts.nowUtc;
  const fetchFn: Fetcher = opts.fetchFn ?? fetch;
  const logger: Logger = opts.logger ?? console;
  const appBaseUrl = opts.appBaseUrl ?? APP_BASE_URL;

  const requestId = buildRequestId(nowUtc);
  // 발송 전에 로그로 남긴다 (ADR-38 / FR-35.4) — 응답을 잃어도 수동 조회가 가능하다.
  logger.log(`[cron] instance=${instance} requestId=${requestId}`);

  const items = await listSubscriptions(relayApi, relayKey, fetchFn);
  logger.log(`[cron] fetched=${items.length}`);

  // 검증 실패 항목은 건너뛰고 사유를 로그에 남긴다 (FR-35.5).
  for (const item of items) {
    if (validateMeta(item.meta) === null) {
      logger.log(`[cron] skip invalid meta: id=${item.id}`);
    }
  }

  // 정규 발송 (FR-35.2 / FR-35.3).
  const toSend = filterSubscriptions(items, nowUtc);
  const messages: CronMessage[] = toSend.map((r) => buildMessage(r, appBaseUrl, nowUtc));

  // 테스트 발송 (FR-35.8) — dev 인스턴스 전용. prod 는 meta.test 를 읽지 않는다.
  if (instance === 'dev') {
    for (const item of items) {
      const meta = validateMeta(item.meta);
      if (meta === null) continue;
      if (!shouldTestSend(meta, nowUtc)) continue;
      messages.push(buildTestMessage({ subscriptionId: item.id, meta }, appBaseUrl, nowUtc));
    }
  }

  // 바이트 상한 확인 — 넘는 메시지는 건너뛰고 로그에 남긴다. 아니면 요청 전체가 400 이 된다.
  const safe: CronMessage[] = [];
  for (const msg of messages) {
    const bytes = estimatedMessageBytes(msg);
    if (bytes > MESSAGE_BYTE_LIMIT) {
      logger.log(`[cron] skip oversized message: to=${msg.to} bytes=${bytes} limit=${MESSAGE_BYTE_LIMIT}`);
      continue;
    }
    safe.push(msg);
  }

  if (safe.length === 0) {
    logger.log(`[cron] nothing to send`);
    return;
  }

  logger.log(`[cron] sending ${safe.length} message(s)`);
  const resp = await sendMessages(relayApi, relayKey, requestId, safe, fetchFn);
  for (const r of resp.results) {
    if (r.status === 'sent') continue;
    const extras: string[] = [];
    if (r.reason) extras.push(`reason=${r.reason}`);
    if (typeof r.pushStatus === 'number') extras.push(`pushStatus=${r.pushStatus}`);
    const tail = extras.length > 0 ? ' ' + extras.join(' ') : '';
    logger.log(`[cron] result: to=${r.to} status=${r.status}${tail}`);
  }
}

// ─ 진입점 ────────────────────────────────────────────────────────────────────
// `node cron/push.ts --instance dev` 로 돌 때만 run 을 실행한다.
// vitest 가 import 할 때는 argv[1] 이 테스트 러너 파일이라 발화하지 않는다.
function isCliEntry(): boolean {
  const argv1 = process.argv[1];
  if (typeof argv1 !== 'string' || argv1.length === 0) return false;
  try {
    return fileURLToPath(import.meta.url) === argv1;
  } catch {
    return false;
  }
}

if (isCliEntry()) {
  run({ argv: process.argv.slice(2), env: process.env, nowUtc: new Date() }).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    // stderr → journald. API 키는 err 메시지에 포함되지 않아야 한다 (envValues 는 로그에 안 쓴다).
    console.error(`[cron] error: ${msg}`);
    process.exitCode = 1;
  });
}
