# Phase 7: done-cards

## 목표

오늘 날짜로 정규 기록이 이미 있는 계획 종목을 **DoneCard** 로 보인다.
DoneCard 는 기록된 세트를 읽기 전용으로 표시하고, 추가 세트를 자유 운동 칸으로 받는다.
같은 날 정규 세션을 다시 만들지 않는다 (FR-46, J-9).

또한 `syncDoneDrafts` 순수 함수를 작성해, 이미 정규 기록이 있는 종목의 기존 draft 에
사용자가 입력해 둔 세트가 있을 경우 데이터를 잃지 않고 자유 운동 칸으로 이전한다 (ADR-51).

## 선행 조건

- Phase 5 완료 (스토어·부팅 코드 확정).
- Phase 6 문서 작업 완료 (`CLAUDE.md` 훅 목록 포함). Phase 6 의 배포·폰 확인은
  Phase 7 완료 후 이 페이즈의 배포와 합산하는 임시 공유 배포로 처리한다.

## 지침

### 1. `src/lib/ui/today/done.ts` — 순수 함수

`src/lib/ui/today/` 아래에 `done.ts` 를 신설한다. 이 파일에 룬(runes)을 쓰지 않는다.
브라우저 상태나 `localStorage` 에 접근하지 않는다. 순수 함수만 포함한다.

#### 1-1. `recordedToday`

```ts
function recordedToday(
  history: SessionRecord[],
  today: IsoDate,
  id: ProgressionId,
): SessionRecord[]
```

- `history` 에서 `date === today` 이고 `progressionId === id` 이고
  `kind` 가 `'work'` 또는 `'consolidation'` (또는 `outcome === 'abandoned'`) 인 레코드를
  삽입 순서대로 반환한다.
- `kind === 'free'` 는 **제외**한다 (EC-104).
- `outcome === 'abandoned'` 인 레코드는 포함한다 (EC-102 — 중단도 정규 기록).

#### 1-2. `doneResultLabel`

```ts
function doneResultLabel(record: SessionRecord): string
```

- `+page.svelte` 의 `recordLine` 함수(현재 `src/routes/+page.svelte:182`)와 동일한 문자열 규칙을 쓴다.
  - `promotedTo !== undefined && promotedTo !== null` → `{종목명}: {step}단계 → {promotedTo}단계 (승급)`
  - `blockedBy !== undefined` → `{종목명}: {step}단계 (보류 · {blockedBy})`
  - `outcome === 'abandoned'` → `{종목명}: {step}단계 중단`
  - 나머지 → `{종목명}: {step}단계 기록`
- 이 함수로 `+page.svelte` 의 `recordLine` 을 대체한다 (DRY — 아래 3항 참조).
- `record` 인자를 변경하지 않는다.
- 종목명은 호출자가 미리 `progressionName(catalog, id)` 로 구해 인자로 전달한다.

  ```ts
  function doneResultLabel(progName: string, record: SessionRecord): string
  ```

  (catalog 를 받지 않고 미리 해석된 이름을 받는다 — 순수성 유지.)

#### 1-3. `doneSetShortfall`

```ts
function doneSetShortfall(record: SessionRecord, i: number): string | null
```

- `record.target?.work[i]` 가 없거나 (`target` 이 없거나 인덱스를 벗어나면) → `null` 반환.
- `record.sets[i] >= record.target.work[i]` → `null` 반환.
- `record.sets[i] < record.target.work[i]` → `'/ 목표 {target} · 미달'` 형식의 문자열 반환.

#### 1-4. `syncDoneDrafts`

```ts
type SyncAction =
  | { kind: 'remove-draft'; key: string }
  | { kind: 'move-sets'; fromKey: string; toStep: number; sets: SetEntry[] }
  | { kind: 'report'; key: string; reason: 'step-mismatch' }

function syncDoneDrafts(
  drafts: Record<string, SessionDraft>,
  history: SessionRecord[],
  today: IsoDate,
): SyncAction[]
```

- 오늘 정규 기록이 있는 종목의 `work` / `consolidation` draft 각각에 대해:
  - `workSets.length > 0` 이면:
    - 마지막 정규 기록의 `performedStep` 을 구한다 (`recordedToday` 활용).
    - 같은 종목의 `free` draft 가 **없으면**: `{ kind: 'move-sets', fromKey, toStep, sets }` 반환.
      (`fromKey` draft 를 제거하는 `remove-draft` 도 함께 반환.)
    - `free` draft 가 **있고 단계가 같으면**: `{ kind: 'move-sets', fromKey, toStep, sets }` 반환.
      (`remove-draft` 도 함께 반환.)
    - `free` draft 가 **있고 단계가 다르면**: `{ kind: 'report', key: fromKey, reason: 'step-mismatch' }` 반환.
      draft 를 건드리지 않는다.
  - `workSets.length === 0` (세트 없음, `abandoned` 여부 무관): `{ kind: 'remove-draft', key }` 반환.
