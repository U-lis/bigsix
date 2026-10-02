/**
 * 부팅 뒤 meta 자동 동기화 (SPEC4 FR-33.6 · FR-34.3 · ADR-35).
 *
 * `+layout.svelte` 가 `onMount` 안에서 `boot()` 뒤 `queueMicrotask(() => pushAutoSync())`
 * 로 부른다. 프로그램 전환 · 수동 전환 · 전환 제안 승인 · 종목 잠금 해제 · 타임존
 * 변경이 모두 「직렬화된 base meta 가 달라졌다」 한 규칙으로 잡힌다 — 호출 지점마다
 * 훅을 박지 않는다 (FR-33.6).
 *
 * 설계 포인트
 * - `pushRecord.sentMeta === null` 이면 즉시 반환해 relay `client.js` 를 로드하지
 *   않는다 — 한 번도 켠 적 없는 사용자에게 네트워크를 때릴 이유가 없다 (ADR-35).
 * - 변경 감지는 **base meta (test 필드 제외)** 의 `JSON.stringify` 비교다. `buildMeta`
 *   가 애초에 `test` 를 넣지 않으므로 테스트 발송(FR-33.11) 이 자동 동기화를 트리거
 *   하지 않는다 (FR-34.3).
 * - 모든 예외를 조용히 넘긴다 (FR-33.6) — 네트워크 오류 등은 다음 부팅 때 재시도한다.
 * - relay `client.js` 는 `Notification.permission === 'granted'` 상태에서 제스처 밖
 *   `enable` 을 호출해도 `requestPermission` 을 다시 띄우지 않는다 (ADR-35 근거).
 */

import { loadCatalog } from '$lib/data/catalog';
import { appState } from '$lib/ui/state/state.svelte';

import { buildMeta } from './meta';
import { loadRelay } from './relay';
import { readPushRecord, writePushRecord } from './storage';

/**
 * meta 자동 동기화. 외부로 던지지 않는다 (FR-33.6 무음 처리).
 *
 * 호출 지점은 `+layout.svelte` 하나뿐이다 — `boot()` 완료 뒤 `queueMicrotask` 안에서.
 * 테스트는 외부 I/O(릴레이 · 저장소 · meta 조립)를 목으로 교체한다.
 */
export async function pushAutoSync(): Promise<void> {
  const record = readPushRecord();
  // 한 번도 켠 적 없으면 relay 스크립트 자체를 로드하지 않는다 (ADR-35, 참고 절).
  if (record.sentMeta === null) return;

  try {
    await loadRelay();
    const relay = typeof window !== 'undefined' ? window.PushRelay : undefined;
    if (relay === undefined) return;
    if (relay.state() !== 'on') return;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const meta = buildMeta(appState.value, loadCatalog(), tz, record.notifyAt);
    if (meta === null) return;

    const newMeta = JSON.stringify(meta);
    // base meta 가 그대로이면 재등록 없음 — test 발송은 buildMeta 결과에 반영되지
    // 않으므로 FR-34.3 비교 조건을 자연스럽게 만족한다.
    if (newMeta === record.sentMeta) return;

    await relay.enable(meta);
    writePushRecord({ ...record, sentMeta: newMeta });
  } catch {
    // FR-33.6: 동기화 실패는 무음 처리. 다음 부팅 때 다시 시도한다.
  }
}
