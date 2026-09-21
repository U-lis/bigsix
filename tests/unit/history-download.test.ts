// @vitest-environment happy-dom
//
// 파일 저장 얇은 층 (FR-26.5 · EC-61 · RISK-5).
//
// happy-dom 은 `Blob`, `URL.createObjectURL`, `document.createElement('a')`,
// `document.body.appendChild` 를 모두 갖추고 있다. 다만 `navigator.canShare`
// 와 `navigator.share` 는 기본 제공되지 않아 필요 시 우리가 심는다.

import { afterEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';

import { saveFile } from '../../src/lib/ui/history/download.svelte.ts';

// ── 공통 유틸 ─────────────────────────────────────────────────────────────

/** navigator 위에 스텁을 얹어놓고 테스트가 끝나면 되돌린다. */
function stubNavigator(patch: Partial<Navigator & {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
}>): () => void {
  const saved: Record<string, unknown> = {};
  for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
    // navigator 는 프로토타입 프로퍼티가 대부분이라 defineProperty 로 얹는다.
    saved[k] = (navigator as unknown as Record<string, unknown>)[k];
    Object.defineProperty(navigator, k, {
      value: patch[k],
      configurable: true,
      writable: true,
    });
  }
  return () => {
    for (const k of Object.keys(saved)) {
      Object.defineProperty(navigator, k, {
        value: saved[k],
        configurable: true,
        writable: true,
      });
    }
  };
}

afterEach(() => {
  // 각 테스트가 스텁을 되돌린다. safety net.
  vi.restoreAllMocks();
});

// ── 1) <a download> 성공 → 'downloaded' ─────────────────────────────────────

describe('saveFile — <a download> 성공', () => {
  it('URL.createObjectURL 이 호출되고 결과가 "downloaded"', async () => {
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock/xyz');
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    // <a>.click() 은 happy-dom 이 no-op 으로 처리한다 (예외 없음).
    const result = await saveFile({
      name: 'bigsix-2026-09-18.json',
      mime: 'application/json',
      content: '{"a":1}',
    });

    assert.equal(result, 'downloaded');
    assert.equal(created.mock.calls.length, 1);
    assert.equal(revoked.mock.calls.length, 1);
    assert.equal(revoked.mock.calls[0][0], 'blob:mock/xyz');
  });

  it('<a> 요소가 body 에서 다시 제거된다 (누수 없음)', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock/abc');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const before = document.body.querySelectorAll('a').length;
    await saveFile({
      name: 'x.csv',
      mime: 'text/csv;charset=utf-8',
      content: 'a\r\n',
    });
    const after = document.body.querySelectorAll('a').length;
    assert.equal(after, before);
  });

  it('<a>.click 에서 예외가 나도 revoke 는 호출된다 (finally)', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock/err');
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    // HTMLAnchorElement.prototype.click 을 던지도록 스파이.
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      throw new Error('boom');
    };
    try {
      // Web Share 가 없는 상태에서 <a> 가 예외를 던지면 최종 결과는 'unavailable'.
      const restoreNav = stubNavigator({
        share: undefined as unknown as Navigator['share'],
        canShare: undefined as unknown as (d: ShareData) => boolean,
      });
      const result = await saveFile({
        name: 'x.json',
        mime: 'application/json',
        content: '{}',
      });
      restoreNav();
      // 예외 → 다음 단계(Share) 도 없음 → 'unavailable'.
      assert.equal(result, 'unavailable');
      assert.equal(revoked.mock.calls.length, 1);
    } finally {
      HTMLAnchorElement.prototype.click = orig;
    }
  });
});

// ── 2) <a download> 실패 · Share 성공 → 'shared' ─────────────────────────────

describe('saveFile — Web Share API fallback', () => {
  it('Blob 생성 실패 시 canShare/share 로 넘어가 "shared"', async () => {
    // Blob 생성자 자체를 던지게 만든다.
    const OriginalBlob = globalThis.Blob;
    class ExplodingBlob {
      constructor() { throw new Error('no blob'); }
    }
    (globalThis as unknown as { Blob: typeof Blob }).Blob = ExplodingBlob as unknown as typeof Blob;

    const shareCalls: ShareData[] = [];
    const restoreNav = stubNavigator({
      canShare: (data: ShareData) => {
        // files 지원이면 true 를 돌려준다.
        return Array.isArray(data.files) && data.files.length > 0;
      },
      share: async (data: ShareData) => {
        shareCalls.push(data);
      },
    });

    try {
      const result = await saveFile({
        name: 'bigsix-2026-09-18.csv',
        mime: 'text/csv;charset=utf-8',
        content: 'a\r\n',
      });
      assert.equal(result, 'shared');
      assert.equal(shareCalls.length, 1);
    } finally {
      (globalThis as unknown as { Blob: typeof Blob }).Blob = OriginalBlob;
      restoreNav();
    }
  });

  it('canShare 가 false 를 돌려주면 shared 로 가지 않는다', async () => {
    // Blob 생성자를 던지게 해서 <a download> 를 배제.
    const OriginalBlob = globalThis.Blob;
    class ExplodingBlob {
      constructor() { throw new Error('no blob'); }
    }
    (globalThis as unknown as { Blob: typeof Blob }).Blob = ExplodingBlob as unknown as typeof Blob;

    const shareSpy = vi.fn(async () => {});
    const restoreNav = stubNavigator({
      canShare: () => false,
      share: shareSpy,
    });
    try {
      const result = await saveFile({
        name: 'x.json',
        mime: 'application/json',
        content: '{}',
      });
      assert.equal(result, 'unavailable');
      assert.equal(shareSpy.mock.calls.length, 0);
    } finally {
      (globalThis as unknown as { Blob: typeof Blob }).Blob = OriginalBlob;
      restoreNav();
    }
  });
});

// ── 3) 둘 다 실패 → 'unavailable' ──────────────────────────────────────────

describe('saveFile — 둘 다 실패 (EC-61)', () => {
  it('Blob 도 안 되고 Web Share 도 없으면 "unavailable"', async () => {
    const OriginalBlob = globalThis.Blob;
    class ExplodingBlob {
      constructor() { throw new Error('no blob'); }
    }
    (globalThis as unknown as { Blob: typeof Blob }).Blob = ExplodingBlob as unknown as typeof Blob;

    const restoreNav = stubNavigator({
      canShare: undefined as unknown as (d: ShareData) => boolean,
      share: undefined as unknown as Navigator['share'],
    });

    try {
      const result = await saveFile({
        name: 'x.json',
        mime: 'application/json',
        content: '{}',
      });
      assert.equal(result, 'unavailable');
    } finally {
      (globalThis as unknown as { Blob: typeof Blob }).Blob = OriginalBlob;
      restoreNav();
    }
  });

  it('navigator.share 가 예외를 던지면 shared 로 확정되지 않는다', async () => {
    const OriginalBlob = globalThis.Blob;
    class ExplodingBlob {
      constructor() { throw new Error('no blob'); }
    }
    (globalThis as unknown as { Blob: typeof Blob }).Blob = ExplodingBlob as unknown as typeof Blob;

    const restoreNav = stubNavigator({
      canShare: () => true,
      share: async () => { throw new Error('user aborted'); },
    });

    try {
      const result = await saveFile({
        name: 'x.json',
        mime: 'application/json',
        content: '{}',
      });
      // 예외 → 다음 단계 없음 → 'unavailable'.
      assert.equal(result, 'unavailable');
    } finally {
      (globalThis as unknown as { Blob: typeof Blob }).Blob = OriginalBlob;
      restoreNav();
    }
  });
});
