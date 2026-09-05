# Phase 2 — TEST (FR-22 / FR-21)

Phase 2 가 판정 로직을 근본 재작성하므로 테스트가 대거 바뀐다. 파일별로 삭제·재작성·신규를 명시한다.

## 테스트 러너

- `pnpm test` (`vitest run`)
- 도메인 순수 테스트가 대부분이라 `node` 환경 기본. UI 카드 위계 확인은 육안 (NFR-14 컴포넌트 마운트 테스트 안 함).

---

## Commit 1 — stepStreak 신규 테스트

### `tests/unit/stepStreak.test.ts` (신규) — 또는 `history.test.ts` 확장

- [ ] "새 단계 첫 세션 이전 = { tier: 'beginner', streak: 0 }"
- [ ] "초보자 통과 1회 = streak 1"
- [ ] "초보자 통과 2회 = streak 2"
- [ ] "초보자 통과 3회 = { tier: 'intermediate', streak: 0 } 로 전이"
- [ ] "중급자 3회 완성 = { tier: 'progression', streak: 0 }"
- [ ] "상급자 3회 완성 = { tier: 'progression', streak: 3 } (승급 신호)"
- [ ] "10단계에서는 elite 로 전이" (마스터 단계 라벨 검증)
- [ ] **EC-49**: "초보자 2회 후 미달 → { beginner, 0 }" (연속 0)
- [ ] **EC-53**: "초보자 2회 후 '불가능' → { beginner, 2 } 유지"
- [ ] **EC-53 확장**: "초보자 2회 후 다지기 세션 → { beginner, 2 } 유지"
- [ ] **EC-55**: "'불가능' 을 여러 번 연속으로 → 연속 계속 유지, 다지기 누적으로 수행량만 오름 (`consolidationBumpEvery`)"
- [ ] **EC-51**: "기존 승급 이력(promotedTo 있음)을 담은 상태를 재해석 → `state.steps` 불변, 현 단계에서 streak 이 새로 셈 시작"
- [ ] "수동 조정 앵커 이상만 계산 — 조정 전 세션은 무시" (ADR-10 재확인)
- [ ] "자유 운동은 계산 대상 아님 — Phase 3 에서 kind='free' 도입 후 회귀 방지 케이스로 추가" (Phase 3 확장으로 이월, Phase 2 에서는 kind='free' 데이터가 없으므로 stub 만 두거나 미포함)
- [ ] "순수 함수 — state / catalog / history 를 변형하지 않는다"

---

## Commit 2 — evaluate / plan / integration / proposal / session / flow 조정

### `tests/unit/evaluate.test.ts` (41개)

**재작성**

- [ ] "상급자 기준을 채우면 다음 단계로 올린다" (line 41) → "상급자 기준을 **3연속** 채워야 다음 단계로 올린다"
  - 케이스 (a): 상급자 통과 1회 → promote=false, nextStep=step
  - 케이스 (b): 상급자 통과 3회 → promote=true, nextStep=step+1
- [ ] "RPE 평균이 임계 이상이면 기준을 채워도 승급을 보류한다" (line 106) → **3연속 완성 시점** 시나리오
  - 세션 3개 모두 상급자 통과 · RPE 8+ → blockedBy: 'rpe', promote: false, nextStep=step, streak 3 유지
- [ ] "RPE 평균이 정확히 8.0 이면 보류한다" (line 119) → 위와 동일 구조
- [ ] "RPE 평균이 8 미만이면 승급한다" (line 130) → 3연속 시나리오
- [ ] "RPE 가 낮으면 정상 승급한다" (line 142) → 3연속 시나리오
- [ ] "RPE 표본이 부족하면 거부권은 작동하지 않는다" (line 152) → 상급자 3연속 완성 시점에 최근 3회 중 RPE 표본이 3 미만 → 거부권 없이 승급
- [ ] "RPE 를 입력하지 않으면 거부권이 없다" (line 158) → 3연속 시나리오
- [ ] "승급 시 record.promotedTo 가 채워진다" (line 264) → 3연속 완성 세션의 record 에만
- [ ] "1단계에서 상급자 기준 충족 시 promotedTo 는 2 다" (line 284) → 3연속 후 promotedTo=2
- [ ] "9단계에서 충족하면 promotedTo 는 10 이다" (line 289) → 3연속 후 promotedTo=10
- [ ] "EC-11 RPE 거부권으로 보류된 세션" (line 301) → 3연속 완성 시점 · RPE 8+ 시나리오
- [ ] "마스터 단계에서 기준 충족 시 blockedBy 가 master 다" (line 314) → 10단계 3연속 후 blockedBy: 'master'
- [ ] "연속 세션에서 승급이 정확히 한 번만 기록된다" (line 386) → 3연속 후 그 세션에만 promotedTo

