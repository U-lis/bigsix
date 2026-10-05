// @vitest-environment happy-dom
//
// `pushAutoSync` — 부팅 뒤 meta 자동 동기화 테스트 (SPEC4 FR-33.6 · FR-34.3 · ADR-35, PHASE_5_PLAN).
//
// 외부 I/O(릴레이 스크립트 · 저장소 · meta 조립)를 전부 목으로 교체해
// 분기 조건과 호출 횟수만 검증한다. `pushAutoSync` 는 모든 예외를 조용히 넘긴다 —
// 다음 부팅 때 다시 시도한다 (FR-33.6).
//
// `sentMeta === null` 가드가 한 번도 켠 적 없는 사용자에게 `client.js` 를 로드하지
// 않도록 막는 것(ADR-35, 참고 절), 그리고 `test` 필드가 비교에서 빠지는 것
// (FR-34.3 · 테스트 발송이 자동 동기화를 트리거하지 않는다)을 함께 못박는다.

import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';

import type { PushMeta, PushRecord } from '../../../src/lib/ui/push/types';

// ── 모듈 목 ──────────────────────────────────────────────────────────────────
// vi.mock 는 호이스팅되므로 아래 변수들은 vi.hoisted 로 공유 상자를 만들어 둔다.

const hoisted = vi.hoisted(() => ({
  loadRelay: vi.fn<() => Promise<void>>(),
  buildMeta: vi.fn<(...a: unknown[]) => PushMeta | null>(),
  readPushRecord: vi.fn<() => PushRecord>(),
  writePushRecord: vi.fn<(r: PushRecord) => void>(),
}));

vi.mock('../../../src/lib/ui/push/relay', () => ({
  loadRelay: hoisted.loadRelay,
}));

vi.mock('../../../src/lib/ui/push/meta', () => ({
  buildMeta: hoisted.buildMeta,
}));

vi.mock('../../../src/lib/ui/push/storage', () => ({
  readPushRecord: hoisted.readPushRecord,
  writePushRecord: hoisted.writePushRecord,
}));

// ── PushRelay 전역 ──────────────────────────────────────────────────────────
//
// 실제 relay `client.js` 는 세 메서드 모두 `async function` 이다 (연동 문서 §2,
// https://push-dev.siot-ieung.duckdns.org/client.js). 과거 이 파일의 `stateMock`
// 은 동기 반환이어서 코드가 `relay.state()` 결과를 await 없이 비교해도 테스트는
// 통과했고, Android PWA 에서만 조용히 깨졌다. 이번 리라이트는 세 mock 를 모두
// Promise 로 되돌리게 해 그 미스매치를 다시 못 숨기도록 한다.

type PushState = 'unsupported' | 'denied' | 'off' | 'on';

const stateMock = vi.fn<() => Promise<PushState>>();
const enableMock = vi.fn<(meta: unknown) => Promise<'on'>>();
const disableMock = vi.fn<() => Promise<'off'>>();

function installRelayGlobal(): void {
  // 테스트에서 매번 새로 심어, 각 테스트가 격리된 호출 기록을 본다.
  (window as unknown as { PushRelay: unknown }).PushRelay = {
    state: async () => stateMock(),
    enable: async (meta: unknown) => enableMock(meta),
    disable: async () => disableMock(),
  };
}

function clearRelayGlobal(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).PushRelay;
}

const BASE_META: PushMeta = {
  v: 1,
  tz: 'Asia/Seoul',
  notifyAt: '19:00',
  program: '모범수',
  days: { 월: ['푸시업'] },
};
const BASE_META_JSON = JSON.stringify(BASE_META);

const RECORD_SENT: PushRecord = { v: 1, notifyAt: '19:00', sentMeta: BASE_META_JSON };
const RECORD_NEVER: PushRecord = { v: 1, notifyAt: '19:00', sentMeta: null };

beforeEach(() => {
  hoisted.loadRelay.mockReset();
  hoisted.buildMeta.mockReset();
  hoisted.readPushRecord.mockReset();
  hoisted.writePushRecord.mockReset();
  stateMock.mockReset();
  enableMock.mockReset();
  disableMock.mockReset();

  // 기본 동작: loadRelay 는 성공, state 는 on, enable 은 성공.
  hoisted.loadRelay.mockResolvedValue(undefined);
  stateMock.mockResolvedValue('on');
  enableMock.mockResolvedValue('on');
  disableMock.mockResolvedValue('off');

  installRelayGlobal();
});

afterEach(() => {
  clearRelayGlobal();
});

