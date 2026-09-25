# Phase 2 — 승급 조건 정정 (FR-22) + 표시 위계 (FR-21) + rules · docs 정리 (FR-22.6/8/9)

**목표**: 「단계별 목표를 순차로 3회 연속 통과」를 유일한 승급 기준으로 삼는다. `plan.ts` 와 `evaluate.ts` 의 판정 로직을 근본 재작성한다. 90% 규칙과 유지세트 개념을 제거한다. `rules.ts` 의 `book:` / `정책:` 표기를 실제와 맞춘다. UI 카드의 표시 위계를 목표 수치가 시선의 첫 지점이 되도록 재편한다.

**Dependencies**: Phase 1 완료
**커밋 수**: 3
**예상 테스트 변화**: 550~555 → 약 530~540 (대거 재작성), 그 후 stepStreak 신규 케이스 +10 정도 → 540~555
**스키마**: 변경 없음 (ADR-15 — 연속 횟수는 파생)

---

## Commit 1 — `rules.ts` 정리 + `stepStreak` 파생 함수 신규 (FR-22.6 / FR-22.8 / ADR-15)

### rules.ts 정리 (FR-22.6 / FR-22.8 / ADR-17)

- [ ] `RULES.attemptThreshold: 0.9` 삭제 (line 16~17) (FR-22.6)
- [ ] `RULES.rpeDownshiftAt: 9` 삭제 (line 40~41) (ADR-17 (a))
- [ ] `RULES.rpeDownshiftAmount: 1` 삭제 (line 42) (ADR-17 (a))
- [ ] `RULES.promotionStreakRequired: 3` 추가 (신규, FR-22.1)
  ```ts
  /** 정책: FR-22 승급에 요구되는 tier 별 연속 통과 횟수. */
  promotionStreakRequired: 3,
  ```
- [ ] `book:` / `정책:` 표기 정리 (FR-22.8):
  - `gateStep`: `book:` 유지 (책 근거 확인)
  - `startStep`: `book:` 유지
  - `consolidationSets`: `book:` 유지
  - `gateRequiresCompletion`: `정책:` (책이 명시하지 않는 세부)
  - `consolidationBumpEvery` / `consolidationBumpRatio`: `정책:` 유지 (창작)
  - `rpeVetoWindow` / `rpeVetoMean`: `정책:` 유지
  - `promotionStreakRequired`: `정책:` (신규)
- [ ] JSDoc 머리말 정정: "`book:` 은 실물 책(비타북스 2017) 과 대조 확인. `정책:` 은 앱 창작이며 책과 어긋나지 않는다." — `attemptThreshold`/`maxWarmupSets` 가 잘못 `book:` 이었다는 문제(SPEC2 확정 사항 E-13 근거)를 재발 방지 문구로 남긴다

### stepStreak 신규 (ADR-15)

- [ ] `src/lib/domain/history.ts` 확장 (또는 `src/lib/domain/progress.ts` 신규 파일). GLOBAL ADR-15 시그니처대로:
  ```ts
  export type StreakTier = 'beginner' | 'intermediate' | 'progression' | 'elite';
  export interface StepStreak { tier: StreakTier; streak: number; }

  export function stepStreak(
    state: AppState, catalog: Catalog, id: ProgressionId,
  ): StepStreak;
  ```
- [ ] 구현 요건:
  - 현 단계 `n = state.steps[id]` 에서 시작
  - 이 종목의 `history` 를 시간순으로 훑되:
    - `adjustedAtSessionIndex[id]` 앵커가 있으면 그 인덱스 이상만 (FR-13.3 승계)
    - `promotedTo` 가 있는 세션 이후는 새 단계 시작이므로 그 세션 뒤에서 상태 머신을 리셋한다 (승급 후 = 새 단계 초보자 구간, streak=0)
    - `r.step === n` 인 세션만 (지금 단계의 세션만)
    - `r.kind !== 'free'` (ADR-16, Phase 3 에 완결)
    - `r.kind === 'consolidation'` 또는 `r.outcome === 'abandoned'` → 연속 유지, 다음 세션으로 (FR-22.3a)
    - `r.kind === 'work' && r.outcome !== 'abandoned'` → 현재 tier 의 기준 통과 여부로 streak +1 또는 0 (FR-22.3)
  - tier 전이: streak == 3 도달 시:
    - `tier === 'beginner'` → `tier: 'intermediate'`, `streak: 0`
    - `tier === 'intermediate'` → `tier: 'progression'` (또는 10단계면 `'elite'`), `streak: 0`
    - `tier === 'progression'` (또는 `'elite'`) → 승급 대상 (이 함수는 그 상태를 { tier: progression, streak: 3 } 으로 돌려주고, promote 판정은 `evaluate.ts` 가 한다)
