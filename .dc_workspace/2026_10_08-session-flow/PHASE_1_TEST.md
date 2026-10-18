# Phase 1: 테스트 케이스

## 테스트 커버리지 목표

70% 는 참고 수치다 — 통과 기준이 아니다.

## 검증할 동작

### storage v5 (`tests/unit/session/storage-v5.test.ts`)

- [x] **동작**: v4 진행 중 봉투(단일 `InProgressSession`)를 읽으면 v5 `drafts` 맵의 원소 하나로 복원된다 | **계층**: 단위 — `storage-v5.test.ts` "v4 단일 세션 봉투 → v5 drafts 맵의 한 원소로 복원된다"
- [x] **동작**: v4 마이그레이션 시 `target` 필드가 손실되지 않는다 | **계층**: 단위 — `storage-v5.test.ts` "v4 마이그레이션 시 target 필드가 손실되지 않는다 (R-1)"
- [x] **동작**: `readInProgress()` 가 v5 봉투를 올바르게 읽어 `{ status: 'ok', value: drafts }` 를 반환한다 | **계층**: 단위 — `storage-v5.test.ts` "readInProgress() 는 v5 봉투를 { status: ok, value: drafts } 로 반환한다"
- [x] **동작**: `writeInProgress(drafts)` 로 쓴 봉투의 `schemaVersion` 이 5 다 | **계층**: 단위 — `storage-v5.test.ts` "writeInProgress(drafts) 로 쓴 봉투의 schemaVersion 은 5다"
- [x] **동작**: `readInProgress()` 가 schemaVersion 6 봉투(미래 버전)를 읽으면 `{ status: 'future-version' }` 를 반환한다 | **계층**: 단위 — `storage-v5.test.ts` "schemaVersion 6 봉투는 future-version 을 반환한다"
- [x] **동작**: `readAppState()` 의 schemaVersion 비교 기준이 `APP_STATE_SCHEMA_VERSION`(4)이고, schemaVersion 5 AppState 봉투를 `future-version` 으로 처리한다 | **계층**: 단위 — `storage-v5.test.ts` "v5 AppState 봉투는 future-version 으로 거절된다"
- [x] **동작**: `draftKey('pushup', 'work')` 가 `'pushup:work'` 를 반환한다 | **계층**: 단위 — `storage-v5.test.ts` "draftKey('pushup', 'work') === 'pushup:work'"

## 이 페이즈에 실제로 해당하는 엣지 케이스

- [x] v4 봉투에 `inProgress` 필드가 없으면(빈 봉투) 빈 `drafts` 맵으로 복원한다. — `storage-v5.test.ts` "v4 봉투에 inProgress 가 없으면 빈 drafts 맵으로 복원된다"
- [x] 손상된 v5 봉투는 `{ status: 'corrupt' }` 를 반환한다. — `storage-v5.test.ts` "drafts 필드가 객체가 아니면 corrupt" / "drafts 의 원소가 SessionDraft 형태를 벗어나면 corrupt"
