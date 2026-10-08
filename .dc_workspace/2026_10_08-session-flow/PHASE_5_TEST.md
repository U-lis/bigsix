# Phase 5: 테스트 케이스

## 테스트 커버리지 목표

70% 는 참고 수치다 — 통과 기준이 아니다.

## 검증할 동작

### `staleDrafts` (`tests/unit/session/` 또는 기존 `inprogress.test.ts`)

Phase 2 에서 이미 작성됐다면 여기서 중복 추가하지 않는다.

### 부팅 v4→v5 이전 (`tests/unit/boot.test.ts`)

- **동작**: v4 진행 중 봉투가 있는 상태에서 부팅하면 drafts 맵으로 복원되고 `boot.inProgress` 가 null 이 아니다 (EC-98) | **계층**: 단위

### 초기화 (`tests/unit/reset.test.ts`)

- **동작**: `performReset()` 호출 후 `inProgress.drafts` 가 비어 있다 (FR-45.5) | **계층**: 단위

### 가져오기 차단 (`tests/unit/history-importJson.test.ts`)

- **동작**: drafts 맵에 칸이 있을 때 가져오기를 시도하면 `data-import-block="inprogress"` 조건이 활성화된다 | **계층**: 단위

## 이 페이즈에 실제로 해당하는 엣지 케이스

- EC-97: 다음 날 진입 시 어제 날짜 칸이 StaleBanner 에만 나타나고 오늘 카드 목록에는 없다.
- EC-98: v4 마이그레이션 후 세트가 보존된다.
