# Phase 3 — TEST (FR-18)

Phase 3 는 판정 필터가 판정 진입점 4곳에 모두 걸렸음을 회귀 케이스로 고정한다. Leak 하나만 놓쳐도 SPEC2 의 FR-18.6 표가 지적한 4가지 부작용이 재발한다.

## 테스트 러너

- `pnpm test`
- 도메인 순수 테스트는 `node` 기본. UI 세션 스토어 테스트는 이미 있는 `happy-dom` 방식 그대로.

---

## Commit 1 — 판정 필터 회귀 케이스

### `tests/unit/free.test.ts` (신규)

- [ ] "kind: 'free' 세션은 판별 유니온에 존재" — 타입 컴파일 검증만으로 충분
- [ ] **FR-18.4 / EC-40**: "현재 7단계인 종목을 free 로 3단계에 기록해도 `state.steps[id]` 는 7 유지"
  - state: `steps: { pushup: 7 }`
  - apply: `applySession(state, catalog, { ..., progressionId: 'pushup', step: 3, kind: 'free', sets: [...] })`
  - expect: `result.state.steps.pushup === 7`
- [ ] **FR-18.6 (1) / EC-41**: "free 로 상급자 기준 크게 넘겨도 승급하지 않는다"
  - state: `steps: { pushup: 2 }`
  - apply: `applySession(state, catalog, { ..., progressionId: 'pushup', step: 2, kind: 'free', sets: [200, 200, 200] })`
  - expect: `result.state.steps.pushup === 2`, `result.record.promotedTo === undefined`
- [ ] "free 세션은 evaluateSession 을 호출하지 않는다 — evaluation.notes 에 free 안내가 담긴다"
- [ ] "free 세션은 record 에 outcome 을 남기지 않는다"
- [ ] **FR-18.6 (2) / EC-44**: "free 를 현재 단계로 기록해도 다음 세션 목표가 free 값에 끌리지 않는다"
  - state: `steps: { pushup: 5 }`, history: work 세션 몇 개 (일반 진행)
  - free 세션 하나 추가 (`step: 5`, `sets: [1]` 매우 낮게)
  - planExercise 호출 → free 세션이 lastSession 이 되지 않는다 (judgingHistory 필터)
  - 계획된 sets 목표가 free 의 낮은 값에 영향받지 않는다
- [ ] **FR-18.6 (3) / EC-46**: "휴식일마다 free 를 반복해도 maintenanceCount 가 안 늘어난다"
  - 승급 세션 하나 이후 free 세션을 여러 개 (같은 종목 같은 단계) 담은 history
  - `maintenanceCount(history, id, floorDate)` 는 승급 후 free 를 세지 않음 (`sessionIndices` 필터)
- [ ] **FR-18.6 (4) / EC-45**: "free abandon(사실 안 만들지만 만약 만들어도) 이 lastSetbackIndex 에 잡히지 않음"
  - free 세션에 `outcome: 'abandoned'` 를 억지로 넣은 시나리오 (실제 코드로는 만들지 않지만 방어)
  - `lastSetbackIndex` 결과 null
- [ ] "judgingHistory 는 순수 함수 — 원본 배열을 변형하지 않는다"
- [ ] "judgingState 는 원본 상태를 변형하지 않는다"
- [ ] "judgingHistory 는 kind === 'work' 와 'consolidation' 은 유지, 'free' 만 제외"

### `tests/unit/plan.test.ts` 확장

- [ ] "planExercise 는 free 세션을 lastSession 으로 잡지 않는다" (EC-44 를 plan 시선에서 재검증)
- [ ] "stepStreak 은 free 세션을 세지 않는다" (Phase 2 stepStreak 테스트에 두었던 stub 을 구체 케이스로)
  - `history: [work-통과, free-통과, work-통과, work-통과]` → `streak = 3` (free 는 무시)

### `tests/unit/proposal.test.ts` 확장

- [ ] "sessionIndices 는 free 세션을 건너뛴다"
- [ ] "lastSetbackIndex 는 free 의 abandoned 를 무시" (Risk 회귀)
- [ ] "maintenanceCount 는 승급 후 free 를 세지 않는다"

