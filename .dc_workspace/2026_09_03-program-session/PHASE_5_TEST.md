# Phase 5: Test Cases

## Test Coverage Target

**Minimum**: 70% (NFR-4, 전체 기준)
**모듈별 권장**: `src/date.ts` 100%, `src/proposal.ts` ≥ 85%, `src/calendar.ts` ≥ 85%

이 Phase 는 **검증 전용**이다. 새 기능 테스트가 아니라
"기존 테스트가 SPEC 을 빠짐없이 덮는가" 를 확인하는 메타 검증과, 부족분 보강이 대상이다.

---

## Unit Tests

### 사양 상수 정합성 (`test/consistency.test.ts` 신규 또는 `test/data.test.ts` 확장)

#### `PROGRAM_ORDER` (FR-4.7)
- [ ] Test case: `PROGRAM_ORDER` 의 원소 수가 카탈로그 프로그램 수와 같다
  - Expected: 5
- [ ] Test case: `PROGRAM_ORDER` 의 모든 id 가 카탈로그에 존재한다
  - Verify: 오타·존재하지 않는 id 없음
- [ ] Test case: 카탈로그의 모든 프로그램 id 가 `PROGRAM_ORDER` 에 있다
  - Verify: 누락 없음. 새 프로그램이 추가되면 이 테스트가 깨진다
- [ ] Test case: 순서가 SPEC FR-4.7 이 명시한 순서와 정확히 일치한다
  - Expected: `new_blood → good_behavior → veterano → solitary_confinement → supermax`

#### `LABEL_TO_ID` (schedule.ts)
- [ ] Test case: 모든 프로그램 요일표의 빅6 라벨이 매핑에 존재한다
  - Setup: 5종 × 7요일의 모든 라벨을 수집
  - Verify: 빅6 종목명이 전부 매핑되고, 매핑되지 않은 라벨은
    보조 운동 3종(악력·종아리·목)뿐
  - **매핑 누락 시 그 종목이 조용히 보조 운동으로 분류되는 버그를 잡는다**
- [ ] Test case: 매핑의 모든 값이 유효한 `ProgressionId` 다
- [ ] Test case: 매핑에 빅6 6종목이 전부 등장한다

#### `perSide` 데이터 (FR-1)
- [ ] Test case: `perSide: true` 단계가 정확히 16개다
  - Verify: SPEC FR-1 확정 사항
- [ ] Test case: 그 16개가 `pushup`/`squat`/`pullup`/`hspu` × 7~10단계다
- [ ] Test case: `legraise`/`bridge` 에는 `perSide` 단계가 없다
  - Verify: 데이터 누락이 아니라 정확한 값임을 고정 (FR-1 확정)

#### `data/progressions.json` 무변경 (제약 c)
- [ ] Test case: 6종목 × 10단계 = 60단계가 전부 존재한다
- [ ] Test case: 프로그램 5종의 요일표가 7요일 키를 모두 갖는다
- [ ] Test case: 파일이 기준 커밋 이후 변경되지 않았다
  - Verify: `git diff main -- data/progressions.json` 이 비어 있음 (코드 감사)

---

## Integration Tests

### Edge Case 전수 대조 (NFR-4) — 메타 검증

각 EC 가 하나 이상의 `test()` 이름에 매핑됨을 **grep 으로** 확인한다.
아래는 대조표이며, 실제 검증은 명령 실행으로 한다.

- [ ] **EC-1** 미선택 시 계획 요청 → `test/calendar.test.ts`
- [ ] **EC-2** 선택일이 휴식일 → `test/program.test.ts`
- [ ] **EC-3** A → B → A → `test/program.test.ts`
- [ ] **EC-4** 하루 2회 기록 → `test/session.test.ts` (+ `test/calendar.test.ts`)
- [ ] **EC-5** 승급 직후 강등 → `test/proposal.test.ts`
- [ ] **EC-6** 3회 전 추가 승급 → `test/proposal.test.ts`
- [ ] **EC-7** 전환 시 카운트 리셋 → `test/integration.test.ts`
- [ ] **EC-8** 며칠 건너뜀 → `test/calendar.test.ts`
- [ ] **EC-9** 1단계 '불가능' → `test/session.test.ts`
- [ ] **EC-10** 구간 시작 전 조회 → `test/program.test.ts`, `test/calendar.test.ts`
- [ ] **EC-11** RPE 보류 → `test/evaluate.test.ts`, `test/proposal.test.ts`
- [ ] Test case: 11개 EC 전부 최소 1건 매핑 (0건인 EC 없음)

### 동작 보존 사양 5항목 (NFR-3 단서) — 메타 검증

