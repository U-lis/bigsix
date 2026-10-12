# bigsix 오늘 화면 세션 흐름 개편 — 전역 문서 (SPEC5)

## 기능 개요

**목적**: 오늘 화면에서 여러 종목을 번갈아 세트를 쌓아도 기록이 지워지지 않게 하고,
「오늘 운동 마치기」 버튼 하나로 모든 종목을 한 번에 기록·판정한다.

**문제**: 진행 중 칸이 앱 전체에 하나(`bigsix.session.inprogress`)뿐이라,
다른 종목에서 `inProgress.begin()`(`session.svelte.ts:71`)을 호출하면 칸이 통째로
덮어써진다. 또 종목 카드마다 「세션 완료 기록」·「불가능」 버튼이 있어 종료 경로가
여러 개이고, 「불가능」이 세트 하나의 실패처럼 읽혀 의미가 모호하다.

**해법**: 진행 중 기록을 종목별 `SessionDraft` 로 쪼개 `Record<string, SessionDraft>` 로 보관한다.
종목 카드는 세트를 쌓기만 하고, 하단 버튼 하나가 `planFinish` → `executeFinish` 순서로
모든 칸을 한 번에 기록·판정한다. 초과 세트는 `kind: 'free'` 로 분리해 판정 대상에서 뺀다.

---

## 아키텍처 결정

### ADR-41: 칸 키 규약 (`draftKey`)

진행 중 기록은 `Record<string, SessionDraft>` 이고, 키는 `draftKey(progressionId, kind)` 순수 함수가 만든다.
형식: `${progressionId}:${kind}`, `kind ∈ work | consolidation | free`.
같은 종목이어도 계획 칸(`work`)·다지기 칸(`consolidation`)·자유 운동 칸(`free`)은 키가 달라 따로 존재한다.
한 종목에 `free` 칸은 최대 하나다.

### ADR-42: `SessionDraft` 타입

`InProgressSession` 을 그대로 확장하지 않고 새 타입으로 정의한다. 필드:

```ts
interface SessionDraft {
  startedAt: string;          // 시작 날짜 (IsoDate)
  progressionId: ProgressionId;
  step: number;               // 훈련 중인 단계
  performedStep: number;      // 실제 수행 단계
  kind: 'work' | 'consolidation' | 'free';
  workSets: SetEntry[];
  target?: SessionTarget;     // 시작 시점 목표 스냅샷
  abandoned?: boolean;        // 「이 단계 중단」 표시
  linkedTo?: string;          // 다지기 칸이 가리키는 work 칸 키
}
```

도메인(`src/lib/domain/**`) 변경 없음. `SetEntry` 는 기존 타입 재사용.

### ADR-43: 저장 스키마 버전 분리 (Correction 1)

`CURRENT_SCHEMA_VERSION = 4` 를 **둘로 분리**한다.

- `APP_STATE_SCHEMA_VERSION = 4` — AppState 봉투 버전. **v4 그대로 유지**.
- `IN_PROGRESS_SCHEMA_VERSION = 5` — 진행 중 봉투 버전. v4 → v5 마이그레이션 추가.

**근거**: 분리하지 않으면 AppState 봉투에도 v5 가 기록되어, v0.3.0(main)으로 롤백 시
`readAppState()`(`storage.ts:285`)가 `future-version` 을 반환하고 사용자 기록 전체가
열리지 않는다. 진행 중 봉투만 분리하면 롤백 시 in-progress 칸만 무시되고 기록은 안전하다.

**v0.3.0 롤백 동작**: `readInProgress()`(`storage.ts:348`)가 `env.schemaVersion > CURRENT_SCHEMA_VERSION`
(즉 5 > 4) 조건을 만족해 `{ status: 'future-version' }` 를 반환한다.
`boot.ts:120` 에서 `ip.status === 'ok'` 가 false 이므로 `inProgress = null` 로 조용히 무시된다 —
차단하지 않고 빈 상태로 시작한다. in-progress 칸은 잃지만 기록(AppState)은 그대로다.

**v4 → v5 마이그레이션**: 기존 단일 `InProgressSession` → `drafts` 맵의 원소 하나로 이전.
`draftKey(session.progressionId, session.kind)` 로 키를 만든다 (EC-98).