- `free` draft 자체, 다른 날짜 draft 는 건드리지 않는다.
- 함수는 멱등하다 — 반환된 액션을 적용한 뒤 다시 호출하면 빈 배열을 반환한다.

### 2. `InProgressStore` 에 `applySync` 추가

`src/lib/ui/session/session.svelte.ts` 의 `InProgressStore` 에 메서드를 추가한다.

```ts
applySync(actions: SyncAction[]): void
```

- `actions` 가 빈 배열이면 즉시 반환한다.
- 각 액션을 순서대로 처리한다:
  - `remove-draft`: 해당 키의 draft 를 `drafts` 에서 제거한다.
  - `move-sets`: `fromKey` draft 를 제거하고, `toStep` 으로 자유 운동 칸을 열거나
    이미 열려 있으면 세트를 추가한다. 자유 운동 칸이 없을 때
    `beginFree(today, progressionId, toStep)` 로 연 뒤 `sets` 를 `pushSet` 으로 추가한다.
    자유 운동 칸이 이미 있을 때는 세트를 직접 추가(`pushSet`)한다.
  - `report`: `drafts` 를 변경하지 않는다. 호출자(UI)가 이 결과를 표시에 활용한다.
- 모든 변경을 단 한 번의 `persist()` 로 저장한다 (R-10 방지).

### 3. `src/lib/ui/today/DoneCard.svelte` — 완료 카드 컴포넌트

`src/lib/ui/today/` 아래에 `DoneCard.svelte` 를 신설한다.

**Props**:
```ts
{
  records: SessionRecord[];   // recordedToday(…) 반환값, 시간 순
  progName: string;           // progressionName(catalog, id) 결과
  freeDraft: SessionDraft | undefined;  // 같은 종목의 free draft (오늘)
  freeDraftIsStale: boolean;  // startedAt !== today
  freeDraftStepMismatch: boolean; // step-mismatch 상태
  onAddSet: (entry: SetEntry) => void;
  onEditSet: (index: number, entry: SetEntry) => void;
  onDeleteSet: (index: number) => void;
}
```

**헤더**: 마지막 기록(`records.at(-1)`)의 `step` / `performedStep` / 단계명을 사용한다.
계획의 값을 사용하지 않는다 (R-12).

**기록 목록**: 시간 순으로 각 기록에 대해:
1. 사실 결과 줄 (`doneResultLabel(progName, record)`, `data-done-result`).
2. 세트 행 읽기 전용: 값, 단계 대비 미달 문구(`doneSetShortfall`), RPE.
   (`data-done-set-row`, `data-done-set-short`)
3. `completedAt` 표시 (`data-done-completed-at`).

**「추가 세트」 섹션** (`data-done-extras`):
- 항상 DOM 에 존재한다. 단, `freeDraftIsStale` 또는 `freeDraftStepMismatch` 가 true 이면
  CSS 로 입력 영역을 접고 `data-done-extra-blocked` 속성에 `'stale'` 또는 `'step-mismatch'` 를 표시한다.
- `freeDraft.workSets` 를 순서대로 편집·삭제 가능한 행으로 보인다 (`data-done-extra-row`).
- 새 세트 입력 행 (`data-done-add-input`).
- 오류 문구 표시 영역 (`data-done-add-error`).

**「이 단계 중단」 없음** (FR-46.4).

### 4. `src/routes/+page.svelte` 변경

#### 4-1. ExerciseCard ↔ DoneCard 전환

각 `screen.agenda.exercises` 항목(및 `paired`)에 대해:
- ExerciseCard 와 DoneCard 를 **모두** 렌더링한다.
- `recordedToday(appState.value.history, todayClock.today, ex.progressionId).length > 0`
  이면 ExerciseCard 에 CSS 클래스 `hidden`(또는 상응하는 클래스)을 붙여 `display: none` 으로 숨기고,
  DoneCard 를 표시한다. 반대일 때는 ExerciseCard 를 표시하고 DoneCard 를 숨긴다.
- `{#if}` 로 DOM 에서 제거하지 않는다 (CLAUDE.md, ADR-49).
- 숨겨진 ExerciseCard 의 `beginWork` 는 버튼이 `display: none` 상태이므로 포인터 이벤트가
  차단되어 호출되지 않는다.

이미 DoneCard 가 렌더링되는 종목의 자유 운동 칸(`kind === 'free'`)은 독립 카드로 별도 렌더링하지 않는다
— DoneCard 의 「추가 세트」 섹션이 해당 칸을 흡수한다.

#### 4-2. `recordLine` → `doneResultLabel` 교체

`+page.svelte:182` 의 `recordLine` 함수를 제거하고 `doneResultLabel` 을 `$lib/ui/today/done`
에서 import 해 기록 결과 표시에 쓴다.

호출부는 `recordLine(r)` → `doneResultLabel(progressionName(catalog, r.progressionId), r)` 로 바꾼다.

#### 4-3. `syncDoneDrafts` 호출