- [ ] `stepStreak` 는 **순수 함수**. `AppState` 를 변형하지 않는다 (NFR-3 재확인)
- [ ] `src/lib/domain/index.ts` 에 `export { stepStreak, type StepStreak, type StreakTier } from './history.ts'`

### 검사

- [ ] `pnpm test` — 신규 실패 0 (아직 planExercise/evaluateSession 은 옛 로직이므로 기존 테스트 그대로 통과해야 함)
- [ ] `pnpm run check` 0/0
- [ ] stepStreak 단위 테스트 신규 (Phase 2 TEST 참조)

---

## Commit 2 — `evaluate.ts` · `plan.ts` 재작성 + 테스트 대거 조정 (FR-22.1~5 / EC-49~55)

### evaluate.ts 재작성 (FR-22.1 / FR-22.2 / FR-22.11)

- [ ] `evaluateSession` 재작성:
  - `record.kind === 'consolidation'` → 기존과 같이 승급 대상 아님 (그대로 유지)
  - `record.outcome === 'abandoned'` → 기존과 같이 승급 안 함 (그대로 유지)
  - `record.kind === 'work'` 인 정상 완료:
    - **현재 로직(`metTop` → 즉시 promote)을 삭제** (line 82~84)
    - 새 로직: 이번 세션을 반영한 **가상 히스토리** 를 만들어 `stepStreak` 을 돌린다. 그 결과가 `{ tier: 'progression', streak: 3 }`(9단계 이하) 또는 `{ tier: 'elite', streak: 3 }`(10단계) 이면 승급 판정 대상
    - 승급 대상일 때 RPE 거부권 검사 (ADR-17 (b)):
      - `rpeVeto(state, record)` 는 그대로 유지 (최근 3회 평균 ≥ 8)
      - 거부되면 `blockedBy: 'rpe'`, `promote: false`, `nextStep: record.step` 유지
    - 10단계 승급 대상은 `blockedBy: 'master'`, `promote: false`, `nextStep: 10` (기존 유지)
    - 그 외에는 `promote: true`, `nextStep: step.n + 1`
- [ ] `Evaluation` 인터페이스는 기존 유지 (호출자 계약 그대로)
- [ ] `notes` 문자열은 새 판정에 맞게 재작성:
  - "상급자 기준 3연속 완성 — {n+1}단계로." / "상급자 3연속 완성 · RPE 평균 {m} — 승급 보류" 등
  - SPEC2 NFR-2 준수 (사실만, 격려·게이미피케이션 금지)

### plan.ts 재작성 (FR-22.4 / FR-22.5)

- [ ] `planExercise` 재작성:
  - `hasClearedBeginner` 내부 함수 삭제 (line 52~56)
  - `carryValue` 내부 함수 삭제 (line 46~49)
  - 90% 규칙 분기 삭제 (line 170~180)
  - 유지세트 계산 분기 삭제 (line 182~198)
  - 새 로직:
    ```ts
    const streak = stepStreak(state, catalog, id);
    // 현재 tier 의 기준 수치 · 세트 수 얻기
    const std = pickStandardByTier(step, streak.tier);   // beginner/intermediate/progression/elite
    const stdVal = valueOf(std);
    const goalLabel = tierToLabel(streak.tier);
    return {
      ...base,
      work: Array.from({ length: std.sets },
        () => ({ target: stdVal, mode: 'fixed' as const })),
      goal: { label: goalLabel, sets: std.sets, value: stdVal },
      kind: 'work',
      reason: `${goalLabelKo(streak.tier)} 기준 ${std.sets}×${stdVal} · ${streak.streak}/3회 연속`,
    };
    ```
    - `pickStandardByTier` / `tierToLabel` / `goalLabelKo` 는 helpers (같은 파일 안에 두거나 catalog.ts 유틸로)
  - 다지기 직후 재시도 (`EC-54`): `abandoned` 세션은 streak 를 유지하므로 (ADR-15), `streak.tier`/`streak.streak` 가 그대로다 → 목표도 그대로 → reason 을 "직전 세션 중단 — 같은 목표로 재도전 · {n}/3회 연속" 로 표시 (FR-22.3b)
    - 별도 분기: 직전 세션의 `outcome === 'abandoned'` 를 감지하면 reason 문구에 재도전 표시. `judgingState` 는 Phase 3, 여기서는 옛 방식 그대로 (Phase 3 에서 free 필터 추가)