**export/import 영향 없음**: `exportJson` 의 `meta.schemaVersion` 은 `APP_STATE_SCHEMA_VERSION`(4)
를 그대로 쓴다. `importJson` 의 future-version 검사도 `APP_STATE_SCHEMA_VERSION` 기준이라 변경 없다.

### ADR-44: 순수 기록 플래너·실행기

기록 로직을 두 순수 함수로 분리해 단위 테스트를 가능하게 한다 (NFR-39).

**`planFinish(drafts, agendaOrder, scope)`** → `FinishPlan { groups: DraftOps[] }`

- `DraftOps`: `{ draftKey, ops, summary }`. `summary` 는 사실만 기술하는 문자열.
- Op 종류: `work | consolidation | abandon | free`.
- 플래너 규칙:
  - 세트 0개: op 없음, 그룹 없음
  - work 칸, 미중단: M ≤ N → work(전체 세트) / M > N → work(앞 N) + free(나머지, `performedStep`)
  - work 칸, 중단: abandon(전체 세트)
  - consolidation 칸: M ≤ N → consolidation(전체) / M > N → consolidation(앞 N) + free(나머지, `step − 1`)
  - free 칸: free(전체 세트)
  - extras(`target` · `setRpes` op 별 슬라이스 · `completedAt`)는 기존 `applyExtras` 규약 준용
  - 모든 op 의 date = `draft.startedAt`
- 그룹 순서: 화면 순서(agendaOrder), 한 종목 안에서 work → consolidation, free 칸 마지막.
- `scope = 'date'` 이면 `draft.startedAt` 이 scope date 인 그룹만 포함 (FR-44.2 용).

**`executeFinish(state, catalog, plan, nowIsoLocal)`** → `{ nextState, perDraft }`

- 그룹을 순서대로 적용한다.
- 각 그룹은 원자적: op 중 하나라도 throw 하면 해당 그룹의 부분 상태를 버리고 사유를 기록한 뒤 다음 그룹을 계속한다.
- 성공한 그룹의 draft 만 삭제 대상이다 (FR-42.6).

스토어의 `finish(state, catalog, nowIsoLocal, scope)` 는 플래너 + 실행기를 래핑하고,
성공한 칸만 `drafts` 에서 제거한다.

### ADR-45: 「이 단계 중단」과 다지기 제안

「이 단계 중단」은 즉시 기록하지 않고 `markAbandoned(key, bool)` 로 칸에 `abandoned` 표시만 한다.

- `markAbandoned(key, true)` 호출 직후 UI 가 `canConsolidate` 를 확인해 가능하면 다지기를 제안한다.
- 승인 시 `beginConsolidation(startedAt, state, catalog, id, linkedTo)` 가
  `planConsolidation(state, catalog, id)` 로 목표를 만들어 다지기 칸을 연다 (OQ-23 해소: post-abandon 계획과 동일).
- 취소(`markAbandoned(key, false)`) 시, 연결된 다지기 칸이 있으면 함께 닫을지 묻는다 (EC-94).
  세트는 보존된다.

### ADR-46: FinishBar · FinishDialog 배치

- **FinishBar**: 「자유 운동 기록」 위 페이지 흐름 안에 위치. sticky 아님.
- **FinishDialog**: `src/lib/ui/session/FinishDialog.svelte`. 그룹별 요약을 보인다.
- **FreeExerciseForm**: `beginFree` 로 자유 운동 칸만 연다. 즉시 `applySession` 하지 않는다.
  세트·RPE 입력은 카드로 이동.

### ADR-47: ExerciseCard 개선

- 카드는 `inProgress.drafts[draftKey(plan.progressionId, plan.kind)]` 에 바인딩한다.
- 카드 내용:
  - 세트 행(수정·삭제), N 초과 세트는 「추가 세트」 표시, 미달 행에 「{값} / 목표 {목표} · 미달」
  - 「세션 완료 기록」(`data-finalize`) 버튼 없앰
  - 「불가능」 → 「이 단계 중단」 토글(`data-abandon-mark`)
