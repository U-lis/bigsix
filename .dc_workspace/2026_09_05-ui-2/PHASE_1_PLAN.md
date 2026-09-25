# Phase 1 — 워밍업 제거 (FR-20)

**목표**: 도메인 · UI · 저장 스키마에서 워밍업 개념을 전수 제거한다. `warmupSets` 를 담던 v2 봉투를 무시하고 읽는 v3 마이그레이션 경로를 만든다. 오늘 화면에 스트레칭 안내 한 줄을 둔다.

**Dependencies**: 없음 (base = `feature/ui` `0821ecc`)
**커밋 수**: 2
**예상 테스트 변화**: 561 → 약 550~555 (삭제·재작성 중심, 마이그레이션 신규 소수)
**스키마**: `CURRENT_SCHEMA_VERSION` v2 → v3

---

## Commit 1 — 도메인 · rules · 테스트 (FR-20.1 / FR-20.6)

### 도메인 코드

- [ ] **types.ts**: `PlannedExercise.warmup: TargetSet[]` 필드 삭제 (FR-20.1)
- [ ] **plan.ts**: `planWarmup` 함수 전문 삭제 (line 31~44) (FR-20.1)
- [ ] **plan.ts**: `planExercise` 반환 리터럴 `base` 에서 `warmup: planWarmup(catalog, id, n)` 제거 (line 134)
- [ ] **plan.ts**: `planConsolidation` 반환 리터럴에서 `warmup: planWarmup(catalog, id, prev.n)` 제거 (line 105)
- [ ] **plan.ts**: `withPair` 의 `paired.warmup: []` 제거 (line 218) — 필드 자체가 없으므로 그 대입도 사라진다
- [ ] **plan.ts**: `RULES.maxWarmupSets` import 제거 (line 43 소비 사라짐)
- [ ] **rules.ts**: `maxWarmupSets: 2` 상수 삭제 (line 19~20) (FR-20.1)
- [ ] **index.ts**: `planWarmup` export 제거 (line 7)

### 문서

- [ ] **docs/PROGRESSIONS.md**: 워밍업 서술(line 175 근처) 삭제 (FR-20.4)
- [ ] **docs/LOGIC.md**: 워밍업 서술(line 42 근처) 삭제 (FR-20.4)
- [ ] **docs/LOGIC.md**: `maxWarmupSets` 행(line 98 근처) 삭제 (FR-20.4)

### 테스트

- [ ] `tests/unit/plan.test.ts`: `import { planWarmup ... }` 에서 `planWarmup` 제거 (line 3)
- [ ] `tests/unit/plan.test.ts`: 테스트 "워밍업은 최대 2세트, 3단계부터는 직전 두 단계의 중급자 기준" (line 128~134) 삭제
- [ ] `tests/unit/plan.test.ts`: 다른 케이스에서 `warmup` 필드를 assertion 하는 부분 검색·삭제 (`p.warmup` grep)
- [ ] `tests/unit/calendar.test.ts`: `warmup` 참조 케이스 검색·삭제 (2건)
- [ ] `tests/unit/session.test.ts`: `warmup` 참조 케이스 검색·삭제 (2건)
- [ ] `tests/unit/boot.test.ts`: `warmup` 참조 케이스 검색·삭제 (1건)

### 검사

- [ ] `pnpm test` 통과 (신규 실패 없음)
- [ ] `pnpm run check` 오류 0 · 경고 0 (NFR-20)
- [ ] `grep -rn "warmup\|maxWarmupSets\|planWarmup" src/lib/domain/` 결과 0건
- [ ] 삭제·재작성 테스트 수를 커밋 메시지에 명시 (FR-20.6)

---

## Commit 2 — UI · 저장 스키마 v3 · 스트레칭 안내 (FR-20.2 / FR-20.3 / FR-20.5 / EC-48)

### 저장 스키마

