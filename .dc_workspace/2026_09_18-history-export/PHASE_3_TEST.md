# Phase 3 — TEST 체크리스트

## 스토리지 (FR-28.6, ADR-22)

- [ ] `tests/unit/storage.test.ts` — `CURRENT_SCHEMA_VERSION === 4`.
- [ ] `tests/unit/storage.test.ts` — `readAppState` 가 v3 봉투(`{schemaVersion: 3, appState}`) 를 마이그레이션 후 정상 복원.
- [ ] `tests/unit/storage.test.ts` — `readInProgress` 가 v3 봉투를 마이그레이션 후 정상 복원.
- [ ] `tests/unit/storage.test.ts` — `InProgressSession.target` 이 있는 봉투를 쓰고 읽으면 `target` 이 깊은 동등으로 복원.
- [ ] `tests/unit/storage.test.ts` — `target` 없는 v3 봉투를 v4 로 마이그레이션한 뒤 읽으면 `target === undefined`.
- [ ] `tests/unit/storage.test.ts` — `isInProgressShape` 가 target 있는·없는 두 형태 모두 통과.
- [ ] `tests/unit/storage.test.ts` — `isInProgressShape` 가 target 형태 어긋난 값(`{goal: null}` 등)을 거절.
- [ ] `tests/unit/storage.test.ts` — `validateAndMigrateAppStateEnvelope({schemaVersion: 4, appState})` 반환 `{ok: true, state}`.
- [ ] `tests/unit/storage.test.ts` — `validateAndMigrateAppStateEnvelope({schemaVersion: 99, appState})` 반환 `{ok: false, reason: 'future-version', version: 99}`.
- [ ] `tests/unit/storage.test.ts` — `validateAndMigrateAppStateEnvelope({schemaVersion: 4, appState: {broken}})` 반환 `{ok: false, reason: 'corrupt'}`.
- [ ] `tests/unit/consistency.test.ts` — 상수 v4 확인.

## 진행 중 세션 (FR-28.3, ADR-22)

- [ ] `tests/unit/inprogress.test.ts` — `begin(startedAt, plan)` 후 `store.value.target` 이 `{ goal: plan.goal, work: plan.work }` 와 깊은 동등.
- [ ] `tests/unit/inprogress.test.ts` — `beginFree(...)` 후 `store.value.target === undefined`.
- [ ] `tests/unit/inprogress.test.ts` — 세트마다 `rpe` 를 넣고 `finalize` → `record.setRpes` 가 세트 수와 같은 길이의 배열, 미입력 자리는 `null`.
- [ ] `tests/unit/inprogress.test.ts` — `finalize` 후 `record.completedAt` 이 로컬 오프셋 포함 ISO 문자열 (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/`).
- [ ] `tests/unit/inprogress.test.ts` — `finalize` 후 `record.target.goal` 이 begin 시점 스냅샷과 동등 (steps 를 중간에 흔들어도 완료 시점 재계산이 아님을 확인).
- [ ] `tests/unit/inprogress.test.ts` — `abandon` 도 completedAt/setRpes/target 을 record 에 남긴다.

## 도메인 (FR-28.5, ADR-23)

- [ ] `tests/unit/session.test.ts` — `abandonChallenge(state, catalog, id, date, sets, rpe, {target, setRpes, completedAt})` 의 record 에 세 필드 존재.
- [ ] `tests/unit/session.test.ts` — `recordConsolidation(state, catalog, id, date, sets, rpe, {target, setRpes, completedAt})` 의 record 에 세 필드 존재.
- [ ] `tests/unit/session.test.ts` — 기존 6인자 호출(`(state, catalog, id, date, sets, rpe)`) 이 그대로 통과. record 에 세 필드는 `undefined`.
- [ ] `tests/unit/session.test.ts` — `extras.setRpes.length !== sets.length` 인 입력은 도메인이 그대로 record 에 실을 뿐 판정에 영향 없음 (FR-28.2).
- [ ] `tests/unit/evaluate.test.ts` — `applySession(state, catalog, {..., target, setRpes, completedAt})` 의 record 가 새 세 필드를 스프레드로 담고 있음.
- [ ] `tests/unit/evaluate.test.ts` — `applySession` 판정(승급·유지·강등) 이 새 세 필드에 영향받지 않음 (FR-28.2).

## 시각 근원 (FR-28.4, ADR-24)

- [ ] `tests/unit/today.test.ts` — `todayClock.setClock({now: () => fixed})` 주입 후 `nowIsoLocal()` 이 결정적 결과.
- [ ] `tests/unit/today.test.ts` — 반환 형식이 `YYYY-MM-DDTHH:mm:ss±HH:MM`.
- [ ] `tests/unit/today.test.ts` — `getTimezoneOffset` 값이 0 인 UTC 환경에서 오프셋 표기가 `+00:00`.
- [ ] `grep -rnE "new Date\\(\\)" src/lib/ui --include='*.svelte'` — 결과 0건 (컴포넌트에서 `new Date()` 금지 규약).

## NFR-25

- [ ] 매 커밋: `pnpm check` 0/0, `pnpm test` 전부 통과.
- [ ] 테스트 수: Phase 2 종료 시점 + N (신규 케이스 15개 안팎).
