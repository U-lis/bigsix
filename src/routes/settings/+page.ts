/**
 * `/settings` 는 정적 프리렌더 대상 (SPEC4 FR-33.1).
 *
 * 서버가 없다 — adapter-static 이 빌드 시점에 HTML 로 떨어뜨린다. 알림 섹션의
 * 실제 상태(`PushRelay.state()`) 는 클라이언트 마운트 뒤에 채워진다.
 */
export const prerender = true;