describe('pushAutoSync — FR-33.6 / FR-34.3 / ADR-35', () => {
  it('state === "on" 이고 직렬화된 meta 가 sentMeta 와 다르면 enable 을 1회 호출하고 sentMeta 를 갱신한다', async () => {
    // 저장된 sentMeta 는 과거 버전 (program: 모범수) — 지금은 새 프로그램이라고 가정.
    const oldMeta: PushMeta = { ...BASE_META, program: '신입' };
    const oldJson = JSON.stringify(oldMeta);
    hoisted.readPushRecord.mockReturnValue({ v: 1, notifyAt: '19:00', sentMeta: oldJson });
    hoisted.buildMeta.mockReturnValue(BASE_META);

    const { pushAutoSync } = await import('../../../src/lib/ui/push/autoSync');
    await pushAutoSync();

    assert.equal(hoisted.loadRelay.mock.calls.length, 1, 'loadRelay 는 1회 호출된다');
    assert.equal(enableMock.mock.calls.length, 1, 'enable 은 1회 호출된다');
    assert.deepEqual(enableMock.mock.calls[0][0], BASE_META, 'enable 은 새 meta 로 호출된다');
    assert.equal(
      hoisted.writePushRecord.mock.calls.length,
      1,
      'writePushRecord 는 1회 호출된다',
    );
    assert.deepEqual(
      hoisted.writePushRecord.mock.calls[0][0],
      { v: 1, notifyAt: '19:00', sentMeta: BASE_META_JSON },
      'sentMeta 가 새 직렬화 결과로 갱신된다',
    );
  });

  it('state === "on" 이고 직렬화된 meta (base) 가 sentMeta 와 같으면 enable 을 호출하지 않는다', async () => {
    // also covers FR-34.3 — test-field (added by settings page, not by buildMeta) is absent
    // from both buildMeta output and sentMeta comparison, so a prior test send does not trigger re-enable
    hoisted.readPushRecord.mockReturnValue(RECORD_SENT);
    hoisted.buildMeta.mockReturnValue(BASE_META);

    const { pushAutoSync } = await import('../../../src/lib/ui/push/autoSync');
    await pushAutoSync();

    assert.equal(enableMock.mock.calls.length, 0, 'enable 은 호출되지 않는다');
    assert.equal(
      hoisted.writePushRecord.mock.calls.length,
      0,
      'writePushRecord 도 호출되지 않는다 (변경 없음)',
    );
  });

  it.each(['off', 'denied', 'unsupported'] as const)(
    'state === "%s" 이면 enable 을 호출하지 않는다',
    async (s) => {
      hoisted.readPushRecord.mockReturnValue(RECORD_SENT);
      stateMock.mockResolvedValue(s);
      hoisted.buildMeta.mockReturnValue(BASE_META);

      const { pushAutoSync } = await import('../../../src/lib/ui/push/autoSync');
      await pushAutoSync();

      assert.equal(enableMock.mock.calls.length, 0);
      assert.equal(hoisted.writePushRecord.mock.calls.length, 0);
    },
  );

  it('buildMeta 가 null 을 반환하면 (프로그램 미선택) enable 을 호출하지 않는다', async () => {
    hoisted.readPushRecord.mockReturnValue(RECORD_SENT);
    hoisted.buildMeta.mockReturnValue(null);

    const { pushAutoSync } = await import('../../../src/lib/ui/push/autoSync');
    await pushAutoSync();

    assert.equal(enableMock.mock.calls.length, 0);
    assert.equal(hoisted.writePushRecord.mock.calls.length, 0);
  });

  it('enable 이 throw 해도 pushAutoSync 밖으로 예외가 전파되지 않는다 (FR-33.6 무음 처리)', async () => {
    const oldMeta: PushMeta = { ...BASE_META, program: '신입' };
    hoisted.readPushRecord.mockReturnValue({
      v: 1,
      notifyAt: '19:00',
      sentMeta: JSON.stringify(oldMeta),
    });
    hoisted.buildMeta.mockReturnValue(BASE_META);
    enableMock.mockRejectedValue(Object.assign(new Error('network'), { code: 'network' }));

    const { pushAutoSync } = await import('../../../src/lib/ui/push/autoSync');
    await assert.doesNotReject(async () => pushAutoSync());

    assert.equal(enableMock.mock.calls.length, 1, 'enable 은 호출됐지만 throw 됐다');
    assert.equal(
      hoisted.writePushRecord.mock.calls.length,
      0,
      '실패했으므로 sentMeta 는 갱신하지 않는다',
    );
  });

  it('sentMeta === null (한 번도 켠 적 없음) 이면 loadRelay 를 호출하지 않는다', async () => {
    hoisted.readPushRecord.mockReturnValue(RECORD_NEVER);

    const { pushAutoSync } = await import('../../../src/lib/ui/push/autoSync');
    await pushAutoSync();

    assert.equal(hoisted.loadRelay.mock.calls.length, 0, 'loadRelay 는 호출되지 않는다');
    assert.equal(enableMock.mock.calls.length, 0);
    assert.equal(hoisted.buildMeta.mock.calls.length, 0);
  });

  // ── 회귀: 2026-10-03 Android PWA 버그 ───────────────────────────────────────
  // 실제 relay `client.js` 는 `state()` 가 `async function`. 과거 코드는 반환값을
  // `await` 없이 비교했기에 Promise 가 `!== 'on'` 이라 자동 동기화가 조용히 꺼졌다.
  // 이 테스트는 state 를 「느린 Promise」로 돌려줘, 코드가 `await` 를 유지하는지 못박는다.
  // await 가 다시 빠지면 enable 호출 횟수 0 으로 바로 떨어진다.
  it('회귀: state() 가 비동기로만 resolve 돼도 (await 유지) enable 이 1회 호출된다', async () => {
    const oldMeta: PushMeta = { ...BASE_META, program: '신입' };
    const oldJson = JSON.stringify(oldMeta);
    hoisted.readPushRecord.mockReturnValue({ v: 1, notifyAt: '19:00', sentMeta: oldJson });
    hoisted.buildMeta.mockReturnValue(BASE_META);

    // 다음 틱으로 미루는 Promise — 동기 비교(Promise !== 'on') 로는 enable 못 넘긴다.
    stateMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('on'), 0)),
    );

    const { pushAutoSync } = await import('../../../src/lib/ui/push/autoSync');
    await pushAutoSync();

    assert.equal(
      enableMock.mock.calls.length,
      1,
      'state() 비동기 결과를 await 하지 않으면 Promise !== "on" 분기로 빠져 0 이 된다',
    );
  });
});