### `tests/unit/evaluate.test.ts` 확장

- [ ] "rpeVeto 는 free 세션의 RPE 를 창에 넣지 않는다"
  - 최근 세션 3개가 free 이고 RPE 8+ 인 상태에서 상급자 3연속 완성 세션이 오면 → veto 발동 안 함 (판정 대상은 최근 work 만)

### `tests/unit/calendar.test.ts` 확장

- [ ] **FR-18.8**: "reviewDay 의 planned 는 free 를 포함하지 않는다"
- [ ] **FR-18.8**: "reviewDay 의 performed 는 free 를 포함한다" — 조회에는 노출

---

## Commit 2 — UI · 저장 스키마

### `tests/unit/inprogress.test.ts` 확장

- [ ] "free kind 로 begin 하면 InProgressSession.kind === 'free' 로 담긴다"
- [ ] "free 세션 진행 중 저장·복원 라운드트립"
- [ ] "free 세션 finalize 시 applySession 이 kind='free' 로 호출되고 state.steps 가 안 바뀐다"
- [ ] "free 세션 finalize 시 세트 RPE 최댓값이 세션 RPE 로 넘어간다 (FR-18.9 / D-11)"

### 자동 테스트 없음 (컴포넌트 마운트 안 함, NFR-14)

- [ ] FreeExerciseForm 은 육안 확인
- [ ] EC-42 (잠긴 종목 거절) 는 저장 함수 단위 확인:
  - 로직 헬퍼 `canRecordFree(state, catalog, progressionId)` 를 두면 이를 단위 테스트로 검증
  - 또는 `applySession` 이 free 를 받으면 그대로 저장한다는 계약이므로, UI 층 가드가 유일한 방어 — 이 경우 육안 확인

---

## 검사 절차

### Commit 1 종료 후

1. `pnpm test` — 신규 회귀 케이스 통과
2. `pnpm run check` 0/0
3. `grep -rn "kind === 'free'\|kind !== 'free'" src/lib/domain/` — 판정 진입점 4곳(+ helper) 에만 존재해야 함:
   - `evaluate.ts` (applySession 조기 반환) — 1건
   - `history.ts` (judgingHistory) — 1건
   - `proposal.ts` (sessionIndices) — 1건
   - `plan.ts` (필요 시 planExercise 안에서 judgingState 활용, 하지만 명시적 kind 체크는 없음)
4. 각 leak 경로 회귀 케이스 존재 확인:
   - `grep -n "EC-40\|EC-41\|EC-44\|EC-45\|EC-46" tests/unit/free.test.ts` — 5건 이상

### Commit 2 종료 후

1. `pnpm test` 전부 통과 (예상 555~575개)
2. `pnpm run check` 0/0
3. FreeExerciseForm 이 잠긴 종목 선택 시 저장 버튼 비활성 — 육안
4. EC-42 UI 처리 확인 — 육안 또는 로직 헬퍼 단위 테스트

---

## Edge Case 커버

| EC | 처리 |
|---|---|
| EC-40 | Commit 1 free.test — state.steps 불변 |
| EC-41 | Commit 1 free.test — 승급 판정 leak 회귀 |
| EC-42 | Commit 2 UI 가드 (또는 헬퍼 단위 테스트) |
| EC-44 | Commit 1 free.test / plan.test — 다음 목표 계산 leak 회귀 |
| EC-45 | Commit 1 free.test — 강등 판정 leak 회귀 |
| EC-46 | Commit 1 free.test / proposal.test — 유지 카운트 leak 회귀 |

## 통과 기준

- [ ] `pnpm test` 전부 통과
- [ ] `pnpm run check` 0/0
- [ ] FR-18 전 하위 항목 반영
- [ ] FR-18.6 표 4행이 각각 회귀 케이스로 존재
- [ ] `judgingHistory` / `judgingState` 가 판정 필터의 유일한 진입점임을 grep 로 확인
