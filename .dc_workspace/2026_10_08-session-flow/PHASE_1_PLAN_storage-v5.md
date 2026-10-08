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
- export/import (`exportJson.ts` 에서 `CURRENT_SCHEMA_VERSION` 을 import 하는 경우): `APP_STATE_SCHEMA_VERSION` 으로 교체한다.
  - 실제로는 `exportJson.ts` 가 `CURRENT_SCHEMA_VERSION` 을 직접 import 하지 않고
    `ExportMeta.schemaVersion: number` 를 호출자가 채우므로,
    호출 지점(`ExportBar.svelte` 또는 동등 파일)에서 `APP_STATE_SCHEMA_VERSION` 을 넘기도록 수정한다.
  - `importJson.ts` 의 `CURRENT_SCHEMA_VERSION` 참조도 `APP_STATE_SCHEMA_VERSION` 으로 교체한다.

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

### 5. `draftKey` 순수 함수 추가 (`src/lib/ui/state/storage.ts` 또는 `src/lib/ui/session/session.svelte.ts`)

- `draftKey(progressionId: ProgressionId, kind: 'work' | 'consolidation' | 'free'): string`
- 반환 형식: `${progressionId}:${kind}`.
- 이 파일 어디에 두든 export 하고, 두 파일에 걸쳐 임포트 규칙을 지킨다.

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

- [ ] `APP_STATE_SCHEMA_VERSION = 4`, `IN_PROGRESS_SCHEMA_VERSION = 5` 정의됨
- [ ] `AppStateEnvelope.schemaVersion` 이 `APP_STATE_SCHEMA_VERSION` 타입
- [ ] `InProgressEnvelope.schemaVersion` 이 `IN_PROGRESS_SCHEMA_VERSION` 타입, `drafts` 맵 구조
- [ ] `migrateInProgressV4toV5` 구현, `target` 보존 확인
- [ ] `draftKey(id, kind)` 순수 함수 export
- [ ] `readInProgress()` 반환 타입 `ReadResult<Record<string, SessionDraft>>`
- [ ] `writeInProgress(drafts)` 새 시그니처
- [ ] `writeInProgressCompat` 래퍼 존재 (Phase 2 에서 제거 예정)
- [ ] `importJson.ts` 의 schemaVersion 검사가 `APP_STATE_SCHEMA_VERSION` 기준
- [ ] `pnpm check` 오류 0
- [ ] `pnpm test` 전부 통과 (베이스라인 920)

## 비고

- `CURRENT_SCHEMA_VERSION` 은 삭제하지 않고 일단 `APP_STATE_SCHEMA_VERSION` 과 같은 값의 별칭으로 남겨 두면 다른 파일의 참조가 한 번에 깨지는 것을 막을 수 있다. Phase 1 안에서 점진적으로 교체한다.
- 테스트 파일 경로: `tests/unit/session/storage-v5.test.ts`. `session/` 디렉터리를 새로 만든다.
