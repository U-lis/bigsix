# Phase 3 검증

**목적**: 도메인 변경 3커밋(FR-12 / FR-13 / FR-15) 이 각각 정확히 반영되고, 이관되지 않은 다른
동작 사양은 무변경임을 증명한다.

---

## FR-12 커밋 이후

### 삭제 검증

- [ ] `grep -rn "AccessoryItem" src/lib/domain/` 이 출력을 내지 않는다 (타입 완전 제거)
- [ ] `grep -rn "accessories" src/lib/domain/` 이 출력을 내지 않는다 (필드 완전 제거)
- [ ] `grep -rn "accessories" src/lib/data/progressions.json` 이 여전히 출력을 낸다 — **데이터는
      그대로다** (FR-12.2: 스케줄 라벨 유지). 이 파일은 손대지 않았어야 한다:
      `git diff HEAD~1 HEAD -- src/lib/data/progressions.json` 이 빈 출력

### 조용한 건너뜀 검증 (FR-12.3)

- [ ] `pnpm test` 실행. 예상 신규 테스트 (`LABEL_TO_ID 에 없는 라벨은 planDay 결과에 나타나지 않는다`)
      가 통과
- [ ] Solitary Confinement 월요일의 `planDay` 결과에 "악력 운동" 이 어디에도 없다 (`exercises` /
      `locked` / 어느 배열에도)

### 테스트 수

- [ ] `pnpm test` 종료 시 총 테스트 수를 기록. Phase 2 의 474 에서 감소한 만큼이 커밋 메시지에 반영
      되어야 한다 (FR-12.4)
- [ ] 삭제·재작성·신규 목록이 커밋 메시지에 정리되어 있다

### 다른 사양 무변경

- [ ] `AppState` / `SessionInput` / `SessionRecord` / `Step` / `Standard` 등 accessories 와 무관한
      타입은 그대로다 (`git diff` 로 확인)
- [ ] `pnpm run check` 오류 · 경고 0

---

## FR-13 커밋 이후

### `setStep` API 검증 (`tests/unit/steps.test.ts` 필수 케이스)

`tests/unit/steps.test.ts` 가 다음을 포함하고 모두 통과:

**FR-13.2 범위 검증**
- [ ] `setStep(state, catalog, 'pushup', 1)` 성공, `steps.pushup === 1`
- [ ] `setStep(state, catalog, 'pushup', 10)` 성공, `steps.pushup === 10`
- [ ] `setStep(state, catalog, 'pushup', 5)` 성공, `steps.pushup === 5`
- [ ] `setStep(state, catalog, 'pushup', 0)` 예외 던짐 (범위 밖)
- [ ] `setStep(state, catalog, 'pushup', 11)` 예외 던짐 (범위 밖)
- [ ] `setStep(state, catalog, 'pushup', 3.5)` 예외 던짐 (정수 아님)
- [ ] `setStep(state, catalog, 'pushup', Number.NaN)` 예외 던짐

**FR-13.2 잠긴 종목 거부 (EC-27)**
- [ ] 빅4 미달 상태의 `state` 에서 `setStep(state, catalog, 'bridge', 3)` 예외 던짐 — 잠긴 종목
- [ ] 같은 조건에서 `setStep(state, catalog, 'hspu', 3)` 예외 던짐

**FR-13.3 유지 횟수 리셋 (EC-26)**
- [ ] 시나리오:
  - 시작 상태: `steps.pushup = 5`, 프로그램 선택됨, 승급 세션 1건 + 유지 세션 2건 (2회까지 쌓임)
  - `maintenanceCount(state.history, 'pushup', stint.startedAt)` == 2 확인
  - `setStep(state, catalog, 'pushup', 4)` 호출 후 상태 저장
  - `maintenanceCount(newState.history, 'pushup', stint.startedAt, newState.adjustedAtSessionIndex?.pushup)` == 0 확인
- [ ] 시나리오 (완전 리셋 후 재쌓기):
  - 위 상태에서 `setStep` 이후 새 승급 세션 + 유지 세션 3건을 붙임
  - `proposeSwitchForCurrent(state, catalog, monday)` 가 non-null 반환 (조정 이전 세션은 세지 않음)

**FR-13.4 `history` 불변**
- [ ] `const originalHistory = state.history;`
      `const newState = setStep(state, catalog, 'pushup', 3);`
      `assert.strictEqual(newState.history, originalHistory)` — 배열 참조까지 동일 (스프레드로도 새
      배열을 만들지 않는다 — history 는 손대지 않으므로)

**FR-13.5 해금 우회 불가**
- [ ] 빅4 미달 상태에서 `setStep(state, catalog, 'bridge', 3)` 예외 (위 EC-27) — 그 상태로 `checkGate`
      다시 부르면 여전히 잠김 (`unlocked === false`)

**FR-13.6 무리한 상향 허용**
- [ ] `steps.pushup = 4` 에서 `setStep(state, catalog, 'pushup', 10)` 성공
- [ ] 그 뒤 `abandonChallenge` → `canConsolidate === true`, 다지기 계획이 pushup 9단계를 향한다