- [ ] **해금 게이트**: 빅4 가 전부 7단계 이상일 때만 `bridge`/`hspu` 해금
  - 확인 위치: `test/gate.test.ts`
  - 양방향 케이스(잠김/해금) 모두 존재
- [ ] **90% 규칙**: 직전 평균이 목표의 90% 이상이면 기준 직접 도전
  - 확인 위치: `test/plan.test.ts`
- [ ] **유지세트 = 직전 평균**: 내림 처리
  - 확인 위치: `test/plan.test.ts`
- [ ] **상급자 2세트/3세트 분기**: `goalStd.sets >= 3` 이면 `sets - 1`, 아니면 1
  - 확인 위치: `test/plan.test.ts`
- [ ] **워밍업 최대 2세트**: `RULES.maxWarmupSets` 로 잘림
  - 확인 위치: `test/plan.test.ts`
- [ ] **승급 판정 — 수행 횟수로만**: 심박수 미사용
  - 확인 위치: `test/evaluate.test.ts`
- [ ] **다지기 증량 30 → 33 → 36 → 39**: 3회 누적마다 10%
  - 확인 위치: `test/plan.test.ts` (+ `test/session.test.ts` 경유 확인)
- [ ] **RPE 거부권**: 최근 3회 평균 ≥ 8 이면 보류
  - 확인 위치: `test/evaluate.test.ts`
- [ ] **RPE 하향**: 직전 ≥ 9 이면 유지세트 −1
  - 확인 위치: `test/plan.test.ts`
- [ ] Test case: 기준 커밋 `531fb61` 의 `evaluate.test.ts` 검증 항목이 전부 대응된다
  - Action: `git show 531fb61:test/evaluate.test.ts` 로 원본을 꺼내 항목 대조

### 전체 시나리오 회귀 (end-to-end)

- [ ] Test case: 미선택 → 선택 → 훈련 → 승급 → 제안 → 승인 → 새 구간 전체 흐름
  - Action 1: `planOn` → `no-program`
  - Action 2: `selectProgram('good_behavior', '2026-09-07')`
  - Action 3: 여러 주에 걸쳐 `recordSession` 으로 전 종목 승급 + 유지 3회
  - Action 4: 월요일에 `proposeSwitchForCurrent` → `commitProposal`
  - Action 5: 화요일 `planOn` → 제안 노출 확인
  - Action 6: `acceptProposal` → 새 구간
  - Action 7: `reviewRange` 로 전 기간 조회
  - Verify: 각 날짜의 `programId` / `dayNumber` / `status` 가 전부 정확하다
- [ ] Test case: 포기 → 다지기 → 재도전 → 승급 흐름
  - Verify: `abandoned` 와 `consolidation` 기록이 남고, 이후 승급이 정상 판정된다
- [ ] Test case: 전환 후 이전 구간 조회가 계속 정확하다
  - Verify: 과거 데이터가 소실되지 않는다 (FR-3.6)

---

## Edge Cases

### NFR 감사 (코드 감사 — 테스트가 아니라 grep 으로 확인)

#### NFR-1 — 의존성 0
- [ ] `package.json` 의 `dependencies` 가 비어 있다
- [ ] `src/` 의 외부 import 가 Node 내장 모듈(`node:fs`)뿐이다
- [ ] `node_modules` 에 런타임 의존이 없다

#### NFR-2 — 순수성
- [ ] 인자로 받은 배열에 대한 `.push` / `.splice` / `.sort` / `.reverse` 0건
- [ ] `state.X = ...` 형태의 직접 대입 0건
- [ ] 각 신규 모듈에 "호출 후 원본 불변" 테스트가 존재한다
  - `program.ts`, `proposal.ts`, `session.ts`, `calendar.ts` 각각

#### NFR-5 — 시스템 시각 미사용
- [ ] `grep -rn "new Date()" src/` → 0건
- [ ] `grep -rn "Date.now()" src/` → 0건
- [ ] `grep -rnE "new Date\(['\"]" src/` → 0건 (ISO 문자열 파싱)
- [ ] `src/date.ts` 의 `new Date(ms)` 는 숫자 인자뿐 (허용)

#### NFR-6 — 격려 문구 부재
- [ ] 격려 표현 grep 0건
- [ ] `reason` / `notes` / `sideNote` 문자열이 전부 사실 서술이다
  - 판단 기준: 사실을 진술하는가, 사용자를 부추기는가
  - 허용 예: "직전 평균 12.0 이 목표 15 의 90% 이상. 기준 3×15 직접 도전."
  - 금지 예: "80% 달성! 조금만 더 힘내세요!"
- [ ] 예외 메시지도 같은 원칙을 따른다

