# Phase 2: 테스트 케이스

## 테스트 커버리지 목표

70% 는 참고 수치다 — 통과 기준이 아니다.

## 검증할 동작

### `buildMeta` (단위, `tests/unit/push/meta.test.ts`)

- [x] **동작**: 다섯 프로그램 모두 직렬화 결과가 1024 바이트 이하다 | **계층**: 단위
- [x] **동작**: 프로그램 미선택(`currentStint` 가 null)이면 null 을 반환한다 | **계층**: 단위
- [x] **동작**: 잠긴 종목은 `days` 에서 제외된다(`planDay` 가 필터링) | **계층**: 단위
- [x] **동작**: 종목이 없는 요일(휴식일)은 `days` 에 키가 없다 | **계층**: 단위
- [x] **동작**: `program` 필드가 programId 가 아닌 프로그램 한국어명이다 | **계층**: 단위
- [x] **동작**: 같은 입력을 주면 항상 같은 직렬화 결과를 낸다(`JSON.stringify` 비교에 결정적) | **계층**: 단위
- [x] **동작**: 반환된 meta 의 `tz` 가 인자로 넘긴 `tz` 와 일치한다 | **계층**: 단위

### `storage.ts` (단위, `tests/unit/push/storage.test.ts`)

파일 첫 줄: `// @vitest-environment happy-dom`

- [x] **동작**: `writePushRecord` 로 쓴 값을 `readPushRecord` 로 읽으면 데이터 손실 없이 돌아온다 | **계층**: 단위
- [x] **동작**: localStorage 에 손상된 JSON 이 있으면 `readPushRecord` 가 기본값 `{ v:1, notifyAt:'19:00', sentMeta:null }` 을 반환한다 | **계층**: 단위
- [x] **동작**: `localStorage.getItem` 이 throw 하면 `readPushRecord` 가 기본값을 반환한다 | **계층**: 단위
- [x] **동작**: `readPushRecord` 가 키 `'bigsix.push'` 를 사용한다 | **계층**: 단위

## 이 페이즈에 실제로 해당하는 엣지 케이스

- 특정 요일의 종목이 모두 잠겨 있으면 해당 요일이 `days` 에 나타나지 않아야 한다.
- 일요일: 모든 프로그램에서 종목이 없으므로 meta 에 `'일'` 키가 없어야 한다.
