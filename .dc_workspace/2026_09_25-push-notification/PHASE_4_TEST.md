# Phase 4: 테스트 케이스

## 테스트 커버리지 목표

70% 는 참고 수치다 — 통과 기준이 아니다.

## 검증할 동작

### 화면 로직 순수 함수 (단위, `tests/unit/push/pushUI.test.ts`)

Phase 4 3단계에서 추출한 함수를 테스트한다 — DOM 없음, 릴레이 호출 없음.

- **동작**: `stateToLabel('on')` 이 `'알림 켜짐'` 을 반환한다 | **계층**: 단위 | [x] PASS
- **동작**: `stateToLabel('off')` 이 `'알림 꺼짐'` 을 반환한다 | **계층**: 단위 | [x] PASS
- **동작**: `stateToLabel('denied')` 가 SPEC FR-33.2(a) 의 denied 문자열을 정확히 반환한다 | **계층**: 단위 | [x] PASS
- **동작**: `stateToLabel('unsupported')` 가 SPEC FR-33.2(a) 의 unsupported 문자열을 정확히 반환한다 | **계층**: 단위 | [x] PASS
- **동작**: `stateToLabel('loading')` 이 `'확인 중'` 을 반환한다 | **계층**: 단위 | [x] PASS
- **동작**: `canEnable('off', true)` 가 `true` 이고 `canEnable('off', false)` 가 `false` 이다 | **계층**: 단위 | [x] PASS
- **동작**: `canEnable('on', true)` 가 `false` 이다 | **계층**: 단위 | [x] PASS
- **동작**: `canDisable('on')` 이 `true` 이고 `canDisable('off')` 가 `false` 이다 | **계층**: 단위 | [x] PASS
- **동작**: `timeInputEnabled('denied')` 가 `false` 이다 | **계층**: 단위 | [x] PASS
- **동작**: `timeInputEnabled('unsupported')` 가 `false` 이다 | **계층**: 단위 | [x] PASS
- **동작**: `timeInputEnabled('off')` 가 `true` 이다 | **계층**: 단위 | [x] PASS
- **동작**: `errorToLabel` 이 `PushErrorCode` 에 정의된 8종 코드 각각에 대해 비어 있지 않은 고유한 문자열을 반환한다 | **계층**: 단위 | [x] PASS
- **동작**: `isDevRelay('https://push-dev.siot-ieung.duckdns.org')` 가 `true` 이다 | **계층**: 단위 | [x] PASS
- **동작**: `isDevRelay('https://push.siot-ieung.duckdns.org')` 가 `false` 이다 | **계층**: 단위 | [x] PASS
- **동작**: `isDevRelay('')` 가 `false` 이다 | **계층**: 단위 | [x] PASS

### 초기화 연동 (단위, `tests/unit/push/reset.test.ts`)

파일 첫 줄: `// @vitest-environment happy-dom`

- **동작**: `performReset()` 실행 후 `localStorage.getItem('bigsix.push')` 가 `null` 이다 | **계층**: 단위 | [x] PASS

### relay.ts 재시도 동작 (단위, `tests/unit/push/relay.test.ts`)

파일 첫 줄: `// @vitest-environment happy-dom`

- **동작**: `loadRelay()` 스크립트 error 이벤트 후 캐시가 비워져 두 번째 호출이 새 Promise 를 반환한다 | **계층**: 단위 | [x] PASS

### relay.ts teardownPush · 설정 화면 async 회귀 (단위, 2026-10-03 실기기 확인)

- [x] **동작**: `teardownPush` — `PushRelay` 전역이 없으면 즉시 반환한다 | **계층**: 단위 (`tests/unit/push/teardownPush.test.ts`) — PASS
- [x] **동작**: `teardownPush` — `state() === 'on'` 이면 `disable()` 을 1회 호출한다 | **계층**: 단위 — PASS
- [x] **동작**: `teardownPush` — `state()` 가 비동기로만 resolve 돼도 `await` 를 유지하면 `disable` 이 호출된다 (async/sync 미스매치 회귀 못박기) | **계층**: 단위 — PASS
- [x] **동작**: `teardownPush` — `state()` 또는 `disable()` 가 reject 해도 밖으로 던지지 않는다 | **계층**: 단위 — PASS
- [x] **동작**: `/settings refreshState` — `state()` 를 `await` 로 받으면 `'off'` 가 들어와 프로그램 선택 상태에서 「알림 켜기」가 활성화된다 | **계층**: 단위 (`tests/unit/push/settingsFlow.test.ts`) — PASS
- [x] **동작**: `/settings refreshState` — `await` 를 빠뜨리면 `pushState` 가 Promise 가 돼 `canEnable` 이 영원히 false 임을 명시적으로 못박는다 (회귀 테스트) | **계층**: 단위 — PASS

## 실기기 확인에서 발견된 결함 (2026-10-03 Android PWA)

1. **`teardownPush` async 미스매치** — `PushRelayGlobal.state()` 가 동기로 타입돼 있어, `relay.state() === 'on'` 비교가 Promise 와 문자열 비교가 되어 항상 false 였다. 전체 초기화에서 릴레이 구독이 끊기지 않았다. 수정: `state()` 를 `Promise` 반환으로 타입, `teardownPush` 에 `await` 추가.
2. **`/settings` 「알림 켜기」 영원히 비활성** — `refreshState` 가 `relay.state()` 결과를 `await` 없이 `pushState` 에 담아, `canEnable(Promise, ...)` 가 항상 false 였다. 수정: `pushState = await relay.state()` 로 수정. 새 회귀 테스트(`settingsFlow.test.ts`)가 이 경로를 못박는다.

## 이 페이즈에 실제로 해당하는 엣지 케이스

- EC-77: `hasProgramSelected` 가 false 이면 `PushState` 에 상관없이 `canEnable` 이 false 를 반환한다.
- EC-74 · EC-76: `stateToLabel` 이 `denied` · `unsupported` 에 대해 올바른 안내 문자열을 반환한다.