- 중단 표시된 카드는 입력 영역을 CSS 로 접는다.
- 다지기 칸은 work 카드 바로 아래 별도 ExerciseCard 로 렌더링되며, 칸의 `target` 스냅샷에서 목표를 읽는다.

### ADR-48: 날 넘긴 칸 처리 (`staleDrafts`)

- `staleDrafts(drafts, today)` 는 `src/lib/ui/session/stale.ts` 의 순수 함수.
- StaleBanner 는 화면 맨 위에 위치. 날짜별로 묶어 「그 날짜로 기록」 / 「버리기(2단 확인)」를 제공.
- 오늘 카드는 `draft.startedAt === today` 인 칸만 렌더링한다.
- `isStaleStartedAt` 과 `data-stale` 훅은 제거된다.

---

## 데이터 모델

### 진행 중 저장 (v5, `bigsix.session.inprogress`)

```ts
// 봉투
interface InProgressEnvelopeV5 {
  schemaVersion: 5;   // IN_PROGRESS_SCHEMA_VERSION
  drafts: Record<string, SessionDraft>;
}

// 칸 타입 (ADR-42)
interface SessionDraft {
  startedAt: string;
  progressionId: ProgressionId;
  step: number;
  performedStep: number;
  kind: 'work' | 'consolidation' | 'free';
  workSets: SetEntry[];
  target?: SessionTarget;
  abandoned?: boolean;
  linkedTo?: string;
}
```

기존 `InProgressSession` 타입은 v5 이후 사용하지 않는다.
`SetEntry` 타입(`storage.ts:84`)은 변경 없이 재사용한다.

### AppState 봉투 (v4, `bigsix.state`) — 변경 없음

`APP_STATE_SCHEMA_VERSION = 4` 로 고정. 내보내기 JSON 의 `meta.schemaVersion` 도 4.

### 스토어 API (`src/lib/ui/session/session.svelte.ts`)

```ts
class InProgressStore {
  get drafts(): Record<string, SessionDraft>
  get saveStatus(): 'ok' | 'write-blocked'

  init(loaded: Record<string, SessionDraft>): void
  getDraft(id: ProgressionId, kind: DraftKind, onDate?: string): SessionDraft | undefined

  beginWork(startedAt: IsoDate, plan: PlannedExercise): boolean  // true=started, false=key blocked
  beginFree(startedAt: IsoDate, id: ProgressionId, step: number): boolean  // true=started, false=key blocked
  beginConsolidation(startedAt: IsoDate, state: AppState, catalog: Catalog,
                     id: ProgressionId, linkedTo: string): void

  pushSet(key: string, entry: SetEntry): void
  updateSet(key: string, index: number, entry: SetEntry): void
  removeSet(key: string, index: number): void

  markAbandoned(key: string, abandoned: boolean): void
  discardDraft(key: string): void
  discardAll(): void
  finish(state: AppState, catalog: Catalog,
         nowIsoLocal: string, scope?: FinishScope): FinishResult
}
```

모든 변경은 불변(spread) 으로 처리한다. Svelte 반응성을 유지하기 위함이다 (R-3).

---

### ADR-49: DoneCard — 오늘 이미 기록한 종목 (FR-46)

오늘 날짜로 정규 기록(`kind: 'work'` 또는 `'consolidation'`, `outcome: 'abandoned'` 포함; `kind: 'free'` 제외)이
하나라도 있는 계획 종목(`paired` 포함)은 **DoneCard** 를 렌더링한다.

「기록되었는지」 신호는 `state.history` 에서 읽는다 — 진행 중 칸(draft)이 아니다(EC-102).

**CSS 가시성 전환 (Correction 1 적용)**: CLAUDE.md 는 「접기는 CSS 로 한다. `{#if}` 로 DOM 에서 빼지 않는다」를
강제한다. 따라서 각 계획 종목에 대해 ExerciseCard 와 DoneCard **둘 다** 렌더링하고,
`recordedToday(...).length > 0` 결과에 따라 CSS 클래스(`display: none`)로 가시성을 전환한다.

