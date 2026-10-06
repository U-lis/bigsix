// @vitest-environment happy-dom
//
// relay.ts — loadRelay 캐시 초기화 테스트 (SPEC4 ADR-33 · PHASE_4_PLAN 2단계).
//
// loadRelay() 가 스크립트 로드 실패 후 캐시를 비워 재시도를 가능하게 하는지 검증한다.
//
// happy-dom 20 은 document.head.appendChild(<script>) 호출 시 "JavaScript file loading
// is disabled" 오류를 동기로 발화한다. 이 동기 발화는 new Promise(executor) 구성 도중에
// 일어나므로 error 핸들러의 `cached = null` 이 outer `cached = new Promise(...)` 할당에
// 덮어쓰여진다 — 실제 브라우저의 비동기 네트워크 실패와는 다른 흐름이다.
// 테스트는 vi.spyOn(document.head, 'appendChild') 로 real DOM 삽입을 막아 이 자동 발화를
// 방지한 뒤, 이벤트를 수동으로 발화한다.

import { describe, it, beforeEach, vi } from 'vitest';
import assert from 'node:assert/strict';

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  document.head.innerHTML = '';
  // window.PushRelay 가 있으면 즉시 resolve 되므로 제거
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).PushRelay;
});

describe('loadRelay — 실패 후 재시도', () => {
  it('스크립트 error 이벤트 후 캐시가 비워져 두 번째 호출이 새 Promise 를 반환한다', async () => {
    // happy-dom 의 동기 error 발화를 막기 위해 appendChild 를 가로챈다.
    // script 요소는 appendedScripts 배열에 보관되고 실제 DOM 에는 삽입되지 않는다.
    const appendedScripts: HTMLScriptElement[] = [];
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node): Node => {
      if (node instanceof HTMLScriptElement) {
        appendedScripts.push(node);
      }
      return node;
    });

    const { loadRelay } = await import('../../../src/lib/ui/push/relay');

    // ── 1차 호출 ──────────────────────────────────────────────────────────────
    const p1 = loadRelay();
    assert.equal(appendedScripts.length, 1, '1차 호출에서 script 가 한 번 append 돼야 한다');
    const script1 = appendedScripts[0];

    // error 이벤트를 수동 발화 → p1 reject
    script1.dispatchEvent(new Event('error'));
    await assert.rejects(async () => p1, /failed to load/);

    // ── 재시도 확인 ────────────────────────────────────────────────────────────
    // 캐시가 비워졌으면 두 번째 호출은 새 Promise 를 만들고 새 script 를 append 해야 한다.
    // 캐시가 유지됐다면 p1 == p2 이고 appendedScripts.length 는 여전히 1 이다.
    const p2 = loadRelay();
    assert.ok(p1 !== p2, '두 번째 호출은 새 Promise 를 반환해야 한다 (캐시가 비워졌음)');
    assert.equal(appendedScripts.length, 2, '두 번째 호출에서 script 가 다시 append 돼야 한다');

    // load 이벤트 발화 → p2 resolve
    const script2 = appendedScripts[1];
    script2.dispatchEvent(new Event('load'));
    await p2; // throw 하면 테스트 실패
  });
});
