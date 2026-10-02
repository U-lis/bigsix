// `cron/push.ts` 진입점 테스트 — fetch 를 mock 해 흐름을 확인한다
// (SPEC FR-35.1, FR-35.2, FR-35.4, FR-35.5, FR-35.8).
//
// 로그는 silent 로 수집한다 — stdout 을 더럽히지 않는다. prod 인스턴스는
// `meta.test` 를 읽지 않는지(FR-35.8 뒷문 금지) 가 핵심.

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { parseInstance, run } from '../../../cron/push.ts';
import type { Fetcher } from '../../../cron/push.ts';
import type { SubscriptionItem } from '../../../cron/decide.ts';

const ENV = {
  PUSH_RELAY_API: 'http://127.0.0.1:8793',
  PUSH_RELAY_KEY: 'prk_test',
} as NodeJS.ProcessEnv;

const APP = 'https://bigsix.siot-ieung.duckdns.org';

const SEOUL = {
  v: 1 as const,
  tz: 'Asia/Seoul',
  notifyAt: '19:00',
  program: '모범수',
  days: { 월: ['푸시업', '레그 레이즈'] },
};

/** Seoul Mon 19:00 (운동일 · 발송 창 안). */
const MON_1900_UTC = new Date('2026-10-05T10:00:00Z');

interface Call {
  url: string;
  method: string;
  body?: string;
  headers: Record<string, string>;
}

/** `init` 의 headers 를 평평한 object 로 뽑는다. */
function toPlainHeaders(init: RequestInit | undefined): Record<string, string> {
  const h: Record<string, string> = {};
  const raw = init?.headers;
  if (!raw) return h;
  if (raw instanceof Headers) {
    raw.forEach((v, k) => { h[k.toLowerCase()] = v; });
  } else if (Array.isArray(raw)) {
    for (const [k, v] of raw) h[k.toLowerCase()] = v;
  } else {
    for (const [k, v] of Object.entries(raw as Record<string, string>)) {
      h[k.toLowerCase()] = v;
    }
  }
  return h;
}

/**
 * fetch 를 흉내 낸다. 호출 기록을 쌓고, URL 패턴별로 응답을 돌려준다.
 *
 * - GET /v1/subscriptions[?after=X] → 페이지 응답
 * - POST /v1/send → sendResponse
 */