숨겨진 ExerciseCard 는 비활성(inert) 이어야 한다. ExerciseCard 는 사용자 입력 시점에만
`beginWork` 를 호출하므로, 버튼이 DOM 에 있어도 `display: none` 상태에서는 포인터 이벤트가
차단되어 트리거될 수 없다. PLAN 은 이 전제를 명시하고, 숨겨진 카드가 `beginWork` 를 실행할 수
없음을 완료 체크리스트에 포함한다.

### ADR-50: DoneCard 추가 세트 처리

DoneCard 에서 세트를 추가하면 그 종목의 **자유 운동 칸(`free` draft)**에 쌓인다.
단계는 그날 마지막 정규 기록의 `performedStep` 을 쓴다(EC-103).

`beginFree(startedAt, progressionId, step)` 를 호출한다.
`beginFree` 는 키 충돌 시 `false` 를 반환하므로 아래 규칙으로 분기한다.

- 오늘 같은 단계의 자유 운동 칸이 이미 열려 있으면 → `pushSet` 으로 세트를 추가한다.
- 오늘 **다른 단계**의 자유 운동 칸이 열려 있으면 → 사실 문구
  「같은 종목의 자유 운동 칸이 {기존 단계}단계로 열려 있습니다 — 먼저 기록하거나 버리세요」를 표시하고
  아무것도 덮어쓰지 않는다(`data-done-extra-blocked="step-mismatch"`).
- **오래된(stale) 자유 운동 칸**이 있으면 ExerciseCard 의 stale 안내와 동일한 문구를 표시하고
  입력을 비활성으로 둔다(`data-done-extra-blocked="stale"`).

`finish.ts` 와 `session.svelte.ts` 는 자유 운동 칸을 이미 정상 처리하므로 변경하지 않는다.
단, Correction 2 에 따른 `syncDoneDrafts` 스토어 메서드가 추가된다(ADR-51 참조).

### ADR-51: syncDoneDrafts — 진행 중 칸 정합성 유지 (Correction 2)

오늘 정규 기록이 이미 있는 종목의 `work` / `consolidation` draft 를 조용히 버리지 않는다.
사용자가 입력한 세트를 잃지 않도록 아래 이전 규칙을 따르는 **순수 함수**
`syncDoneDrafts(drafts, history, today)` 를 `src/lib/ui/today/done.ts` 에 정의한다.

반환값은 `SyncAction[]` — 이 목록을 스토어 메서드 `applySync(actions)` 가 한 번의 persist 로 적용한다.

**이전 규칙**:

| 조건 | 처리 |
|------|------|
| 오늘 정규 기록이 있는 종목의 `work`/`consolidation` draft, 세트 있음 | `workSets` 를 마지막 정규 기록의 `performedStep` 으로 자유 운동 칸에 합산. 자유 운동 칸이 없으면 생성; 같은 단계이면 세트 추가; 다른 단계이면 손대지 않고 `step-mismatch` 리포트 |
| 위 조건, 세트 0개, `abandoned` 아님 | draft 삭제 |
| 위 조건, `abandoned: true`, 세트 0개 | draft 삭제 |
| 위 조건, `abandoned: true`, 세트 있음 | 세트를 자유 운동 칸으로 이전 (세트 있음 규칙과 동일) |

**호출 시점**: 부팅 시 한 번, 그 이후 `history` 또는 `drafts` 가 변경될 때마다.
함수는 멱등(idempotent)하므로 두 번 호출해도 두 번째는 액션이 0개다.

스키마 변경 없음 — v5 롤백 안전성은 ADR-43 과 동일하게 유지된다.

---

## 파일 배치

### 신설 파일

