# Phase 2: store-drafts

## 목표

`session.svelte.ts` 를 칸 목록 스토어로 전면 재작성하고, `stale.ts` 를 신설하며,
`boot.ts` 와 `inprogress.test.ts` 를 새 API 에 맞게 갱신한다.
FR-39, FR-41.2, EC-94/99/100 을 구현한다.

## 선행 조건

Phase 1 완료.

## 지침

### 1. `session.svelte.ts` 전면 재작성

기존 `InProgressStore` 클래스를 새 API 로 교체한다. 핵심 상태는 `#drafts = $state<Record<string, SessionDraft>>({})`.
`draftKey` 는 Phase 1 에서 `storage.ts` 에 정의됐으므로 `$lib/ui/state/storage` 에서 import 해 사용한다.

**API 구현 목록 (ADR-42 스토어 API 절 참조)**:

- `init(loaded: Record<string, SessionDraft>)`: 부팅 시 복원. `#drafts` 와 `#saveStatus` 를 초기화한다.
- `getDraft(id, kind, onDate?)`: `draftKey(id, kind)` 로 키를 구하고 `#drafts[key]` 를 반환한다.
  `onDate` 가 있으면 `draft.startedAt === onDate` 인 경우에만 반환한다.
- `beginWork(startedAt, plan)`: `work` 칸을 만들어 `#drafts` 에 추가.
  `target: { goal: plan.goal, work: plan.work }` 스냅샷 저장 (FR-39.3).
  키 충돌 시(이미 칸이 있으면) 덮어쓰지 않고 기존 칸을 그대로 둔다 — 번갈아 할 때 기존 세트를 보호한다 (FR-39.2).
- `beginFree(startedAt, id, step)`: `free` 칸 생성. `target` 없음.
- `beginConsolidation(startedAt, state, catalog, id, linkedTo)`:
  `planConsolidation(state, catalog, id)` 로 `target` 을 만들어 `consolidation` 칸 생성.
  `linkedTo` 를 칸의 `linkedTo` 필드에 기록한다.
- `pushSet(key, entry)`, `updateSet(key, index, entry)`, `removeSet(key, index)`:
  대상 칸의 `workSets` 를 불변 spread 로 갱신하고 저장한다. 존재하지 않는 키는 무시.
- `markAbandoned(key, bool)`: `abandoned` 필드만 toggle. 저장.
- `discardDraft(key)`: 단일 칸 제거. 저장.
- `discardAll()`: `#drafts = {}`. 저장.
- `finish(state, catalog, nowIsoLocal, scope?)`: Phase 3 에서 구현. 이 페이즈에서는 stub 으로 둔다.

**변경 불변 규칙 (R-3)**: `#drafts` 를 직접 뮤테이션하지 않는다.
```ts
this.#drafts = { ...this.#drafts, [key]: { ...this.#drafts[key], workSets: next } };
```

**임시 호환 래퍼 추가 (R-2)**: Phase 4 에서 UI 를 갱신하기 전까지 기존 카드가 컴파일 오류 없이 유지되어야 한다.
`finalize(state, catalog)` 와 `abandon(state, catalog)` 를 stub 으로 남긴다.
이 두 메서드는 Phase 4 완료 시 제거한다.

**삭제 항목**: `isStaleStartedAt` export. Phase 5 에서 `stale.ts` 로 대체.

### 2. `stale.ts` 신설 (`src/lib/ui/session/stale.ts`)

```ts
export function staleDrafts(
  drafts: Record<string, SessionDraft>,
  today: IsoDate,
): Record<string, SessionDraft[]>  // key: IsoDate, value: 그 날짜 칸 배열
```

`draft.startedAt < today` 인 칸을 날짜별로 묶어 반환한다.
`today` 보다 이른 날짜의 칸만 포함 — `today` 와 같은 칸은 제외한다.

### 3. `boot.ts` 갱신

`readInProgress()` 반환 타입이 `ReadResult<Record<string, SessionDraft>>` 로 바뀌었으므로:
- `BootResult.inProgress` 타입을 `Record<string, SessionDraft> | null` 로 변경.
- `ip.status === 'ok'` 분기에서 `ip.value` 를 drafts 맵으로 처리.

### 4. 기존 테스트 갱신

`tests/unit/inprogress.test.ts` 와 `tests/unit/boot.test.ts` 에서 기존 `begin`·`finalize`·`abandon` 호출을 새 API 에 맞게 수정한다.

`tests/unit/session/inprogress.test.ts` 를 신설해 새 스토어의 단위 테스트를 추가한다.

## 완료 체크리스트

- [ ] `session.svelte.ts` 가 `#drafts = $state<Record<string, SessionDraft>>({})` 기반으로 재작성됨
- [ ] `init`, `getDraft`, `beginWork`, `beginFree`, `beginConsolidation` 구현됨
- [ ] `pushSet`, `updateSet`, `removeSet`, `markAbandoned`, `discardDraft`, `discardAll` 구현됨
- [ ] 모든 상태 변경이 불변 spread 로 처리됨
- [ ] `finalize`/`abandon` 임시 stub 존재 (Phase 4 제거 예정)
- [ ] `isStaleStartedAt` 이 제거되거나 deprecated 처리됨
- [ ] `stale.ts` 의 `staleDrafts` 함수 구현됨
- [ ] `boot.ts` 가 `Record<string, SessionDraft> | null` 을 반환함
- [ ] `tests/unit/inprogress.test.ts` 갱신됨
- [ ] `tests/unit/boot.test.ts` 갱신됨
- [ ] `pnpm check` 오류 0
- [ ] `pnpm test` 전부 통과 (베이스라인 920)

## 비고

- `beginWork` 에서 칸 충돌 시 덮어쓰지 않는 정책은 EC-100(앞 종목 승급 후 뒤 종목 계획 변경)을 처리하는 핵심이다. 이미 시작한 칸의 `target` 스냅샷이 기준이기 때문이다.
- `finish` stub 은 `throw new Error('Phase 3 에서 구현')` 처럼 명시적 에러를 내도 된다. 빌드·테스트가 이 경로를 호출하지 않으면 ok.
