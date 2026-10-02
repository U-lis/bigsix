/**
 * 릴레이 `client.js` 로더 · 해제 헬퍼 (SPEC4 FR-32.3 · ADR-33 · PHASE_4_PLAN 2단계).
 *
 * 릴레이 `client.js` 는 로드되면 전역 `window.PushRelay` 를 노출한다 — API 는
 * `state()` · `enable(meta)` · `disable()` 셋. `app.html` 에 넣지 않고(첫 화면 ·
 * 오프라인 진입이 릴레이에 묶이지 않도록, NFR-35) 설정 화면 진입과 autoSync 가
 * 필요할 때 `loadRelay()` 로 한 번만 붙여 캐시한다.
 *
 * 두 함수 다 throw 하지 않는 걸 지향한다. `loadRelay` 는 `script` 태그의 `error`
 * 이벤트에서 reject 하지만 호출자가 그 reject 를 받아 사용자에게 사실 문구로 바꾼다
 * (FR-33.8). `teardownPush` 는 전체 초기화 흐름의 선행 단계이므로 조용히 삼킨다.
 */

import { PUBLIC_PUSH_RELAY_URL } from '$env/static/public';

/**
 * 릴레이 `client.js` 의 전역 API. 로드 뒤 `window.PushRelay` 로 노출된다.
 *
 * `state()` 반환값 — `'unsupported' | 'denied' | 'off' | 'on'` (연동 문서 §2).
 * UI 가 보는 `PushState` 는 여기에 로딩 중을 뜻하는 `'loading'` 을 더한 것이다.
 *
 * `enable(meta)` 는 사용자 제스처(IR-3) 또는 이미 `granted` 인 환경에서 호출한다.
 * 오류는 `Error.code` 로 구분 (`PushErrorCode`).
 */
export interface PushRelayGlobal {
  state(): 'unsupported' | 'denied' | 'off' | 'on';
  enable(meta: unknown): Promise<void>;
  disable(): Promise<void>;
}

declare global {
  interface Window {
    PushRelay?: PushRelayGlobal;
  }
}

/** `script` 태그의 `id` — 중복 삽입 방지 (`loadRelay` 가 캐시된 Promise 를 돌려주지만
 * 혹시 DOM 쪽 유실에 대비). */
const SCRIPT_ID = 'push-relay-client';

/**
 * loadRelay 가 두 번째 이후 호출에서 돌려줄 캐시 Promise. 모듈 레벨 변수로 둔다 —
 * 같은 세션에서 설정 화면·autoSync 가 둘 다 부르더라도 스크립트는 한 번만 붙는다.
 */
let cached: Promise<void> | null = null;

/**
 * `<script src="…/client.js">` 를 `document.head` 에 추가하고 `load` 를 기다린다.
 *
 * 두 번째 이후 호출은 같은 Promise 를 돌려준다 — 네트워크 재접속·중복 호출로 스크립트가
 * 여러 번 붙지 않는다. `error` 이벤트에서는 reject 하면서 캐시를 비우고 실패한
 * `<script>` 를 떼어낸다 — 네트워크가 돌아온 뒤 다시 누르면 새로 불러온다.
 */
export function loadRelay(): Promise<void> {
  if (cached !== null) return cached;

  cached = new Promise<void>((resolve, reject) => {
    // 이미 전역이 떠 있으면(이론상 app.html 이 아니라도) 즉시 해결한다.
    if (typeof window !== 'undefined' && window.PushRelay !== undefined) {
      resolve();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID);
    if (existing instanceof HTMLScriptElement) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          cached = null;
          existing.remove();
          reject(new Error('push-relay client script failed to load'));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `${PUBLIC_PUSH_RELAY_URL}/client.js`;
    script.async = true;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener(
      'error',
      () => {
        cached = null;
        script.remove();
        reject(new Error('push-relay client script failed to load'));
      },
      { once: true },
    );
    document.head.appendChild(script);
  });

  return cached;
}

/**
 * 알림이 켜져 있으면 끈다 — 「전체 초기화」(FR-33.10 · ADR-36) 의 선행 단계.
 *
 * 릴레이 클라이언트가 아직 로드되지 않았으면 바로 반환한다 — 켠 적이 없는 사용자가
 * 초기화할 때 괜히 네트워크를 때릴 이유가 없다. 로드돼 있고 `state() === 'on'` 이면
 * `disable()` 를 호출한다. 오류는 삼킨다 — 초기화는 다음에 할 일이 있다.
 */
export async function teardownPush(): Promise<void> {
  if (typeof window === 'undefined') return;
  const relay = window.PushRelay;
  if (relay === undefined) return;
  try {
    if (relay.state() === 'on') {
      await relay.disable();
    }
  } catch {
    // 초기화 흐름이 끊기지 않게 조용히 넘긴다.
  }
}
