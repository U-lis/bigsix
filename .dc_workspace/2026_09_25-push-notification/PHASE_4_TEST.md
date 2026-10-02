# Phase 4: 테스트 케이스

## 테스트 커버리지 목표

70% 는 참고 수치다 — 통과 기준이 아니다.

## 검증할 동작

### 화면 로직 순수 함수 (단위, `tests/unit/push/pushUI.test.ts`)

Phase 4 3단계에서 추출한 함수를 테스트한다 — DOM 없음, 릴레이 호출 없음.

- **동작**: `stateToLabel('on')` 이 `'알림 켜짐'` 을 반환한다 | **계층**: 단위
- **동작**: `stateToLabel('off')` 이 `'알림 꺼짐'` 을 반환한다 | **계층**: 단위
- **동작**: `stateToLabel('denied')` 가 SPEC FR-33.2(a) 의 denied 문자열을 정확히 반환한다 | **계층**: 단위
- **동작**: `stateToLabel('unsupported')` 가 SPEC FR-33.2(a) 의 unsupported 문자열을 정확히 반환한다 | **계층**: 단위
- **동작**: `stateToLabel('loading')` 이 `'확인 중'` 을 반환한다 | **계층**: 단위
- **동작**: `canEnable('off', true)` 가 `true` 이고 `canEnable('off', false)` 가 `false` 이다 | **계층**: 단위
- **동작**: `canEnable('on', true)` 가 `false` 이다 | **계층**: 단위
- **동작**: `canDisable('on')` 이 `true` 이고 `canDisable('off')` 가 `false` 이다 | **계층**: 단위
- **동작**: `timeInputEnabled('denied')` 가 `false` 이다 | **계층**: 단위
- **동작**: `timeInputEnabled('unsupported')` 가 `false` 이다 | **계층**: 단위
- **동작**: `timeInputEnabled('off')` 가 `true` 이다 | **계층**: 단위
- **동작**: `errorToLabel` 이 `PushErrorCode` 에 정의된 8종 코드 각각에 대해 비어 있지 않은 고유한 문자열을 반환한다 | **계층**: 단위
- **동작**: `isDevRelay('https://push-dev.siot-ieung.duckdns.org')` 가 `true` 이다 | **계층**: 단위
- **동작**: `isDevRelay('https://push.siot-ieung.duckdns.org')` 가 `false` 이다 | **계층**: 단위
- **동작**: `isDevRelay('')` 가 `false` 이다 | **계층**: 단위

### 초기화 연동 (단위, `tests/unit/push/reset.test.ts`)

파일 첫 줄: `// @vitest-environment happy-dom`

- **동작**: `performReset()` 실행 후 `localStorage.getItem('bigsix.push')` 가 `null` 이다 | **계층**: 단위

## 이 페이즈에 실제로 해당하는 엣지 케이스

- EC-77: `hasProgramSelected` 가 false 이면 `PushState` 에 상관없이 `canEnable` 이 false 를 반환한다.
- EC-74 · EC-76: `stateToLabel` 이 `denied` · `unsupported` 에 대해 올바른 안내 문자열을 반환한다.