| 경로 | 역할 |
|------|------|
| `src/lib/ui/session/finish.ts` | `planFinish` · `executeFinish` · 관련 타입 (Phase 3) |
| `src/lib/ui/session/stale.ts` | `staleDrafts` 순수 함수 (Phase 2) |
| `src/lib/ui/session/summarizeDraft.ts` | 칸별 요약 문구 생성 순수 함수 (Phase 4) |
| `src/lib/ui/session/FinishBar.svelte` | 「오늘 운동 마치기」 버튼 영역 (Phase 4) |
| `src/lib/ui/session/FinishDialog.svelte` | 기록 확인 다이얼로그 (Phase 4) |
| `src/lib/ui/session/StaleBanner.svelte` | 날 넘긴 칸 안내 (Phase 5) |
| `src/lib/ui/today/done.ts` | `recordedToday` · `doneResultLabel` · `doneSetShortfall` · `syncDoneDrafts` 순수 함수 (Phase 7) |
| `src/lib/ui/session/DoneCard.svelte` | 오늘 기록 완료 종목 카드 (Phase 7) |
| `tests/unit/session/storage-v5.test.ts` | storage v5 단위 테스트 (Phase 1) |
| `tests/unit/session/inprogress.test.ts` | 스토어 단위 테스트 (Phase 2) |
| `tests/unit/session/finish.test.ts` | planFinish · executeFinish 단위 테스트 (Phase 3) |
| `tests/unit/today/done.test.ts` | done.ts 순수 함수 단위 테스트 (Phase 7) |

### 수정 파일

| 경로 | 변경 내용 |
|------|----------|
| `src/lib/ui/state/storage.ts` | `APP_STATE_SCHEMA_VERSION` · `IN_PROGRESS_SCHEMA_VERSION` 분리, `InProgressEnvelope` v5 타입, v4→v5 마이그레이션, `InProgressSession` → `SessionDraft` (Phase 1) |
| `src/lib/ui/session/session.svelte.ts` | 전면 재작성 — 칸 목록 스토어 (Phase 2) |
| `src/lib/ui/session/ExerciseCard.svelte` | 칸 바인딩, 미달·추가 표시, 「이 단계 중단」 토글 (Phase 4) |
| `src/lib/ui/session/FreeExerciseForm.svelte` | 즉시 기록 제거, `beginFree` 만 호출 (Phase 4) |
| `src/routes/+page.svelte` | StaleBanner · FinishBar · FinishDialog 연결, 다지기 제안 연동 (Phase 4/5); DoneCard 카드 전환 · `syncDoneDrafts` 호출 (Phase 7) |
| `src/lib/ui/state/boot.ts` | `InProgressSession` → `drafts` 맵 복원 (Phase 2) |
| `src/lib/ui/history/ExportBar.svelte` | `hasInProgress` → drafts 비어 있는지 검사 (Phase 5) |
| `src/lib/ui/state/reset.ts` | `inProgress.discard()` → `inProgress.discardAll()` (Phase 5) |
| `tests/unit/inprogress.test.ts` | 기존 테스트를 새 API 에 맞게 갱신 (Phase 2) |
| `tests/unit/boot.test.ts` | 복원 경로 갱신 (Phase 2) |
| `tests/unit/structure.test.ts` | `UI_UNDER` 에 `'history'` 추가 (phase 4 시 확인) |
| `README.md` | 세션 흐름 설명 추가 (Phase 6); DoneCard 한 줄 추가 (Phase 7) |
| `CHANGELOG.md` | `[Unreleased]` 항목 추가 (Phase 6); DoneCard Changed 항목 추가 (Phase 7) |
| `CLAUDE.md` | 훅 목록 · 문서 지도 갱신 (Phase 6); SPEC5 블록에 DoneCard 훅 추가 (Phase 7) |

---

## 페이즈 지도

단일 워크트리, 순차 실행.

| 페이즈 | 키워드 | 설명 | 상태 | 선행 조건 |
|--------|--------|------|------|----------|
| 1 | storage-v5 | 저장 스키마 v5 (ADR-43) | Complete | — |
| 2 | store-drafts | 스토어 칸 목록 API (ADR-41/42/45) | Complete | 1 |
| 3 | finish-pure | 순수 플래너·실행기 (ADR-44) | Complete | 2 |
| 4 | ui-cards | 카드 개선·FinishBar·FinishDialog (ADR-46/47) | Complete | 3 |
| 5 | stale-and-boot | StaleBanner·부팅·초기화 (ADR-48) | Complete | 4 |
| 6 | docs-and-deploy | README·CHANGELOG·CLAUDE.md·배포 | In Progress (배포·폰 확인 대기) | 5 |
| 7 | done-cards | DoneCard·syncDoneDrafts (ADR-49/50/51) | Pending | Phase 5 코드. Phase 6 의 배포·폰 확인과 병행 — 두 페이즈가 임시 배포를 공유한다 |

