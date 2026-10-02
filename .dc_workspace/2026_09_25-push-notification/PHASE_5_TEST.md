# Phase 5: 테스트 케이스

## 테스트 커버리지 목표

70% 는 참고 수치다 — 통과 기준이 아니다.

## 검증할 동작

### `pushAutoSync` (단위, `tests/unit/push/autoSync.test.ts`)

파일 첫 줄: `// @vitest-environment happy-dom` (localStorage 접근).

`loadRelay`, `PushRelay.state`, `PushRelay.enable`, `buildMeta`, `writePushRecord` 를 목(mock)으로 교체한다.

- **동작**: `state() === 'on'` 이고 직렬화된 meta 가 `sentMeta` 와 다르면 `PushRelay.enable` 을 정확히 1회 호출하고 storage 의 `sentMeta` 를 갱신한다 | **계층**: 단위 | [x] PASS
- **동작**: `state() === 'on'` 이고 직렬화된 meta(base, `test` 제외)가 `sentMeta` 와 같으면 `PushRelay.enable` 을 호출하지 않는다 | **계층**: 단위 | [x] PASS (FR-34.3 포함, 아래 동작과 병합됨)
- **동작**: 직전 테스트 발송으로 `sentMeta` 는 바뀌지 않았고 base meta 는 동일한 상태에서 `pushAutoSync` 를 호출하면 `enable` 을 호출하지 않는다 (test 필드가 비교에서 제외됨) | **계층**: 단위 | [x] PASS (pruner criterion #2 로 위 동작에 병합, 주석으로 FR-34.3 명시)
- **동작**: `state()` 가 `'off'` · `'denied'` · `'unsupported'` 이면 `PushRelay.enable` 을 호출하지 않는다 (`it.each` 하나로 처리) | **계층**: 단위 | [x] PASS
- **동작**: `buildMeta` 가 null 을 반환하면 `PushRelay.enable` 을 호출하지 않는다 | **계층**: 단위 | [x] PASS
- **동작**: `PushRelay.enable` 이 throw 해도 `pushAutoSync` 밖으로 예외가 전파되지 않는다 | **계층**: 단위 | [x] PASS
- **동작**: `pushRecord.sentMeta === null` 이면 `loadRelay` 를 호출하지 않는다 | **계층**: 단위 | [x] PASS

## 이 페이즈에 실제로 해당하는 엣지 케이스

- EC-84: 타임존 변경 — `buildMeta` 가 새 `tz` 로 다른 meta 를 생성하므로 auto-sync 가 `enable` 을 호출한다.
- EC-85: 오프라인 중 동기화 — `enable` 이 network 오류를 throw 하면 조용히 넘기고 다음 부팅 때 재시도한다.
