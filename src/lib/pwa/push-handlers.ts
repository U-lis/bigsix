/**
 * SW 이벤트 핸들러의 순수 로직 (FR-35 · FR-38).
 *
 * self · workbox · ServiceWorkerGlobalScope 를 참조하지 않아 노드 환경에서
 * 그대로 검증된다. `src/pwa-sw.ts` 의 wire-up 이 이 함수를 부른다.
 */

/** 서버가 `payload.json()` 으로 실어 보내는 페이로드 (Phase 2 서버와 계약). */
export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
}

/**
 * FR-38.1 · 페이로드 → `showNotification` 인자.
 * icon 이 비어 있으면 앱 아이콘(`/icon-192.png`) 을 기본값으로 쓴다.
 */
export function buildNotification(payload: PushPayload): {
  title: string;
  options: NotificationOptions;
} {
  return {
    title: payload.title,
    options: {
      body: payload.body,
      icon: payload.icon ?? '/icon-192.png',
    },
  };
}

/**
 * FR-35 · FR-38.2 · 열려 있는 창 중 앱 origin 을 가진 클라이언트를 고른다.
 * 없으면 `null` 을 돌려 호출자가 새 창을 연다.
 *
 * `WindowClient` 타입은 `lib.webworker.d.ts` 에만 있어 노드 tsconfig 에서 못 본다 —
 * `url` 만 쓰므로 구조적 서브타입으로 받는다.
 */
export function pickTargetClient<C extends { url: string }>(
  clients: readonly C[],
  origin: string,
): C | null {
  return clients.find((c) => new URL(c.url).origin === origin) ?? null;
}
