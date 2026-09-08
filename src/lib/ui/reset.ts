/**
 * 전체 데이터 초기화 (FR-19.4).
 *
 * About 모달의 「전체 데이터 초기화」와 손상 배너의 「초기 상태로 시작」 두
 * 진입점이 이 헬퍼를 공유한다. 라우팅은 호출부가 담당한다.
 */
import { appState } from './state.svelte.ts';
import { inProgress } from './session.svelte.ts';

export function performReset(): void {
  appState.resetToInitial();
  try {
    inProgress.discard();
  } catch {
    // discard 는 이미 clearInProgress 내부에서 try/catch 를 감싸지만 방어.
  }
}

/**
 * 2단계 확인 상태 머신 (FR-19.4).
 * 첫 클릭 → confirming, 두 번째 클릭 → 실행(호출자가 performReset 을 부른다).
 * 모달을 닫으면 idle 로 되돌린다 (EC-47).
 */
export type ResetState = 'idle' | 'confirming';

export function nextResetState(current: ResetState, event: 'click' | 'closeModal'): ResetState {
  if (event === 'closeModal') return 'idle';
  // event === 'click'
  return current === 'idle' ? 'confirming' : 'idle';
}

/**
 * 이번 click 이 실제 실행을 트리거하는지 (두 번째 click 인지).
 * UI 는 이 값이 true 인 시점에만 performReset 을 호출한다.
 */
export function isResetReady(current: ResetState, event: 'click'): boolean {
  return event === 'click' && current === 'confirming';
}