**`AppState` 전 필드 보존 (Risk 5)**
- [ ] `setStep` 반환값의 `stints` 가 원본과 참조 동일 (`assert.strictEqual(newState.stints,
      state.stints)`)
- [ ] `proposals` 도 참조 동일
- [ ] `history` 도 참조 동일
- [ ] `steps` 는 새 객체 (해당 종목 값 변경)
- [ ] `adjustedAtSessionIndex` 는 새 객체 (해당 종목 값 추가)
- [ ] 조정 후 `applySession` / `abandonChallenge` / `recordSession` / `recordConsolidation` /
      `switchProgram` / `acceptProposal` 을 호출해도 `adjustedAtSessionIndex` 가 값 · 구조 동일하게
      전파된다 (각 함수당 1 케이스 이상)

### `proposal.ts` 확장 검증 (`tests/unit/proposal.test.ts`)

- [ ] `effectiveFloorIndex(history, id, floorDate)` — 인자 3개 (기존) 그대로 옛 동작. anchor 인자
      없이 부르면 기존과 완전 동일
- [ ] `effectiveFloorIndex(history, id, floorDate, anchor)` — anchor > setbackFloor 이면 anchor 반환
- [ ] `effectiveFloorIndex(history, id, floorDate, 0)` — 0 은 anchor 없음과 같은 효과 (Math.max 로
      setbackFloor 승)
- [ ] `maintenanceCount` / `promotionBaselineIndex` 도 새 인자를 그대로 전달
- [ ] `advanceProposals(state, catalog, monday)` 가 `state.adjustedAtSessionIndex` 를 자동으로 반영
      — 앵커 이후 세션만 계수하는 것을 검증하는 통합 케이스 1개 이상

### 기존 테스트 무변경 (Risk 3)

- [ ] Phase 3 FR-12 커밋 후의 테스트 수와 정확히 같다 (신규 tests/unit/steps.test.ts 증가 + proposal
      확장분 증가 만큼만 늘어난다)
- [ ] 승계 5항목 (0.1.0 「동작 보존 사양」) 이 여전히 통과 — gate/plan/evaluate/schedule/data 테스트

### 정합성

- [ ] `pnpm run check` 오류 · 경고 0
- [ ] `grep -n "adjustedAtSessionIndex" src/lib/domain/` 이 적절한 곳에서만 등장 (types.ts, steps.ts,
      proposal.ts). session.ts / evaluate.ts 등에서는 `...state` 스프레드로 자동 전파되므로 명시 등장이
      없어도 정상
- [ ] `grep -n "setStep" src/lib/domain/index.ts` 로 export 확인

---

## FR-15 커밋 이후

- [ ] `grep -n "이 수치를 상한으로" src/lib/domain/types.ts` 출력이 없다
- [ ] `grep -n "하한" src/lib/domain/types.ts` 이 새 주석을 포함
- [ ] `pnpm run check` 오류 · 경고 0
- [ ] `pnpm test` 결과 수 · 통과 여부가 FR-13 커밋 이후와 완전 동일 (코드 동작 무변경)

---

## Phase 3 전체 마감 확인

- [ ] `git log --oneline HEAD~3..HEAD` 로 3개 커밋 확인
  - 첫 커밋: `feat(domain)!: 보조 운동 …` (FR-12)
  - 둘째: `feat(domain): 단계 수동 세팅 API …` (FR-13)
  - 셋째: `docs(domain): TargetSet.max 주석 정정` (FR-15)
- [ ] 커밋 순서가 위와 일치 (types.ts 3중 편집을 피하기 위한 순서)
- [ ] 세 커밋 각각이 자기 SPEC 항목만 다룬다 (`git show HEAD~2 --stat` / `HEAD~1 --stat` / `HEAD --stat`
      로 파일 범위 확인)

---

## 실패 시 대처

- FR-13.3 시나리오 테스트 실패: `effectiveFloorIndex` / `maintenanceCount` 서명 확장이 `proposal.ts`
  안에서 완전히 전파되지 않은 것. `proposeSwitchForCurrent` 가 `adjustmentAnchors` 를 넘기고 있는지
  확인.
- `AppState` 필드 소실 (Risk 5 재발): `git diff` 로 어느 함수의 반환 리터럴이 `adjustedAtSessionIndex`
  를 누락했는지 확인. 대개 `evaluate.ts` / `session.ts` / `program.ts` / `proposal.ts` 중 하나. 스프레드
  `...state` 를 유지하고 필드만 덮어쓰는 형태로 수정.
- FR-12 이후 테스트 수가 예상보다 많이 줄었다: 검증 대상 테스트를 실수로 지웠거나, 새 것 (건너뜀
  검증) 을 추가하지 않은 것. GLOBAL 「기존 테스트 474개 처리 방침」의 삭제·재작성·신규 목록과 대조.