**신규**

- [ ] **EC-52**: "상급자 기준을 크게 넘겨도 그 세션은 연속 1회로 카운트" — 1회로는 promote=false
- [ ] "상급자 3연속 완성 세션의 다음 세션이 미달이면 다음 단계로 이미 승급했으므로 별개 · streak 은 새 단계의 초보자 구간에서 0 부터"
- [ ] "abandoned 세션은 승급 판정 대상 아니고 streak 도 유지" (기존 그대로 유효 확인)

**유지 (그대로)**

- [ ] "3세트 기준은 세 세트를 모두 채워야 한다" (line 47)
- [ ] "세트를 더 많이 해도 상위 N개로 판정한다" (line 54)
- [ ] "승급은 수행 횟수로만 판정한다 — 심박수는 쓰지 않는다" (line 59)
- [ ] "다지기 세션은 승급 판정 대상이 아니다" (line 72)
- [ ] "사용자가 중단한 도전은 승급하지 않는다" (line 81)
- [ ] "기준을 채운 세션이라도 중단으로 기록되면 승급하지 않는다" (line 89)
- [ ] "RPE 미입력 세션은 거부권 창에 들어가지 않는다" (line 164)
- [ ] "다지기 세션은 RPE 거부권 창에 들어가지 않는다" (line 176)
- [ ] `applySession` 반환 구조 관련 케이스 (line 190~264, 349~)
- [ ] "sets 가 빈 배열이면 승급하지 않는다" (line 347)
- [ ] "존재하지 않는 단계 번호는 예외가 그대로 전파된다" (line 375)

### `tests/unit/plan.test.ts` (32개)

**삭제**

- [ ] "직전 평균이 목표의 90% 이상이면 기준 자체에 도전한다" (line 110) — 90% 규칙 소멸
- [ ] "직전 RPE 9 이상이면 유지 세트 목표를 1 낮춘다" (line 119) — rpeDownshiftAt 소멸

**재작성**

- [ ] "도전에 실패해도 다음 계획은 다시 초보자 기준 도전이다" (line 17) → "초보자 기준 도전 실패 시 다음도 초보자 기준 · streak=0"
- [ ] "초보자 통과·중급자 미달이면 유지 1세트 + 중급자까지 최대한" (line 85) → "초보자 3연속 후 중급자 구간 진입 — 매 세션 중급자 기준 도전"
- [ ] "중급자 통과 후 상급자가 2세트면 유지 1세트 + 상급자까지 최대한" (line 92) → "중급자 3연속 후 상급자 구간 진입 — 매 세션 상급자 2세트 도전"
- [ ] "상급자가 3세트면 유지 2세트 + 마지막 세트 최대한" (line 101) → "상급자 구간 · 매 세션 상급자 3세트 도전"

**신규**

- [ ] **EC-54**: "다지기 다음날은 실패한 것과 같은 목표를 다시 낸다"
  - state: 상급자 구간, 어제 abandoned 세션
  - planExercise 결과: 목표는 상급자 기준 그대로 · reason 에 "재도전" 포함
- [ ] "streak 필드가 반환에 포함된다" (표시용, FR-22.5)
- [ ] "다지기 직후 재도전 케이스에서 목표는 상급자 기준 그대로 · 세트 수도 상급자 세트 수 그대로"

**유지**

- [ ] "새 단계 첫 세션은 초보자 기준에 도전한다" (line 10)
- [ ] "다지기는 이전 단계 상급자 기준 2세트로 시작한다" (line 25)
- [ ] "다지기 3회마다 수행량이 기준의 10%씩 올라간다" (line 35)
- [ ] "기준이 30이면 30 → 33 → 36 → 39 로 올라간다" (line 48)
- [ ] "다지기 횟수는 해당 단계의 것만 센다" (line 58)
- [ ] "1단계에서는 다지기로 내려갈 곳이 없다" (line 67)
- [ ] "초보자 기준을 한 번 넘으면 다지기 흐름에서 빠져나온다" (line 74) → "초보자 3연속을 마치면 중급자 구간이므로 다지기 초기 흐름과 다르다"
- [ ] "핸드스탠드 2단계에는 1단계가 동반 단계로 붙는다" (line 136)
- [ ] perSide / sideNote 관련 케이스 (line 147~) — 전부 그대로

### `tests/unit/integration.test.ts` (50개)

**재작성 헬퍼**

