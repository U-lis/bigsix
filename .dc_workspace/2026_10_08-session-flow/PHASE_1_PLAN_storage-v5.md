# Phase 1: storage-v5

## 목표

저장 스키마 버전을 AppState 와 InProgress 로 분리하고, `InProgressSession` 하나를
`SessionDraft` 맵으로 교체한다 (FR-45.1~3, EC-98, ADR-43).

## 선행 조건

없음.

## 지침

### 1. 버전 상수 분리 (`src/lib/ui/state/storage.ts`)

- `CURRENT_SCHEMA_VERSION = 4` 를 두 상수로 교체한다.
  - `APP_STATE_SCHEMA_VERSION = 4` — AppState 봉투 버전. 값은 4 그대로.
  - `IN_PROGRESS_SCHEMA_VERSION = 5` — 진행 중 봉투 버전.
- `AppStateEnvelope.schemaVersion` 타입을 `typeof APP_STATE_SCHEMA_VERSION` 으로 바꾼다.
- `AppState` 읽기·쓰기(`readAppState`, `writeAppState`)가 `CURRENT_SCHEMA_VERSION` 를 참조하던 곳을
  `APP_STATE_SCHEMA_VERSION` 으로 교체한다.
- `validateAndMigrateAppStateEnvelope` 의 `CURRENT_SCHEMA_VERSION` 참조도 `APP_STATE_SCHEMA_VERSION` 으로 교체한다.
- `CURRENT_SCHEMA_VERSION` 을 참조하는 모든 실제 코드를 아래 목록에 따라 교체한다.
  각 파일·라인은 워크트리에서 직접 확인한 결과다:

  | 파일 | 라인 | 내용 | 변경 |
  |------|------|------|------|
  | `storage.ts` | 37 | `export const CURRENT_SCHEMA_VERSION = 4` | `APP_STATE_SCHEMA_VERSION = 4` · `IN_PROGRESS_SCHEMA_VERSION = 5` 로 교체 |
  | `storage.ts` | 42 | `AppStateEnvelope.schemaVersion: typeof CURRENT_SCHEMA_VERSION` | `APP_STATE_SCHEMA_VERSION` |
  | `storage.ts` | 47 | `InProgressEnvelope.schemaVersion: typeof CURRENT_SCHEMA_VERSION` | `IN_PROGRESS_SCHEMA_VERSION` (→ v5 구조로 교체) |
  | `storage.ts` | 174 | `migrateAppStateEnvelope` while `< CURRENT_SCHEMA_VERSION` | `APP_STATE_SCHEMA_VERSION` |
  | `storage.ts` | 220 | `migrateInProgressEnvelope` while `< CURRENT_SCHEMA_VERSION` | `IN_PROGRESS_SCHEMA_VERSION` |
  | `storage.ts` | 285 | `readAppState` future-version `> CURRENT_SCHEMA_VERSION` | `APP_STATE_SCHEMA_VERSION` |
  | `storage.ts` | 308 | `writeAppState` 봉투 `schemaVersion: CURRENT_SCHEMA_VERSION` | `APP_STATE_SCHEMA_VERSION` |
  | `storage.ts` | 348 | `readInProgress` future-version `> CURRENT_SCHEMA_VERSION` | `IN_PROGRESS_SCHEMA_VERSION` |
  | `storage.ts` | 366 | `writeInProgress` 봉투 `schemaVersion: CURRENT_SCHEMA_VERSION` | `IN_PROGRESS_SCHEMA_VERSION` |
  | `storage.ts` | 400 | `validateAndMigrateAppStateEnvelope` future-version `> CURRENT_SCHEMA_VERSION` | `APP_STATE_SCHEMA_VERSION` |
  | `ExportBar.svelte` | 24 | `import { CURRENT_SCHEMA_VERSION } from '$lib/ui/state/storage'` | `APP_STATE_SCHEMA_VERSION` import 로 교체 |
  | `ExportBar.svelte` | 50 | `schemaVersion: CURRENT_SCHEMA_VERSION` (meta 조립) | `APP_STATE_SCHEMA_VERSION` |

  `importJson.ts:32` 와 `exportJson.ts:28` 는 JSDoc 주석만 있고 실제 코드 참조가 없다.
  `importJson.ts:32` 의 JSDoc (`CURRENT_SCHEMA_VERSION` 언급)은 `APP_STATE_SCHEMA_VERSION` 으로
  문구만 수정한다. 실제 검증 로직은 `validateAndMigrateAppStateEnvelope`(`storage.ts:400`) 를 통해 실행된다 — 그 함수는 위 표에 이미 포함돼 있다.

### 2. `SessionDraft` 타입 추가 (`src/lib/ui/state/storage.ts`)

- 기존 `InProgressSession` 인터페이스에 `abandoned?: boolean` 과 `linkedTo?: string` 필드를 추가해
  `SessionDraft` 로 이름을 바꾼다. 기존 `InProgressSession` 은 호환 타입 별칭으로 남긴다.
  ```ts
  export type InProgressSession = SessionDraft; // Phase 2 전까지 임시 별칭
  ```

### 3. `InProgressEnvelope` v5 정의