- [ ] `planConsolidation` 은 그대로 유지 (다지기 목표 로직 무변경, FR-22.7 c)
- [ ] `planWarmup` 은 Phase 1 에서 이미 삭제됨 (재확인)
- [ ] `RULES.attemptThreshold` / `RULES.rpeDownshiftAt` 참조 코드 완전 제거 (line 170/188/197)
- [ ] `import { RULES } ...` 은 `consolidationSets` / `consolidationBumpEvery` / `consolidationBumpRatio` 만 남는지 확인

### 테스트 대거 조정 (FR-22.11)

**evaluate.test.ts** (41개):

- [ ] "상급자 기준을 채우면 다음 단계로 올린다" (line 41) → "상급자 기준을 **3연속** 채워야 다음 단계로 올린다" 로 재작성. 단일 상급자 통과 세션 → promote=false / streak=1 검증도 추가
- [ ] "3세트 기준은 세 세트를 모두 채워야 한다" (line 47) → 단일 세션 판정 그대로 유효
- [ ] "세트를 더 많이 해도 상위 N개로 판정한다" (line 54) → 그대로 유효
- [ ] "승급은 수행 횟수로만 판정한다 — 심박수는 쓰지 않는다" (line 59) → 그대로 (RPE 만 씀)
- [ ] "다지기 세션은 승급 판정 대상이 아니다" (line 72) → 그대로
- [ ] "사용자가 중단한 도전은 승급하지 않는다" (line 81) → 그대로 유효 (FR-22.3a)
- [ ] "RPE 평균이 임계 이상이면 기준을 채워도 승급을 보류한다" (line 106) → **상급자 3연속 완성 시점** 으로 조정. 세 세션 모두 상급자 통과 · RPE 8+ 인 시나리오
- [ ] "RPE 평균이 정확히 8.0 이면 보류한다" (line 119) → 3연속 시점으로 조정
- [ ] "RPE 평균이 8 미만이면 승급한다" (line 130) → 3연속 시점으로 조정
- [ ] "RPE 가 낮으면 정상 승급한다" (line 142) → 3연속 시점으로 조정
- [ ] "RPE 표본이 부족하면 거부권은 작동하지 않는다" (line 152) → 그대로 유효 (rpeVetoWindow=3 유지)
- [ ] "RPE 를 입력하지 않으면 거부권이 없다" (line 158) → 그대로
- [ ] "RPE 미입력 세션은 거부권 창에 들어가지 않는다" (line 164) → 그대로
- [ ] "다지기 세션은 RPE 거부권 창에 들어가지 않는다" (line 176) → 그대로
- [ ] applySession 관련 케이스 (line 190~264) → 반환 형태 계약 유지되므로 그대로. `record.promotedTo` 가 늦게 나오는 시점만 조정
- [ ] "승급 시 record.promotedTo 가 채워진다" (line 264) → 3연속 완성 세션에서 채워짐으로 조정
- [ ] "1단계에서 상급자 기준 충족 시 promotedTo 는 2 다" (line 284) → 3연속 후 promotedTo=2
- [ ] "9단계에서 충족하면 promotedTo 는 10 이다" (line 289) → 3연속 후 promotedTo=10
- [ ] "EC-11 RPE 거부권으로 보류된 세션은 promotedTo 가 없고 blockedBy 가 rpe 다" (line 301) → 3연속 완성 · RPE 8+ 시나리오
- [ ] "마스터 단계에서 기준 충족 시 blockedBy 가 master 다" (line 314) → 10단계 3연속 후 blockedBy: 'master'
- [ ] "연속 세션에서 승급이 정확히 한 번만 기록된다" (line 386) → 3연속 채운 시점의 한 세션에만 promotedTo

**plan.test.ts** (32개):