- [ ] **storage.ts**: `InProgressSession.warmupSets: SetEntry[]` 필드 삭제 (line 63) (FR-20.3)
- [ ] **storage.ts**: `isInProgressShape` 검증기에서 `warmupSets` 검사 삭제 (line 109) (FR-20.3)
- [ ] **storage.ts**: `CURRENT_SCHEMA_VERSION` 을 2 에서 3 으로 (line 33) (ADR-15 / ADR-18)
- [ ] **storage.ts**: v2 → v3 마이그레이션 함수 추가. `InProgressEnvelope` 읽기 경로에서 `schemaVersion === 2` 이면 `warmupSets` 를 무시하고 v3 로 재조립 (FR-1.4 마이그레이션 체인, ADR-18). `AppState` 봉투도 함께 v2→v3 no-op 이동:
  ```ts
  // storage.ts 내부 헬퍼 (구체 이름은 자유)
  function migrateInProgressV2toV3(v2: any): InProgressSession {
    const { warmupSets, ...rest } = v2;   // warmupSets 무시 (EC-48)
    return rest;
  }
  function migrateAppStateV2toV3(v2: AppState): AppState {
    return v2;   // AppState 는 이번 릴리스에서 no-op
  }
  ```

### UI 컴포넌트

- [ ] **ExerciseCard.svelte**: `<section class="warmup">` 절 전문 삭제 (FR-20.2). `plan.warmup` 참조하는 코드 라인 전부 삭제
- [ ] **session.svelte.ts**: `begin(startedAt, plan)` 초기화에서 `warmupSets: []` 삭제 (line 66)
- [ ] **session.svelte.ts**: `pushWarmupSet(entry)` 메서드 삭제 (line 90 근처)
- [ ] **session.svelte.ts**: `updateWarmupSet(index, entry)` 메서드 삭제 (line 99 근처)
- [ ] **+page.svelte**: 오늘 화면에 **스트레칭 안내 한 줄** 추가 (FR-20.5). 위치: `<section>` 시작 부분, 첫 번째 헤더 위 또는 카드 목록 위. 문구: "운동 전후로 스트레칭을 한다." (수치·종목별 지시 없음, NFR-2 준수)
  - 세션마다 반복 노출하지 말고 오늘 화면에 한 번만 노출 (FR-20.5)

### 테스트

- [ ] `tests/unit/storage.test.ts`: v2 봉투 (`warmupSets: [{value: 5}]` 포함) 를 저장하고 읽어 v3 InProgressSession 이 나오되 `warmupSets` 키가 없음을 확인 (EC-48 신규)
- [ ] `tests/unit/storage.test.ts`: v3 정상 라운드트립 케이스 유지 (기존 케이스 → 스키마 버전만 3 으로 수정)
- [ ] `tests/unit/storage.test.ts`: `warmupSets` 관련 검증 케이스 삭제 (약 2~3건)
- [ ] `tests/unit/inprogress.test.ts`: `pushWarmupSet` / `updateWarmupSet` 테스트 삭제 (약 4건)
- [ ] `tests/unit/inprogress.test.ts`: `beginWork` / `begin` 이후 `warmupSets: []` 확인하는 assertion 삭제 (`workSets: []` 만 확인으로)

### 검사

- [ ] `pnpm test` 전부 통과 (예상 550~555개)
- [ ] `pnpm run check` 오류 0 · 경고 0
- [ ] 브라우저에서 v2 데이터를 심어 두고 앱을 켰을 때 크래시 없이 v3 로 뜨는지 수동 확인 (선택)
- [ ] 커밋 메시지에 삭제·재작성 테스트 수와 사유 명시 (FR-20.6 요구)

---

## Out of Scope (이 페이즈)

- FR-22 승급 판정 재작성 → Phase 2
- FR-21 표시 위계 재편성 → Phase 2 (워밍업이 사라지고 나서 위계가 명확해진다)
- FR-18 자유 운동 → Phase 3
- FR-17 오늘 화면 4상태 → Phase 4
- FR-16 상단 바 → Phase 5

## Traceability

| SPEC 항목 | 처리 |
|---|---|
| FR-20.1 | Commit 1 · Commit 2 (`warmupSets` 삭제) |
| FR-20.2 | Commit 2 (ExerciseCard 워밍업 절 삭제) |
| FR-20.3 | Commit 2 (스키마 v3 · 마이그레이션) |
| FR-20.4 | Commit 1 (docs 정정) |
| FR-20.5 | Commit 2 (스트레칭 안내) |
| FR-20.6 | Commit 1 · Commit 2 (커밋 메시지에 명시) |
| FR-20.7 | Phase 2 로 미룸 (`_source` 정리는 rules 정정과 함께) |
| FR-20.8 | GLOBAL 「SPEC 과의 불일치 #1」 결정에 따라 이번에 함께 처리 → Phase 2 에서 실제 삭제 |
| EC-48 | Commit 2 신규 테스트 |
| NFR-20 | 각 커밋 종료 시점에 검사 |
