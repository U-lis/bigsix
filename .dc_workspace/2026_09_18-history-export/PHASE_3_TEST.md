# Phase 3 — TEST 체크리스트

## 스토리지 (FR-28.6, ADR-22)

- [x] `tests/unit/storage.test.ts` — `CURRENT_SCHEMA_VERSION === 4`. ✓ consistency.test.ts:125, storage.test.ts:367
- [x] `tests/unit/storage.test.ts` — `readAppState` 가 v3 봉투(`{schemaVersion: 3, appState}`) 를 마이그레이션 후 정상 복원. ✓ storage.test.ts:371-382
- [x] `tests/unit/storage.test.ts` — `readInProgress` 가 v3 봉투를 마이그레이션 후 정상 복원. ✓ storage.test.ts:404-426 (target 없는 v3 봉투 읽기)
- [x] `tests/unit/storage.test.ts` — `InProgressSession.target` 이 있는 봉투를 쓰고 읽으면 `target` 이 깊은 동등으로 복원. ✓ storage.test.ts:384-402
- [x] `tests/unit/storage.test.ts` — `target` 없는 v3 봉투를 v4 로 마이그레이션한 뒤 읽으면 `target === undefined`. ✓ storage.test.ts:404-426
- [x] `tests/unit/storage.test.ts` — `isInProgressShape` 가 target 있는·없는 두 형태 모두 통과. ✓ storage.test.ts:428
- [x] `tests/unit/storage.test.ts` — `isInProgressShape` 가 target 형태 어긋난 값(`{goal: null}` 등)을 거절. ✓ storage.test.ts:449-484
- [x] `tests/unit/storage.test.ts` — `validateAndMigrateAppStateEnvelope({schemaVersion: 4, appState})` 반환 `{ok: true, state}`. ✓ storage.test.ts:490-497
- [x] `tests/unit/storage.test.ts` — `validateAndMigrateAppStateEnvelope({schemaVersion: 99, appState})` 반환 `{ok: false, reason: 'future-version', version: 99}`. ✓ storage.test.ts:499-510
- [x] `tests/unit/storage.test.ts` — `validateAndMigrateAppStateEnvelope({schemaVersion: 4, appState: {broken}})` 반환 `{ok: false, reason: 'corrupt'}`. ✓ storage.test.ts:512-519
- [x] `tests/unit/consistency.test.ts` — 상수 v4 확인. ✓ consistency.test.ts:125

## 진행 중 세션 (FR-28.3, ADR-22)

- [x] `tests/unit/inprogress.test.ts` — `begin(startedAt, plan)` 후 `store.value.target` 이 `{ goal: plan.goal, work: plan.work }` 와 깊은 동등. ✓ inprogress.test.ts:331-352
- [x] `tests/unit/inprogress.test.ts` — `beginFree(...)` 후 `store.value.target === undefined`. ✓ inprogress.test.ts (beginFree 절 — target 필드 없음 확인)
- [x] `tests/unit/inprogress.test.ts` — 세트마다 `rpe` 를 넣고 `finalize` → `record.setRpes` 가 세트 수와 같은 길이의 배열, 미입력 자리는 `null`. ✓ inprogress.test.ts:358-365
- [x] `tests/unit/inprogress.test.ts` — `finalize` 후 `record.completedAt` 이 로컬 오프셋 포함 ISO 문자열. ✓ inprogress.test.ts:368-374
- [x] `tests/unit/inprogress.test.ts` — `finalize` 후 `record.target.goal` 이 begin 시점 스냅샷과 동등. ✓ inprogress.test.ts:376-384
- [x] `tests/unit/inprogress.test.ts` — `abandon` 도 completedAt/setRpes/target 을 record 에 남긴다. ✓ inprogress.test.ts:404-418

## 도메인 (FR-28.5, ADR-23)

- [x] `tests/unit/session.test.ts` — `abandonChallenge(state, catalog, id, date, sets, rpe, {target, setRpes, completedAt})` 의 record 에 세 필드 존재. ✓
- [x] `tests/unit/session.test.ts` — `recordConsolidation(state, catalog, id, date, sets, rpe, {target, setRpes, completedAt})` 의 record 에 세 필드 존재. ✓
- [x] `tests/unit/session.test.ts` — 기존 6인자 호출이 그대로 통과. record 에 세 필드는 `undefined`. ✓
- [x] `tests/unit/session.test.ts` — `extras.setRpes.length !== sets.length` 인 입력은 판정에 영향 없음 (FR-28.2). ✓
- [x] `tests/unit/evaluate.test.ts` — `applySession` 스프레드로 세 필드 담기. ✓
- [x] `tests/unit/evaluate.test.ts` — 판정(승급·유지·강등) 이 새 세 필드에 영향받지 않음 (FR-28.2). ✓ `evaluateSession` 은 rpe/sets/kind/outcome/step/progressionId 만 참조.

## 시각 근원 (FR-28.4, ADR-24)

- [x] `tests/unit/today.test.ts` — `todayClock.setClock({now: () => fixed})` 주입 후 `nowIsoLocal()` 이 결정적 결과. ✓ today.test.ts:94-100
- [x] `tests/unit/today.test.ts` — 반환 형식이 `YYYY-MM-DDTHH:mm:ss±HH:MM`. ✓ today.test.ts:105-106
- [x] `tests/unit/today.test.ts` — UTC 환경에서 오프셋 표기가 `+00:00`. ✓ today.test.ts:62-65 (`formatIsoLocal(d, 0)`)
- [x] `grep -rnE "new Date\\(\\)" src/lib/ui --include='*.svelte'` — 결과 0건. ✓ 실측 확인

## NFR-25

- [x] 매 커밋: `pnpm check` 0/0 — 실측 결과 **0 ERRORS 0 WARNINGS** (2026-09-21).
- [x] 테스트 수: Phase 2 종료 시점(664) + 43 = **707 tests (30 files)** — 실측 통과 확인 (2026-09-21).
