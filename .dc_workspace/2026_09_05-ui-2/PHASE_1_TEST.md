# Phase 1 — TEST (FR-20)

Phase 1 의 각 커밋에서 통과해야 하는 테스트 명세. 파일별로 삭제/재작성/신규를 명시한다.

## 테스트 러너

- `pnpm test` (`vitest run`)
- 브라우저 API 를 쓰는 신규 파일이 없다면 `node` 환경(기본) 그대로. `storage.ts` 는 localStorage 접근이지만 이미 `happy-dom` 으로 마운트된 테스트가 있다 (기존 방식 유지).

---

## 삭제 대상

### `tests/unit/plan.test.ts`

- [ ] `test('워밍업은 최대 2세트, 3단계부터는 직전 두 단계의 중급자 기준', ...)` (line 128~134) — `planWarmup` 소멸
- [ ] 다른 `planExercise` / `planConsolidation` 케이스에서 `p.warmup` 을 assertion 하는 라인 검색·삭제 (grep `warmup`)

### `tests/unit/calendar.test.ts`

- [ ] `warmup` 참조 케이스 검색·삭제. 약 2건.

### `tests/unit/session.test.ts`

- [ ] `warmup` 참조 케이스 검색·삭제. 약 2건.

### `tests/unit/boot.test.ts`

- [ ] `warmup` 참조 검색·삭제. 약 1건.

### `tests/unit/inprogress.test.ts`

- [ ] `pushWarmupSet` / `updateWarmupSet` 관련 케이스 전문 삭제 (약 4건)
- [ ] `warmupSets: []` assertion 만 있는 케이스는 어떤 sample 이라도 삭제하지 않고 `workSets: []` 확인으로 재작성

### `tests/unit/storage.test.ts`

- [ ] `warmupSets` 필드 검증 케이스 삭제 (약 2~3건)

---

## 재작성 대상

### `tests/unit/inprogress.test.ts`

- [ ] `beginWork` / `begin` 후 `warmupSets: []` assertion 이 있는 케이스는 `workSets: []` 확인만 남기고 warmup 관련 라인 삭제

### `tests/unit/storage.test.ts`

- [ ] 라운드트립 케이스: `CURRENT_SCHEMA_VERSION = 3` 반영. `InProgressEnvelope` fixture 에서 `warmupSets` 필드 없이 저장·복원

---

## 신규 대상

### `tests/unit/storage.test.ts`

- [ ] **EC-48**: "v2 봉투에 `warmupSets` 가 있어도 무시하고 v3 로 읽는다"
  - 배치: `localStorage.setItem('bigsix.session.inprogress', JSON.stringify({ schemaVersion: 2, inProgress: { startedAt: '2026-09-05', progressionId: 'pushup', step: 3, performedStep: 3, kind: 'work', warmupSets: [{value: 5}, {value: 10}], workSets: [{value: 20}] } }))`
  - 실행: `readInProgress()`
  - 검증: `status === 'ok'`, `value.workSets` 는 그대로 살아 있음, `value` 에 `warmupSets` 키 없음
  - 근거: FR-20.3, EC-48

- [ ] "v3 라운드트립 — 저장한 그대로 읽는다" (기존 케이스가 이 형태로 다시 세팅됨)

### `tests/unit/inprogress.test.ts`

- [ ] "session 시작 시 workSets 만 비어 있고 warmup 관련 필드가 없다" (기존 assertion 재작성 결과)

---

## 검사 절차

### Commit 1 (도메인) 종료 후

1. `pnpm test` — 신규 실패 0
2. `pnpm run check` — 오류 0, 경고 0
3. `grep -rn "planWarmup\|maxWarmupSets\|\.warmup" src/lib/domain/` — 0건
4. `grep -rn "warmup" tests/unit/` — plan.test.ts 의 관련 케이스가 사라졌는지 확인 (남으면 재작성 대상)
5. 삭제된 테스트 수 카운트 → 커밋 메시지에 반영

### Commit 2 (UI · 저장) 종료 후

1. `pnpm test` — 예상 550~555개 통과
2. `pnpm run check` — 오류 0, 경고 0
3. `grep -rn "warmup\|WarmupSet" src/lib/ui/ src/routes/` — 0건
4. EC-48 케이스가 실제 존재하는지 확인 (`grep -l "warmupSets" tests/unit/storage.test.ts` 에서 v2 마이그레이션 테스트만 남아야 함)
5. 삭제된 테스트 수 카운트 → 커밋 메시지에 반영

---

## Edge Case 커버

| EC | 처리 |
|---|---|
| EC-48 | `storage.test.ts` 신규 케이스 |

## 통과 기준

- [ ] `pnpm test` 전부 통과
- [ ] `pnpm run check` 0/0
- [ ] SPEC2 FR-20 전 하위 항목 반영
- [ ] 커밋 메시지에 「삭제/재작성/신규 테스트 수와 사유」 명시 (FR-20.6)