- [ ] `maintainedHistory(ids, floorDate)` 를 새 규칙에 맞게 재정의. 승급까지 필요한 시퀀스가 늘어난다 (각 tier 3연속 · 3 tier 통과).
  - 참고: 첫 승급까지 최소 3세션 (상급자 구간에서 시작해도 3연속). 초보자/중급자/상급자 전 tier 를 거치면 9세션.
  - 헬퍼는 "이 종목을 승급까지 채운다" 대신 "이 종목의 유지 카운트를 N 회 이상으로 만든다" 같은 명시적 목적으로 재작성

**조정**

- [ ] "전체 흐름이 이어진다 (FR-4.6 → FR-4.6a → FR-4.8 → FR-2.6)" (line 355) → 승급까지 세션 수 조정
- [ ] "EC-7 프로그램 전환 시 카운트 리셋" (line 300~355) → `maintenanceCount` 계약 유지되므로 그대로. 다만 준비 헬퍼가 재작성됨
- [ ] "3C ↔ 3B 상호작용 (EC-5)" (line 395) → 강등 + 재승급 시나리오 · 승급 시점 조정

### `tests/unit/proposal.test.ts` (88개)

- [ ] `maintenanceCount` 계약 자체 케이스 (line 278~) — 그대로 유효
- [ ] 승급 후 카운트 시나리오는 promotedTo 가 늦게 붙으므로 준비 헬퍼만 조정

### `tests/unit/session.test.ts` (54개)

- [ ] `applySession` 승급 검증 케이스는 3연속 시점으로 조정
- [ ] '불가능' → 다지기 시나리오 그대로 유효 (FR-22.3a 재확인)

### `tests/unit/flow.test.ts` (1개)

- [ ] "프로그램 선택 → 첫 운동일 계획 → 세션 기록 → 승급까지" — 승급까지 3연속 반복하도록 재작성. 각 종목별로 상급자 3연속 세션을 기록

---

## Commit 3 — UI · 문서

### 자동 테스트 없음 (NFR-14)

- [ ] ExerciseCard 위계는 육안 확인
- [ ] progressions.json / docs 정정은 grep 로 확인:
  - `grep -n "attemptThreshold\|maxWarmupSets\|90%\|워밍업" docs/PROGRESSIONS.md docs/LOGIC.md` — 사망 표현 0
  - `grep -n "3회 연속\|3연속" docs/PROGRESSIONS.md docs/LOGIC.md` — 새 승급 규칙 반영 확인

---

## 검사 절차

### Commit 1 종료 후

1. `pnpm test` — stepStreak 신규 케이스 통과. 기존 561 - Phase 1 삭제분 (약 555) 은 그대로 통과.
2. `pnpm run check` 0/0
3. `grep -n "attemptThreshold\|rpeDownshiftAt\|rpeDownshiftAmount" src/lib/domain/rules.ts` — 0
4. `grep -n "promotionStreakRequired" src/lib/domain/rules.ts` — 1건 확인

### Commit 2 종료 후

1. `pnpm test` — 전부 통과. 예상 530~540개.
2. `pnpm run check` 0/0
3. `grep -rn "attemptThreshold\|hasClearedBeginner\|carryValue" src/ tests/` — 0
4. `grep -n "planWarmup\|maxWarmupSets" src/lib/domain/plan.ts` — 0
5. 삭제·재작성·신규 테스트 수를 카운트 → 커밋 메시지에 명시 (FR-22.11)

### Commit 3 종료 후

1. `pnpm test` 통과 유지
2. `pnpm run check` 0/0
3. 오늘 화면 카드 목표 수치가 시선의 첫 지점인지 육안 확인
4. `docs/PROGRESSIONS.md` / `docs/LOGIC.md` 90% · 워밍업 서술 제거 확인

---

## Edge Case 커버

| EC | 처리 |
|---|---|
| EC-49 | Commit 1 stepStreak 신규 |
| EC-50 | Commit 2 evaluate.test 재작성 |
| EC-51 | Commit 1 stepStreak 신규 (기존 데이터 재해석) |
| EC-52 | Commit 2 evaluate.test 신규 |
| EC-53 | Commit 1 stepStreak 신규 |
| EC-54 | Commit 2 plan.test 신규 |
| EC-55 | Commit 1 stepStreak 신규 |

## 통과 기준

- [ ] `pnpm test` 전부 통과 (예상 540~555개, stepStreak 신규 반영)
- [ ] `pnpm run check` 0/0
- [ ] FR-22 전 하위 항목 반영 (판정 로직, 표시, rules 정리, 문서)
- [ ] FR-21 전 하위 항목 반영 (UI 위계)
- [ ] 커밋 메시지에 「삭제/재작성/신규 테스트 수와 사유」 명시 (FR-22.11)