`$effect(() => { ... })` 로 `appState.value.history` 와 `inProgress.drafts` 를 관찰한다.
변경 시 `syncDoneDrafts(inProgress.drafts, appState.value.history, todayClock.today)` 를 호출하고,
반환된 액션을 `inProgress.applySync(actions)` 에 전달한다.
`actions` 가 빈 배열이면 아무것도 하지 않는다.

`report` 액션은 UI 상태 변수에 저장해 DoneCard 의 `freeDraftStepMismatch` prop 에 전달한다.

### 5. 문서 갱신

#### 5-1. `README.md`

기존 세션 흐름 설명에 한 줄을 추가한다:
「오늘 이미 기록한 종목은 「완료」 카드로 보이며, 추가 세트는 자유 운동으로 기록된다.」

#### 5-2. `CHANGELOG.md`

`[Unreleased]` 섹션의 `### Changed` 블록에 아래 항목을 추가한다:
```
- Exercises already recorded today show a read-only DoneCard; additional sets are recorded as free exercises — a regular session is not created twice on the same day
```

`[Unreleased]` 섹션에 `### Known Limitations` 항목을 추가한다:
```
- Duplicate regular records on the same day (possible in pre-0.4.0 branch builds) are not removed automatically; they are all displayed in the DoneCard in time order
```

#### 5-3. `CLAUDE.md`

기존 SPEC5 훅 블록(`**오늘 화면 세션 흐름 (SPEC5)**`) 안에 아래를 추가한다:
```
**완료 카드 (Phase 7)**:
`data-card-done`(DoneCard 루트),
`data-done-step`(값: 단계 번호),
`data-done-record`(기록 행, 값: 인덱스),
`data-done-result`(결과 문구),
`data-done-set-row`(세트 행, 값: 인덱스),
`data-done-set-short`(미달 문구),
`data-done-completed-at`(완료 시각),
`data-done-extras`(추가 세트 섹션),
`data-done-extra-row`(추가 세트 행, 값: 인덱스),
`data-done-add-input`(새 세트 입력),
`data-done-add-error`(오류 문구),
`data-done-extra-blocked`(값: `'stale'` | `'step-mismatch'`).
```

## 완료 체크리스트

- [ ] `src/lib/ui/today/done.ts` 신설 — `recordedToday` · `doneResultLabel` · `doneSetShortfall` · `syncDoneDrafts` 포함
- [ ] `InProgressStore.applySync` 추가
- [ ] `src/lib/ui/today/DoneCard.svelte` 신설
- [ ] `+page.svelte` — ExerciseCard/DoneCard CSS 전환 구현
- [ ] `+page.svelte` — `recordLine` → `doneResultLabel` 교체
- [ ] `+page.svelte` — `syncDoneDrafts` `$effect` 호출 추가
- [ ] `README.md` DoneCard 한 줄 추가
- [ ] `CHANGELOG.md` Changed 항목 · Known Limitations 추가
- [ ] `CLAUDE.md` SPEC5 블록에 DoneCard 훅 추가
- [ ] `tests/unit/today/done.test.ts` 작성 및 전부 통과
- [ ] 숨겨진 ExerciseCard 가 `display: none` 상태에서 `beginWork` 를 실행할 수 없음을 수동 확인
- [ ] `pnpm check` 오류 0
- [ ] `pnpm test` 전부 통과
- [ ] 폰 체크리스트 (아래)

## 폰 체크리스트

1. 한 종목을 「오늘 운동 마치기」로 기록한 뒤 오늘 화면에 재진입하면 해당 종목이 「완료」 카드로 표시된다.
2. 「완료」 카드에 기록된 세트 값과 완료 시각이 사실 그대로 보인다.
3. 「완료」 카드에서 추가 세트를 입력하고 「오늘 운동 마치기」로 기록하면 자유 운동으로 기록된다.
4. 「완료」 카드에 「이 단계 중단」 버튼이 없다.
5. 미달 세트가 있으면 「{값} / 목표 {목표} · 미달」 문구가 읽기 전용으로 표시된다.
6. 자유 운동 칸이 다른 단계로 열려 있을 때 추가 세트 입력이 비활성이고 step-mismatch 안내가 표시된다.
7. 오늘 자유 운동 기록만 있는 종목은 「완료」 카드가 아니라 일반 카드로 표시된다.
8. 기존 테스트 전부 통과 (회귀 없음).

## 비고

- Phase 6 의 배포(임시)와 이 Phase 7 의 배포는 같은 `feature/session-flow` 브랜치를 쓴다.
  Phase 7 완료 후 합산 폰 체크리스트로 Phase 6 폰 확인을 대신할 수 있다.
- `doneResultLabel` 은 catalog 를 받지 않는다 — 종목명을 미리 해석해 전달한다.
  이는 `progressionName(catalog, id)` 가 SvelteKit SSR 경계 없이 컴포넌트 외부에서
  호출될 때도 순수 함수로 동작하게 하기 위함이다.
