/**
 * 설정 화면 로직 순수 함수 (SPEC4 FR-33, PHASE_4_PLAN).
 *
 * `/settings` 화면이 쓰는 판정·라벨링을 룬·DOM·릴레이에서 분리한 모듈. 저장소에는
 * DOM 컴포넌트 테스트 인프라가 없어 화면 자체를 테스트할 수 없다 — 대신 분기 로직을
 * 여기 모아 단위 테스트로 못박는다 (PHASE_4_PLAN 3단계, PHASE_4_TEST).
 *
 * 문구는 SPEC FR-33.2(a) · FR-33.8 과 글자까지 같다 (NFR-2 「사실만 적는다」).
 */

import type { PushErrorCode, PushState } from './types';

/** dev 릴레이 공개 주소 (FR-33.11). isDevRelay 가 정확 일치로 비교한다. */
const DEV_RELAY_URL = 'https://push-dev.siot-ieung.duckdns.org';

/**
 * `PushState` 를 알림 섹션 상태 문구로 바꾼다 (FR-33.2(a)).
 *
 * 사용자가 볼 글자. 색 하나로 상태를 알리지 않는다 — 이 문자열이 함께 선다 (UI-14).
 * 스크립트 로딩 중에는 「확인 중」 (PHASE_4_PLAN 4단계: 「릴레이 스크립트 로드 중」).
 */
export function stateToLabel(state: PushState): string {
  switch (state) {
    case 'on':
      return '알림 켜짐';
    case 'off':
      return '알림 꺼짐';
    case 'denied':
      return '알림 권한 거부됨 — 브라우저 설정에서 바꿀 수 있습니다';
    case 'unsupported':
      return '이 브라우저에서는 푸시 알림을 쓸 수 없습니다. iPhone 은 홈 화면에 추가한 앱에서만 됩니다';
    case 'loading':
      return '확인 중';
  }
}

/**
 * 릴레이가 던진 오류 code 를 사실 문구로 바꾼다 (FR-33.8, 연동 문서 §2 표).
 *
 * 격려·비난·추측 없음. 사용자가 다음에 할 일이 명확히 보일 때만 적는다.
 */
export function errorToLabel(code: PushErrorCode): string {
  switch (code) {
    case 'denied':
      return '알림 권한이 거부되어 있습니다. 브라우저 설정에서 바꿀 수 있습니다';
    case 'unsupported':
      return '이 브라우저는 푸시 알림을 지원하지 않습니다';
    case 'no-service-worker':
      return '서비스 워커가 등록되지 않아 알림을 켤 수 없습니다';
    case 'origin-not-allowed':
      return '이 주소는 릴레이에 등록되지 않았습니다';
    case 'push-service-not-allowed':
      return '브라우저의 푸시 서비스가 차단되어 있습니다';
    case 'subscribe':
      return '푸시 구독에 실패했습니다';
    case 'network':
      return '네트워크 오류로 릴레이에 닿지 못했습니다';
    case 'server':
      return '릴레이 서버 오류입니다';
  }
}

/**
 * 켜기 버튼 활성 여부 (FR-33.3 · FR-33.7).
 *
 * `off` 이고 프로그램이 선택되어 있을 때만 true. 그 외(이미 켜짐 · denied ·
 * unsupported · loading · 프로그램 미선택)는 모두 false — 「프로그램을 먼저
 * 선택하세요」 안내가 함께 선다 (EC-77).
 */
export function canEnable(state: PushState, hasProgramSelected: boolean): boolean {
  return state === 'off' && hasProgramSelected;
}

/**
 * 끄기 버튼 활성 여부 (FR-33.4). `on` 일 때만 true.
 *
 * `state !== 'on'` 일 때 끄기 버튼은 DOM 에서는 유지되지만 CSS 로 숨긴다 — 하이드레이션
 * 과 포커스 흐름을 보호한다 (CLAUDE.md 접기 규약, PHASE_4_PLAN 4단계).
 */
export function canDisable(state: PushState): boolean {
  return state === 'on';
}

/**
 * 시각 입력 활성 여부 (FR-33.5).
 *
 * `denied` · `unsupported` 를 제외한 모든 상태에서 true — 알림이 꺼져 있어도 사용자가
 * 시각을 미리 바꿔 둘 수 있어야 한다. 다음 켜기에 그 값이 쓰인다.
 */
export function timeInputEnabled(state: PushState): boolean {
  return state !== 'denied' && state !== 'unsupported';
}

/**
 * 테스트 발송 버튼 노출 여부 (FR-33.11).
 *
 * `PUBLIC_PUSH_RELAY_URL` 이 dev 공개 주소와 정확히 같을 때만 true — prod 빌드에서는
 * 아예 보이지 않는다. 비교는 문자열 정확 일치: 끝의 슬래시, 프로토콜 다름 모두 거짓.
 *
 * 호출자는 `$env/static/public` 에서 import 한 `PUBLIC_PUSH_RELAY_URL` 을 그대로 넘긴다.
 */
export function isDevRelay(relayUrl: string): boolean {
  return relayUrl === DEV_RELAY_URL;
}