function makeFetchMock(pages: Array<{ items: SubscriptionItem[]; next: string | null }>, sendResponse: unknown): { fetchFn: Fetcher; calls: Call[] } {
  const calls: Call[] = [];
  let pageIdx = 0;
  const fetchFn: Fetcher = async (input, init) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? init.body : undefined;
    const headers = toPlainHeaders(init);
    calls.push({ url, method, body, headers });

    if (url.includes('/v1/subscriptions')) {
      const page = pages[pageIdx] ?? { items: [], next: null };
      pageIdx += 1;
      return new Response(JSON.stringify(page), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.endsWith('/v1/send')) {
      return new Response(JSON.stringify(sendResponse), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  };
  return { fetchFn, calls };
}

function silentLogger() {
  return { log: () => {}, error: () => {} };
}

function sub(id: string, meta: unknown): SubscriptionItem {
  return {
    id,
    meta,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('parseInstance', () => {
  it('--instance dev 를 "dev" 로 해석', () => {
    assert.equal(parseInstance(['--instance', 'dev']), 'dev');
  });

  it('--instance prod 를 "prod" 로 해석', () => {
    assert.equal(parseInstance(['--instance', 'prod']), 'prod');
  });

  it('인자가 없으면 "prod"', () => {
    assert.equal(parseInstance([]), 'prod');
  });

  it('--instance 뒤에 모르는 값이면 "prod" (안전 기본)', () => {
    assert.equal(parseInstance(['--instance', 'xyzzy']), 'prod');
    assert.equal(parseInstance(['--instance']), 'prod');
  });
});

describe('run — 페이지네이션 (FR-35.2-1)', () => {
  it('next 가 null 이 아니면 ?after=<next> 로 이어 받고, null 이 되면 멈춘다', async () => {
    const items1 = [sub('s_page1', SEOUL)];
    const items2 = [sub('s_page2', SEOUL)];
    const { fetchFn, calls } = makeFetchMock(
      [
        { items: items1, next: 'cursor_abc' },
        { items: items2, next: null },
      ],
      { requestId: 'bigsix-xxx', results: [{ to: 's_page1', status: 'sent' }, { to: 's_page2', status: 'sent' }], summary: {} },
    );

    await run({
      argv: ['--instance', 'prod'],
      env: ENV,
      nowUtc: MON_1900_UTC,
      fetchFn,
      logger: silentLogger(),
      appBaseUrl: APP,
    });

    // 두 번 subscriptions 호출
    const subsCalls = calls.filter((c) => c.url.includes('/v1/subscriptions'));
    assert.equal(subsCalls.length, 2, 'two subscriptions fetches');
    assert.ok(!subsCalls[0].url.includes('after='), 'first call has no after');
    assert.ok(subsCalls[1].url.includes('after=cursor_abc'), 'second call carries cursor');
  });
});

describe('run — 0건 때 send 미호출 (FR-35.2-4)', () => {
  it('filterSubscriptions 가 0건이면 /v1/send 를 호출하지 않는다', async () => {
    // 모든 구독이 Tuesday (휴식일) 라 보낼 것이 없다
    const items = [sub('s_tue', { ...SEOUL, days: { 화: ['푸시업'] } })];
    const { fetchFn, calls } = makeFetchMock(
      [{ items, next: null }],
      { requestId: 'x', results: [], summary: {} },
    );

    await run({
      argv: ['--instance', 'prod'],
      env: ENV,
      nowUtc: MON_1900_UTC,
      fetchFn,
      logger: silentLogger(),
      appBaseUrl: APP,
    });

    const sendCalls = calls.filter((c) => c.url.endsWith('/v1/send'));
    assert.equal(sendCalls.length, 0, 'no /v1/send call when nothing to send');
  });
});

describe('run — prod 는 meta.test 를 읽지 않는다 (FR-35.8)', () => {
  it('prod 인스턴스: 발송 창 밖 구독의 meta.test 는 테스트 메시지로 가지 않는다', async () => {
    // 화요일 (휴식일) 구독에 meta.test 를 심어 둔다 — dev 라면 테스트 발송이 돼야 하지만 prod 는 무시
    const items = [sub('s_tue', { ...SEOUL, days: { 화: ['푸시업'] }, test: '2026-10-05T09:59:00Z' })];
    const { fetchFn, calls } = makeFetchMock(
      [{ items, next: null }],
      { requestId: 'x', results: [], summary: {} },
    );

    await run({
      argv: ['--instance', 'prod'],
      env: ENV,
      nowUtc: MON_1900_UTC,
      fetchFn,
      logger: silentLogger(),
      appBaseUrl: APP,
    });

    const sendCalls = calls.filter((c) => c.url.endsWith('/v1/send'));
    assert.equal(sendCalls.length, 0, 'prod should not fire test send');
  });

  it('dev 인스턴스: 같은 구독에서 테스트 메시지 1건이 발송된다', async () => {
    const items = [sub('s_tue', { ...SEOUL, days: { 화: ['푸시업'] }, test: '2026-10-05T09:59:00Z' })];
    const { fetchFn, calls } = makeFetchMock(
      [{ items, next: null }],
      { requestId: 'x', results: [{ to: 's_tue', status: 'sent' }], summary: {} },
    );

    await run({
      argv: ['--instance', 'dev'],
      env: ENV,
      nowUtc: MON_1900_UTC,
      fetchFn,
      logger: silentLogger(),
      appBaseUrl: APP,
    });

    const sendCalls = calls.filter((c) => c.url.endsWith('/v1/send'));
    assert.equal(sendCalls.length, 1, 'dev fires test send');
    assert.ok(sendCalls[0].body);
    const payload = JSON.parse(sendCalls[0].body!) as { requestId: string; messages: Array<{ to: string; dedupKey: string }> };
    assert.equal(payload.messages.length, 1);
    assert.equal(payload.messages[0].to, 's_tue');
    assert.ok(payload.messages[0].dedupKey.startsWith('test-'));
  });
});

describe('run — Authorization 헤더에 Bearer 키가 실린다', () => {
  it('subscriptions 호출과 send 호출 모두 Authorization: Bearer <key>', async () => {
    const items = [sub('s_mon', SEOUL)];
    const { fetchFn, calls } = makeFetchMock(
      [{ items, next: null }],
      { requestId: 'x', results: [{ to: 's_mon', status: 'sent' }], summary: {} },
    );

    await run({
      argv: ['--instance', 'prod'],
      env: ENV,
      nowUtc: MON_1900_UTC,
      fetchFn,
      logger: silentLogger(),
      appBaseUrl: APP,
    });

    for (const c of calls) {
      assert.equal(c.headers['authorization'], 'Bearer prk_test');
    }
  });
});

describe('run — 발송 요청 본문이 릴레이 스키마에 맞는다 (push-relay/schema/cron-v1/send-request.json)', () => {
  it('requestId · messages 두 필드가 있고 to · notification · dedupKey 가 메시지마다 들어 있다', async () => {
    const items = [sub('s_mon______________AAAAA', SEOUL)];
    const { fetchFn, calls } = makeFetchMock(
      [{ items, next: null }],
      { requestId: 'x', results: [{ to: 's_mon______________AAAAA', status: 'sent' }], summary: {} },
    );

    await run({
      argv: ['--instance', 'prod'],
      env: ENV,
      nowUtc: MON_1900_UTC,
      fetchFn,
      logger: silentLogger(),
      appBaseUrl: APP,
    });

    const sendCall = calls.find((c) => c.url.endsWith('/v1/send'));
    assert.ok(sendCall);
    const body = JSON.parse(sendCall!.body!) as {
      requestId: string;
      messages: Array<{ to: string; notification: { title: string; body: string; url: string; tag: string; icon: string }; dedupKey: string }>;
    };
    assert.match(body.requestId, /^bigsix-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}-[0-9a-f]{4,}$/);
    assert.equal(body.messages.length, 1);
    const m = body.messages[0];
    assert.equal(m.to, 's_mon______________AAAAA');
  });
});
