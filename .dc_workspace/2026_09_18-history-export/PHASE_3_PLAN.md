# Phase 3 — 스키마 v4 & 세션 기록 보강

**목표**
FR-28 을 완결한다. 도메인 · 스토리지 · 세션 스토어 · 시각 근원까지. 이 페이즈 이후로 새로 완결되는 세션은 목표 · 세트별 RPE · 완료 시각을 기록에 남긴다.

## SPEC 참조

- FR-28.1: `SessionInput` 에 `target?`, `setRpes?`, `completedAt?` 추가.
- FR-28.2: 기존 `rpe` 는 그대로. 판정은 계속 `rpe` 만 본다.
- FR-28.3: `target` 은 `begin` 때 `InProgressSession` 에 저장, 완료 시 넘긴다.
- FR-28.4: `completedAt` 은 UI 가 채운다. `todayClock` / `Clock` 규약. 컴포넌트에서 `new Date()` 금지.
- FR-28.5: `abandonChallenge` · `recordConsolidation` 도 새 필드 받는다.
- FR-28.6: `CURRENT_SCHEMA_VERSION` 3 → 4. 마이그레이션 no-op. 옛 진행 중 세션은 target 없이 완료된다.

## 변경 파일

- `src/lib/domain/types.ts` — `SessionTarget` 신설. `SessionInput` 에 `target?`, `setRpes?`, `completedAt?` 추가 (선택).
- `src/lib/domain/session.ts` — `abandonChallenge`, `recordConsolidation` 시그니처에 `extras?: SessionExtras` 붙임. 값이 있으면 `input.target/setRpes/completedAt` 로 전달.
- `src/lib/domain/index.ts` — `SessionTarget`, `SessionExtras` 타입 export 추가.
- `src/lib/ui/state/storage.ts`:
  - `CURRENT_SCHEMA_VERSION = 4`.
  - `APP_STATE_MIGRATIONS[3]` : v3→v4 no-op 마이그레이터.
  - `IN_PROGRESS_MIGRATIONS[3]` : v3→v4 no-op 마이그레이터.
  - `InProgressSession.target?: SessionTarget` 필드 추가.
  - `isInProgressShape` : target 있으면 `{ goal, work }` 형태만 검사, 없으면 통과.
  - `validateAndMigrateAppStateEnvelope(envelope)` export 추가 — 내부에서 `migrateAppStateEnvelope` + `isAppStateShape` 를 묶는다.
- `src/lib/ui/session/session.svelte.ts`:
  - `begin(startedAt, plan)` — `plan.goal`, `plan.work` 을 `InProgressSession.target` 에 저장.
  - `beginFree` — target 없이 시작 (변경 없음).
  - `finalize` — `extras = { target: s.target, setRpes: s.workSets.map(e => e.rpe ?? null), completedAt: todayClock.nowIsoLocal() }` 를 구성. `recordConsolidation` 이면 `extras` 로 넘김. `applySession` 이면 `input.target = extras.target` 등으로 직접 넣는다.
  - `abandon` — `abandonChallenge(..., rpe, extras)` 로 세 필드 전달.
- `src/lib/ui/state/today.svelte.ts`:
  - `Clock` 인터페이스 export (또는 `session/timer` 에서 재사용) 및 `setClock(clock: Clock)` 훅.
  - `nowIsoLocal(): string` 추가. 반환 형식 `YYYY-MM-DDTHH:mm:ss±HH:MM`. 내부는 `Date` 하나에서 `getFullYear/Month/Date/Hours/Minutes/Seconds/getTimezoneOffset` 을 조합.
- `tests/unit/storage.test.ts` — v3→v4 no-op 마이그레이션, `InProgressSession.target` 저장/복원, `validateAndMigrateAppStateEnvelope` 세 시나리오.
- `tests/unit/inprogress.test.ts` — begin 시 target 스냅샷 저장, finalize/abandon 시 completedAt/setRpes 전달.
- `tests/unit/session.test.ts` — abandonChallenge · recordConsolidation extras 로 세 필드 전달 시 record 에 남는다. 기존 6인자 호출도 통과 (backward-compat).
- `tests/unit/evaluate.test.ts` — applySession 이 새 세 필드를 record 로 스프레드.
- `tests/unit/today.test.ts` — nowIsoLocal 형식과 Clock 주입 결정성.
- `tests/unit/consistency.test.ts` — `CURRENT_SCHEMA_VERSION === 4`.

## 커밋 경계 (3개)

1. `feat(domain): SessionInput 에 target · setRpes · completedAt 추가`
   - `types.ts`, `session.ts` (extras 옵션), `index.ts` (타입 export), `evaluate.test`, `session.test`.
2. `feat(state): 봉투 스키마 v4 와 InProgressSession.target`
   - `storage.ts` (CURRENT=4, 마이그레이션, target 필드, `validateAndMigrateAppStateEnvelope`), `storage.test`, `consistency.test`.
3. `feat(ui): todayClock.nowIsoLocal 과 세션 완료 필드 채우기`
   - `today.svelte.ts`, `session.svelte.ts`, `today.test`, `inprogress.test`.

## 완료 기준

- 완결된 세션의 `record` 에 `target`/`setRpes`/`completedAt` 이 실제로 남는다 (통합 테스트).
- 옛 봉투(v3)를 읽어도 마이그레이션이 오류 없이 v4 로 올라간다.
- `todayClock.nowIsoLocal()` 이 로컬 오프셋 포함 문자열을 낸다.
- 매 커밋에서 `pnpm check` 0/0, `pnpm test` 전부 통과. 테스트 수 이전 페이즈 이상.

## 임시 배포

이 페이즈에 포함하지 않는다.