- [ ] "새 단계 첫 세션은 초보자 기준에 도전한다" (line 10) → 그대로 유효 (첫 세션 = tier: beginner, streak: 0)
- [ ] "도전에 실패해도 다음 계획은 다시 초보자 기준 도전이다" (line 17) → 재작성: "초보자 기준 도전 실패 시 다음도 초보자 기준 · 0/3회 연속"
- [ ] "다지기는 이전 단계 상급자 기준 2세트로 시작한다" (line 25) → 그대로 유효
- [ ] 다지기 관련 4~5건 → 그대로 유효 (planConsolidation 무변경)
- [ ] "초보자 통과·중급자 미달이면 유지 1세트 + 중급자까지 최대한" (line 85) → **재작성**: "초보자 3연속 통과 후 중급자 구간 · 매 세션 중급자 기준 도전"
- [ ] "중급자 통과 후 상급자가 2세트면 유지 1세트 + 상급자까지 최대한" (line 92) → **재작성**: "중급자 3연속 후 상급자 구간 · 매 세션 상급자 2세트 도전"
- [ ] "상급자가 3세트면 유지 2세트 + 마지막 세트 최대한" (line 101) → **재작성**: "상급자 구간 · 매 세션 상급자 3세트 도전"
- [ ] "직전 평균이 목표의 90% 이상이면 기준 자체에 도전한다" (line 110) → **삭제** (90% 규칙 소멸, FR-22.6)
- [ ] "직전 RPE 9 이상이면 유지 세트 목표를 1 낮춘다" (line 119) → **삭제** (rpeDownshiftAt 소멸, ADR-17 (a))
- [ ] "핸드스탠드 2단계에는 1단계가 동반 단계로 붙는다" (line 136) → 그대로 (`withPair` 무변경)
- [ ] perSide / sideNote 관련 케이스 (line 147~) → 그대로 유효

**integration.test.ts** (50개 중 5~10건):

- [ ] `maintainedHistory` 헬퍼가 지금은 "상급자 기준 1회 통과 3세션" 을 만든다. **재작성**: 각 tier 3연속 → 3 tier × 3 세션 = 승급까지 9 세션 필요. 헬퍼를 승급까지 필요한 세션 시퀀스를 만들도록 재정의
- [ ] EC-7 프로그램 전환 시 카운트 리셋 (line 300~355) → 그대로 유효 (maintenanceCount 계약 무변경)
- [ ] "전체 흐름이 이어진다" (line 355) → 승급까지 세션 수 조정

**proposal.test.ts** (88개 중 5~15건):

- [ ] `maintenanceCount` 자체 계약은 유지 → 그 테스트들은 그대로
- [ ] "3회 채우면 제안 생성" 시나리오는 승급까지의 세션이 늘어남에 따라 준비 헬퍼만 조정

**session.test.ts** (54개):

- [ ] `applySession` 시나리오에서 승급 검증하는 케이스들 → 3연속 완성 시점으로 조정

**flow.test.ts** (1개):

- [ ] "프로그램 선택 → 첫 운동일 계획 → 세션 기록 → 승급까지" → 승급까지 3연속 반복하도록 세션 시퀀스 조정

### 검사

- [ ] `pnpm test` 전부 통과. 예상 530~540개.
- [ ] `pnpm run check` 0/0
- [ ] `grep -n "attemptThreshold\|rpeDownshift\|hasClearedBeginner\|carryValue\|maxWarmupSets" src/ tests/` — 결과 0건
- [ ] 삭제·재작성·신규 테스트 수를 커밋 메시지에 명시 (FR-22.11)

---

## Commit 3 — UI 표시 위계 + progressions.json _source + docs (FR-21 / FR-22.5 / FR-22.8 / FR-22.9)

### UI 표시 위계 (FR-21 / FR-22.5)

- [ ] **ExerciseCard.svelte**: 카드 헤더 재편
  - **목표 수치·세트를 시선의 첫 지점으로**: `<h3>{exerciseTitle(plan)}</h3>` 이 종목명이고 그 아래에 목표를 표시하는 현재 구조를 재편. 목표(`plan.goal.sets × plan.goal.value` + `standardLabel` + `unit`) 를 **가장 크고 진하게** (FR-21.1 / FR-21.2, E-11).
  - 현재 `<p class="sub">` 에 목표를 작고 흐리게 노출하는 스타일을 목표는 크게, 종목명은 부제로 재구성
  - `reason` / `sideNote` 는 보조 문구 위계로 (FR-21.3)
  - 흐린 색은 부가 정보에만 (FR-21.4) — 잠금 사유·경고에는 사용 안 함
- [ ] **ExerciseCard.svelte**: FR-22.5 표시
  - 카드 어딘가에 "**{초보자|중급자|상급자} {sets}×{value}{unit} · {streak}/3회 연속**" 을 노출
  - 이 정보는 이미 `plan.reason` 에 담기지만, 사용자가 한눈에 잡을 수 있도록 별도 라인으로 뽑아 표시 (Commit 2 에서 `reason` 문구에 "{tier} 기준 {S}×{V} · {n}/3회 연속" 을 넣었으므로 카드에서 그 부분을 파싱하기보다 `plan.goal` + `plan.reason` 을 조합하거나, `plan` 반환에 `streak` 필드 추가 검토)
  - **더 단순한 방법**: `PlannedExercise.streak?: number` 필드를 신규 추가 (types.ts) — 표시 전용, 판정에 관여하지 않음. Commit 2 의 `planExercise` 가 이 값을 함께 반환. 카드가 이를 조합해 표시.
  - **결정**: Commit 2 재작성 시 `PlannedExercise` 에 `streak?: number` 를 함께 추가. 판정에 쓰지 않으며 UI 표시 전용. Commit 3 에서 카드가 이를 소비.