---

## 위험 목록

| ID | 내용 | 완화 |
|----|------|------|
| R-1 | v4 진행 중 세션에 target 이 있을 때 마이그레이션이 target 을 잃는다 | v4→v5 migrator 에서 target 필드를 그대로 복사한다 |
| R-2 | Phase 1~3 중간 커밋이 빌드·테스트를 깨트린다 | Phase 1 에 `writeInProgress` 호환 래퍼를 두고, Phase 2 에 `finalize`/`abandon` 임시 래퍼를 둔다. Phase 4 에서 제거 |
| R-3 | 스토어 내부에서 `drafts` 의 중첩 객체를 직접 변경하면 Svelte 반응성이 끊긴다 | 모든 변경을 `{ ...drafts, [key]: { ...draft, ... } }` spread 로 처리한다 |
| R-4 | FinishDialog 의 summary 문구에 판정 결과·격려 표현이 섞인다 | summary 는 「종목 단계: 정규 N세트 · 추가 M세트」 형식의 사실 문구만. NFR-2 준수 |
| R-5 | ExerciseCard 등 컴포넌트에 DOM 테스트 인프라가 없어 UI 로직을 직접 테스트할 수 없다 | 기록 규칙(`planFinish`/`executeFinish`)·레이블 생성(`summarizeDraft`) 을 순수 함수로 분리해 단위 테스트한다 |
| R-6 | 기존 `sw-importscripts` · `precache-parity` 빌드 테스트가 이미 알려진 flaky 상태다 | 이 개정 범위 밖. 테스트 결과에서 제외하거나 skip 처리된 상태를 그대로 유지한다 |
| R-7 | v5 in-progress 봉투가 기록된 기기에서 v0.3.0(main)으로 롤백하면 in-progress 칸이 읽히지 않는다 | v0.3.0 의 `readInProgress()`(`storage.ts:348`)가 `future-version` 을 반환하고, `boot.ts:120` 이 `null` 로 조용히 처리한다 — 차단 없음. 기록(AppState)은 `APP_STATE_SCHEMA_VERSION = 4` 그대로여서 안전하다 |
| R-8 | DoneCard 가 정규 기록이 많을 때 길어진다 | 세트 행은 단순 나열. 긴 카드는 스크롤로 해결한다. 별도 접기 UI 없음 |
| R-9 | 자유 운동 칸이 다른 단계(`step-mismatch`)로 열려 있으면 DoneCard 에서 세트를 추가할 수 없다 | 사실 문구(`data-done-extra-blocked="step-mismatch"`)를 표시해 사용자가 직접 처리하도록 안내한다 |
| R-10 | `$effect` 로 `syncDoneDrafts` 를 호출할 때 history 또는 drafts 갱신 → sync 액션 → drafts 재갱신 → 루프가 생길 수 있다 | `syncDoneDrafts` 가 멱등하므로 두 번째 호출은 액션이 0개이다. `applySync(actions)` 는 actions 가 빈 배열이면 즉시 반환하므로 루프가 수렴한다 |
| R-11 | 이미 배포된 버전(0.4.0 이전 브랜치 빌드)에서 같은 날 두 번 정규 기록이 쌓인 히스토리가 있을 수 있다 | `syncDoneDrafts` 는 이미 있는 기록을 삭제하거나 수정하지 않는다. CHANGELOG 알려진 한계에 명시한다 |
| R-12 | DoneCard 헤더가 계획의 `step` 을 쓰면 실제 수행 단계와 다를 수 있다(예: 다지기) | DoneCard 헤더는 마지막 정규 기록의 `step` / `performedStep` / 단계명을 쓴다 — 계획의 값을 쓰지 않는다 |
| R-13 | Phase 7 는 스키마를 변경하지 않으므로 롤백 시 기록이 안전하다 | 스키마 버전은 ADR-43 에서 정한 값 그대로다. DoneCard 는 표시 계층 변경만이다 |