### FR "하지 않을 것" 확인
- [ ] **FR-1.1** `SessionRecord.sets` 가 `number[]` 하나. 좌/우 분리 필드 없음
- [ ] **FR-1.5** `sideNoteFor` 시그니처가 `(id, perSide)` 뿐 — 수치에 접근 불가
- [ ] **FR-3.6** `program.ts` 에 `slice`/`splice`/`shift`/상한 상수 없음
- [ ] **FR-4.9** `proposeSwitch` 본문에 `'declined'` 문자열 없음
- [ ] **FR-7.3** `session.ts` 에 다지기 증량 상수 없음
- [ ] **ADR-4** `AppState` 에 미수행 관련 필드 없음
- [ ] **ADR-6** `calendar.ts` 에 `proposeSwitch` 호출 없음
- [ ] **ADR-1** `planDay` / `planWeek` 시그니처가 기준 커밋과 동일

### 타임존 교차 검증 (FR-6.3)
- [ ] `TZ='UTC'` 전체 테스트 통과
- [ ] `TZ='Asia/Seoul'` 전체 테스트 통과
- [ ] `TZ='America/Los_Angeles'` 전체 테스트 통과
- [ ] `TZ='Pacific/Kiritimati'` (UTC+14) 전체 테스트 통과
- [ ] `TZ='Pacific/Midway'` (UTC-11) 전체 테스트 통과
- [ ] 다섯 타임존의 통과/실패 수가 동일하다

### 커버리지 (NFR-4)
- [ ] 전체 ≥ 70%
- [ ] `src/date.ts` = 100%
- [ ] `src/proposal.ts` — `proposeSwitch` 의 6개 조기 반환 경로 전부 도달
- [ ] `src/calendar.ts` — `reviewDay` 의 4상태 전부 도달
- [ ] `src/program.ts` — `stintAt` 의 경계 조건 도달
- [ ] 커버리지가 낮은 모듈에 대해 **의미 있는** 테스트로 보강 (숫자 채우기 금지)

---

## Mock/Stub Requirements

**없음.** 프로젝트 전체에 모킹이 필요한 지점이 없다 — 이것 자체가 NFR-1/NFR-5 의 결과다.

---

## Test File Structure

```
test/
├── consistency.test.ts  # 신규 (선택) — 사양 상수 정합성
├── data.test.ts         # 유지 (+ perSide 16개 검증 추가 가능)
├── gate.test.ts         # 유지 — 해금 게이트 동작 보존
├── plan.test.ts         # 유지 + sideNote — 플로우차트·다지기·RPE 동작 보존
├── evaluate.test.ts     # 재작성됨 — 승급 판정 동작 보존 + ADR-3
├── schedule.test.ts     # 유지 — ADR-1 증명
├── date.test.ts         # Phase 1
├── program.test.ts      # Phase 3A
├── proposal.test.ts     # Phase 3B
├── session.test.ts      # Phase 3C
├── integration.test.ts  # Phase 3.5
├── calendar.test.ts     # Phase 4
└── helpers.ts
```

---

## Test Execution Commands

```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session

# 전체 + 커버리지
node --experimental-strip-types --test --experimental-test-coverage test/

# EC 전수 대조
for n in 1 2 3 4 5 6 7 8 9 10 11; do
  printf 'EC-%-3s ' "$n"; grep -rl "EC-$n" test/ | tr '\n' ' '; echo
done

# 동작 보존 — 기준 커밋의 evaluate 테스트 항목 목록
git show 531fb61:test/evaluate.test.ts | grep -nE "^\s*(test|it)\("

# NFR 감사
grep -rn "new Date()" src/; grep -rn "Date.now()" src/; grep -rnE "new Date\(['\"]" src/
node -e "const p=require('./package.json');console.log(p.dependencies??{})"
grep -rnE '화이팅|잘했|훌륭|대단|힘내|축하|파이팅' src/
grep -rnE '\.push\(|\.splice\(|\.sort\(|\.reverse\(' src/

# 타임존 5종
for tz in UTC Asia/Seoul America/Los_Angeles Pacific/Kiritimati Pacific/Midway; do
  echo "== $tz"
  TZ=$tz node --experimental-strip-types --test test/ 2>&1 | grep -E '^# (pass|fail)'
done

# 제약 c
git diff --name-only main -- data/
```

---

## Test Status

| Test Category | Total | Passed | Failed | Coverage |
|--------------|-------|--------|--------|----------|
| 사양 상수 정합성 | - | - | - | -% |
| EC 전수 대조 (11건) | 11 | - | - | - |
| 동작 보존 5항목 | 5 | - | - | - |
| NFR 감사 (1/2/5/6) | 4 | - | - | - |
| 타임존 교차 (5종) | 5 | - | - | - |
| **전체 테스트** | - | - | - | -% |

*Updated by code-validator upon completion*