- `InProgressEnvelopeV4` 를 기존 구조로 남기고 `InProgressEnvelope` 를 v5 구조로 교체한다.
  ```ts
  export interface InProgressEnvelope {
    schemaVersion: typeof IN_PROGRESS_SCHEMA_VERSION;  // 5
    drafts: Record<string, SessionDraft>;
  }
  ```

### 4. v4 → v5 마이그레이션 추가

- `IN_PROGRESS_MIGRATIONS` 에 `4: migrateInProgressV4toV5` 를 추가한다.
- `migrateInProgressV4toV5`: `envelope.inProgress` 가 존재하면 `draftKey(inProgress.progressionId, inProgress.kind)` 로 키를 만들어 `drafts` 맵의 원소 하나로 옮긴다. `inProgress` 가 없으면 빈 맵으로 시작한다.
  - **주의**: `target` 필드를 그대로 보존한다 (R-1).
- `migrateInProgressEnvelope` 의 while 조건을 `< IN_PROGRESS_SCHEMA_VERSION` 으로 교체한다.

### 5. `draftKey` 순수 함수 추가 (`src/lib/ui/state/storage.ts`)

- `draftKey` 는 **`src/lib/ui/state/storage.ts`** 에만 정의하고 export 한다.
- `session.svelte.ts` 와 UI 컴포넌트는 `$lib/ui/state/storage` 에서 import 한다.
- 시그니처: `export function draftKey(progressionId: ProgressionId, kind: 'work' | 'consolidation' | 'free'): string`
- 반환 형식: `${progressionId}:${kind}`.
- 마이그레이션(`migrateInProgressV4toV5`)도 같은 파일 안에 있으므로 import 없이 직접 호출한다.

### 6. `readInProgress` · `writeInProgress` · `clearInProgress` 갱신

- `readInProgress()` 가 `Record<string, SessionDraft>` 를 반환하도록 변경.
  성공 시 `{ status: 'ok', value: drafts }`.
- `writeInProgress(drafts: Record<string, SessionDraft>)` 로 시그니처 변경.
  봉투의 `schemaVersion` 은 `IN_PROGRESS_SCHEMA_VERSION`.
- 스키마 형태 검사 함수 `isInProgressShape` 를 `isDraftsShape` 로 갱신:
  `drafts` 가 객체이고 각 값이 `SessionDraft` 형태를 만족하는지 확인.

### 7. 호환 래퍼 유지 (R-2)

Phase 2 에서 스토어를 전면 재작성하기 전까지 중간 커밋이 통과해야 한다.
`writeInProgress` 가 새 시그니처로 바뀌므로, `session.svelte.ts` 의 기존 `persist()` 가 깨진다.
임시로 단일 draft 를 `{ [key]: draft }` 맵으로 래핑해 `writeInProgress` 를 호출하는
`writeInProgressCompat(session: InProgressSession): void` 래퍼를 `storage.ts` 에 추가하고,
`session.svelte.ts` 가 이를 사용하도록 수정한다. Phase 2 에서 제거한다.

## 완료 체크리스트

- [x] `APP_STATE_SCHEMA_VERSION = 4`, `IN_PROGRESS_SCHEMA_VERSION = 5` 정의됨 — Verified in `storage.ts:41,49`
- [x] `AppStateEnvelope.schemaVersion` 이 `APP_STATE_SCHEMA_VERSION` 타입 — Verified in `storage.ts:60`
- [x] `InProgressEnvelope.schemaVersion` 이 `IN_PROGRESS_SCHEMA_VERSION` 타입, `drafts` 맵 구조 — Verified in `storage.ts:70-73`
- [x] `migrateInProgressV4toV5` 구현, `target` 보존 확인 — Verified in `storage.ts:296-309`; `target` spread-preserved
- [x] `draftKey(id, kind)` 순수 함수 export — Verified in `storage.ts:143-148`
- [x] `readInProgress()` 반환 타입 `ReadResult<Record<string, SessionDraft>>` — Verified in `storage.ts:434`
- [x] `writeInProgress(drafts)` 새 시그니처 — Verified in `storage.ts:473`
- [x] `writeInProgressCompat` 래퍼 존재 (Phase 2 에서 제거 예정) — Verified in `storage.ts:493-496`; `readInProgressCompat` also present at `storage.ts:508-515`
- [x] `importJson.ts` 의 schemaVersion 검사가 `APP_STATE_SCHEMA_VERSION` 기준 — Verified in `importJson.ts:87` via `validateAndMigrateAppStateEnvelope` which uses `APP_STATE_SCHEMA_VERSION`
- [x] `pnpm check` 오류 0 — 529 files, 0 errors, 0 warnings
- [x] `pnpm test` 전부 통과 (베이스라인 920) — 938 tests passed (54 test files)

## 비고

- `CURRENT_SCHEMA_VERSION` 은 삭제하지 않고 일단 `APP_STATE_SCHEMA_VERSION` 과 같은 값의 별칭으로 남겨 두면 다른 파일의 참조가 한 번에 깨지는 것을 막을 수 있다. Phase 1 안에서 점진적으로 교체한다.
- 테스트 파일 경로: `tests/unit/session/storage-v5.test.ts`. `session/` 디렉터리를 새로 만든다.