- [ ] **labels.ts**: 필요하면 `progressLine(streak)` 헬퍼 추가 (`"{n}/3회 연속"`)

### progressions.json 정정 (FR-22.9 / FR-20.7)

- [ ] `_source` 문구를 다음처럼 정정:
  - 현재: "60스텝 전부 본문 + 단계 요약표 이중 대조 완료."
  - 정정: "60스텝 기준 수치는 본문 + 단계 요약표 이중 대조 완료. 보조 규칙(승급·워밍업·90% 등)은 이 대조에 포함되지 않는다."
  - 근거: FR-22.9 "실물 책과 대조한 것은 60단계의 기준 수치이고 보조 규칙은 그렇지 않다"

### docs 정정 (FR-22.9 / FR-20.7)

- [ ] **docs/PROGRESSIONS.md**: 「보조 규칙」 절 정정
  - 승급 판정을 "상급자 3연속" 으로 (FR-22)
  - 90% 규칙 서술 삭제
  - "실물 대조 범위" 절 신설 또는 정정 — 기준 수치만 대조, 보조 규칙은 아님
- [ ] **docs/LOGIC.md**: 승급 판정 서술을 3연속으로 정정. 유지세트·90% 서술 삭제.

### 검사

- [ ] `pnpm test` — 통과 유지
- [ ] `pnpm run check` 0/0
- [ ] 카드 위계 수동 확인: 폰 폭(360px)에서 목표 수치가 시선의 첫 지점인지 (NFR-11 재확인)
- [ ] 커밋 메시지에 UI 위계·문서 정정 내용 명시

---

## Out of Scope (이 페이즈)

- FR-18 자유 운동 → Phase 3 (판정 필터 `judgingHistory` 도 Phase 3 에서 적용)
- FR-17 오늘 화면 4상태 → Phase 4
- FR-16 상단 바 → Phase 5

## Traceability

| SPEC 항목 | 처리 |
|---|---|
| FR-22.1 | Commit 2 `evaluate.ts` 재작성 |
| FR-22.2 | Commit 2 (즉시 승급 로직 삭제) |
| FR-22.3 | Commit 2 (미달 → 연속 0) · Commit 1 stepStreak 구현 |
| FR-22.3a | Commit 1 stepStreak (abandoned/consolidation → 유지) |
| FR-22.3b | Commit 2 (다지기 직후 같은 목표 · reason 문구) |
| FR-22.4 | Commit 2 `planExercise` 재작성 |
| FR-22.5 | Commit 3 (UI 표시), Commit 2 (`streak` 필드 · reason 문구) |
| FR-22.6 | Commit 1 (`attemptThreshold` 삭제) · Commit 2 (`carryValue`/`hasClearedBeginner` 삭제) |
| FR-22.7 | GLOBAL ADR-17 결정 반영 — Commit 1 (`rpeDownshiftAt/Amount` 삭제) · Commit 2 (`rpeVetoMean` 3연속 시점 이전) |
| FR-22.8 | Commit 1 (`book:`/`정책:` 표기 정리) |
| FR-22.9 | Commit 3 (progressions.json / docs 정정) |
| FR-22.10 | ADR-15 결정 반영 — 새 필드 없음, `schemaVersion` 유지 (Phase 1 이 이미 v3 로 올림) |
| FR-22.11 | Commit 2 커밋 메시지에 변경 수 명시 |
| FR-21.1~4 | Commit 3 UI 카드 위계 |
| FR-20.7 | Commit 3 (progressions.json + docs 대조 범위 정정) |
| EC-49 | Commit 1/2 stepStreak / evaluate 신규 케이스 |
| EC-50 | Commit 2 evaluate.test 재작성 |
| EC-51 | Commit 1 stepStreak 신규 케이스 (기존 데이터 재해석) |
| EC-52 | Commit 2 evaluate.test 신규 케이스 |
| EC-53 | Commit 1 stepStreak 신규 케이스 |
| EC-54 | Commit 2 plan.test (다지기 직후 재도전 reason) |
| EC-55 | Commit 1 stepStreak 신규 케이스 |
