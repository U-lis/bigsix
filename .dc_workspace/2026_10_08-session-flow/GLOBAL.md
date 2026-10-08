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

  beginWork(startedAt: IsoDate, plan: PlannedExercise): void
  beginFree(startedAt: IsoDate, id: ProgressionId, step: number): void
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

## 파일 배치

### 신설 파일

| 경로 | 역할 |
|------|------|
| `src/lib/ui/session/finish.ts` | `planFinish` · `executeFinish` · 관련 타입 (Phase 3) |
| `src/lib/ui/session/stale.ts` | `staleDrafts` 순수 함수 (Phase 5) |
| `src/lib/ui/session/FinishBar.svelte` | 「오늘 운동 마치기」 버튼 영역 (Phase 4) |
| `src/lib/ui/session/FinishDialog.svelte` | 기록 확인 다이얼로그 (Phase 4) |
| `src/lib/ui/session/StaleBanner.svelte` | 날 넘긴 칸 안내 (Phase 5) |
| `tests/unit/session/storage-v5.test.ts` | storage v5 단위 테스트 (Phase 1) |
| `tests/unit/session/inprogress.test.ts` | 스토어 단위 테스트 (Phase 2) |
| `tests/unit/session/finish.test.ts` | planFinish · executeFinish 단위 테스트 (Phase 3) |

### 수정 파일

| 경로 | 변경 내용 |
|------|----------|
| `src/lib/ui/state/storage.ts` | `APP_STATE_SCHEMA_VERSION` · `IN_PROGRESS_SCHEMA_VERSION` 분리, `InProgressEnvelope` v5 타입, v4→v5 마이그레이션, `InProgressSession` → `SessionDraft` (Phase 1) |
| `src/lib/ui/session/session.svelte.ts` | 전면 재작성 — 칸 목록 스토어 (Phase 2) |
| `src/lib/ui/session/ExerciseCard.svelte` | 칸 바인딩, 미달·추가 표시, 「이 단계 중단」 토글 (Phase 4) |
| `src/lib/ui/session/FreeExerciseForm.svelte` | 즉시 기록 제거, `beginFree` 만 호출 (Phase 4) |
| `src/routes/+page.svelte` | StaleBanner · FinishBar · FinishDialog 연결, 다지기 제안 연동 (Phase 4/5) |
| `src/lib/ui/state/boot.ts` | `InProgressSession` → `drafts` 맵 복원 (Phase 2) |
| `src/lib/ui/history/ExportBar.svelte` | `hasInProgress` → drafts 비어 있는지 검사 (Phase 5) |
| `src/lib/ui/state/reset.ts` | `inProgress.discard()` → `inProgress.discardAll()` (Phase 5) |
| `tests/unit/inprogress.test.ts` | 기존 테스트를 새 API 에 맞게 갱신 (Phase 2) |
| `tests/unit/boot.test.ts` | 복원 경로 갱신 (Phase 2) |
| `tests/unit/structure.test.ts` | `UI_UNDER` 에 `'history'` 추가 (phase 4 시 확인) |
| `README.md` | 세션 흐름 설명 추가 (Phase 6) |
| `CHANGELOG.md` | `[Unreleased]` 항목 추가 (Phase 6) |
| `CLAUDE.md` | 훅 목록 · 문서 지도 갱신 (Phase 6) |

---

## 페이즈 지도

단일 워크트리, 순차 실행.

| 페이즈 | 키워드 | 설명 | 상태 | 선행 조건 |
|--------|--------|------|------|----------|
| 1 | storage-v5 | 저장 스키마 v5 (ADR-43) | 대기 | — |
| 2 | store-drafts | 스토어 칸 목록 API (ADR-41/42/45) | 대기 | 1 |
| 3 | finish-pure | 순수 플래너·실행기 (ADR-44) | 대기 | 2 |
| 4 | ui-cards | 카드 개선·FinishBar·FinishDialog (ADR-46/47) | 대기 | 3 |
| 5 | stale-and-boot | StaleBanner·부팅·초기화 (ADR-48) | 대기 | 4 |
| 6 | docs-and-deploy | README·CHANGELOG·CLAUDE.md·배포 | 대기 | 5 |

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
