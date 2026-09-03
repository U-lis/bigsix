# Phase 5: 회귀 · EC 대조 · 커버리지

## Objective

기능 구현은 Phase 4 에서 끝났다. 이 Phase 는 **검증 전용**이다.
SPEC 의 요구사항이 실제로 코드와 테스트에 반영되었는지를 전수 대조하고,
NFR 을 감사하며, 커버리지 목표를 충족시킨다.

**새 기능을 추가하지 않는다.** 누락이 발견되면 테스트를 보강하거나
해당 Phase 의 코드를 수정한다.

---

## Prerequisites

- [ ] Phase 4 완료 — FR-1 ~ FR-10 구현 완료
- [ ] 전체 테스트 통과 상태
- [ ] 워크트리 병합 완료 (`feature/program-session` 단일 브랜치)

---

## Scope

### In Scope
- Edge Case 11건 전수 대조 (NFR-4)
- 동작 보존 사양 5항목 생존 확인 (NFR-3 단서)
- NFR-1 / NFR-2 / NFR-5 / NFR-6 감사
- 커버리지 측정 및 부족분 보강
- 테스트 이름 정비 — EC 번호가 테스트 이름에 드러나게

### Out of Scope
- 새 기능 추가
- 리팩터링 — 동작이 바뀔 위험이 있는 변경
- `CHANGELOG.md` / `README.md` 작성 → `/dotclaude:update-docs` 로 별도 수행
- 성능 최적화

---

## Instructions

### Step 1: Edge Case 11건 전수 대조 (NFR-4)

**Action**: 각 EC 가 **정확히 하나 이상의 `test()` 이름에 매핑**되는지 확인한다.
테스트 이름에 `EC-N` 문자열을 포함시켜 grep 으로 대조 가능하게 만든다.

| EC | 상황 | 확인할 파일 | 확인 내용 |
|---|---|---|---|
| EC-1 | 미선택 시 계획 요청 | `test/calendar.test.ts` | `planOn` 이 `{ kind: 'no-program' }` 반환, 예외 없음 |
| EC-2 | 선택일이 휴식일 | `test/program.test.ts` | `startedAt` 이 다음 첫 운동일 |
| EC-3 | A → B → A | `test/program.test.ts` | 새 구간, 며칠차 1부터 |
| EC-4 | 하루 2회 기록 | `test/session.test.ts` | 둘 다 기록, 각각 판정 |
| EC-5 | 승급 직후 강등 | `test/proposal.test.ts` | 카운트 0 |
| EC-6 | 3회 전 추가 승급 | `test/proposal.test.ts` | 카운트 유지 |
| EC-7 | 전환 시 카운트 리셋 | `test/integration.test.ts` | `floorDate` 주입으로 자동 리셋 |
| EC-8 | 며칠 건너뜀 | `test/calendar.test.ts` | 며칠차 증가 + `missed` 보존 |
| EC-9 | 1단계 '불가능' | `test/session.test.ts` | `canConsolidate === false`, 단계 유지 |
| EC-10 | 구간 시작 전 조회 | `test/program.test.ts`, `test/calendar.test.ts` | 며칠차 0 |
| EC-11 | RPE 보류 | `test/evaluate.test.ts`, `test/proposal.test.ts` | 승급으로 치지 않음 |

대조 명령:
```bash
for n in 1 2 3 4 5 6 7 8 9 10 11; do
  printf 'EC-%s: ' "$n"
  grep -rc "EC-$n" test/ | grep -v ':0' | tr '\n' ' '
  echo
done
```
**11개 전부 최소 1건이 나와야 한다.** 0건인 EC 가 있으면 해당 Phase 의 테스트를 보강한다.

### Step 2: 동작 보존 사양 5항목 생존 확인 (NFR-3 단서)

**Action**: SPEC Constraints (a) 의 5항목이 새 테스트 구조에서도 검증되고 있는지 확인한다.
`test/evaluate.test.ts` 가 재작성되었으므로 특히 주의한다.

| 사양 | 확인 방법 |
|---|---|
| 해금 게이트 (빅4 전부 6단계 완수 → 7단계 진입) | `test/gate.test.ts` 존재 및 통과. 잠금/해금 양방향 케이스 |
| 진급 플로우차트 (90% 규칙, 유지세트=직전평균, 상급자 2/3세트 분기, 워밍업 최대 2세트) | `test/plan.test.ts` 에 4항목 각각의 케이스 |
| 승급 판정 — 수행 횟수로만 | `test/evaluate.test.ts` 에 케이스. 심박수 미사용 확인 |
| 다지기 증량 30 → 33 → 36 → 39 | `test/plan.test.ts` 에 케이스. `test/session.test.ts` 에서도 경유 확인 |
| RPE 정책 (거부권 평균 ≥ 8, 하향 직전 ≥ 9) | `test/evaluate.test.ts` + `test/plan.test.ts` |

**기준 커밋 `531fb61` 의 `test/evaluate.test.ts` 98줄을 꺼내 검증 항목을 목록화하고,
새 파일에서 각각이 대응되는지 하나씩 대조한다.**
```bash
git show 531fb61:test/evaluate.test.ts | grep -nE "^\s*(test|it)\("
```

### Step 3: NFR-1 감사 — 의존성 0

**Action**:
```bash
node -e "const p=require('./package.json'); console.log(JSON.stringify({d:p.dependencies, dd:p.devDependencies}, null, 2))"
ls node_modules 2>/dev/null | head
grep -rn "from 'node:" src/    # 내장 모듈만 허용
```
`dependencies` 가 비어 있어야 한다. `src/` 의 외부 import 는
`node:fs`(catalog.ts) 같은 **Node 내장 모듈만** 허용된다.

### Step 4: NFR-2 감사 — 순수성

**Action**: 신규 함수가 인자 `AppState` 를 변형하지 않는지 확인한다.
```bash
grep -rnE '\.push\(|\.splice\(|\.sort\(|\.reverse\(|state\.[a-z]+\s*=' src/
```
- `.push` 가 **인자로 받은 배열**에 대해 호출되면 위반이다. 새로 만든 배열에 대한 것은 무방하다
- `.sort` / `.reverse` 는 제자리 변형이므로 반드시 복사본에 적용되어야 한다
  (기존 `history.ts` 의 `meetsStandard` 가 `[...sets].sort(...)` 로 올바르게 처리하고 있다 — 같은 패턴 유지)
- `state.X = ...` 형태의 직접 대입은 위반이다

각 신규 모듈에 대해 "호출 후 원본 불변" 테스트가 존재하는지 확인한다.

### Step 5: NFR-5 감사 — 시스템 시각 미사용

**Action**:
```bash
grep -rn "new Date()" src/
grep -rn "Date.now()" src/
grep -rnE "new Date\(['\"]" src/
```
**세 검색 모두 0건이어야 한다.**
- `new Date()` / `Date.now()` — 엔진이 시스템 시각을 읽으면 결정성이 깨진다
- `new Date('...')` — ISO 문자열 파싱은 타임존 오프바이원을 유발한다 (ADR-5)

`src/date.ts` 내부에서 `new Date(ms)`(숫자 인자)를 쓰는 것은 허용된다 —
`Date.UTC` 결과를 포맷하기 위한 용도이며 시스템 시각을 읽지 않는다.

### Step 6: NFR-6 감사 — 격려 문구 · 백분율 동기부여 부재

**Action**: 엔진이 반환하는 모든 문자열(`reason`, `notes`, `sideNote`, 예외 메시지)을 검토한다.
```bash
grep -rnE '화이팅|잘했|훌륭|대단|힘내|축하|굿|파이팅|좋아요|멋지' src/
grep -rn '달성률\|진행률\|% 달성' src/
```
0건이어야 한다.

**주의**: 기존 `plan.ts` 의 `reason` 에는 `Math.round(RULES.attemptThreshold * 100)}%` 같은
백분율이 등장한다. 이는 **동기부여가 아니라 계산 근거의 사실 서술**이므로 허용된다
("직전 평균이 목표의 90% 이상"). 금지 대상은 "목표의 80% 달성! 조금만 더!" 같은 표현이다.
판단 기준: **그 문장이 사실을 진술하는가, 사용자를 부추기는가.**

### Step 7: 커버리지 측정 및 보강 (NFR-4)

**Action**:
```bash
node --experimental-strip-types --test --experimental-test-coverage test/
```
전체 ≥ 70% 를 확인한다. 모듈별로 확인해 낮은 곳을 보강한다.

우선 보강 대상:
- `src/date.ts` — 100% 목표 (전 Phase 의 기반)
- `src/proposal.ts` — `proposeSwitch` 의 6개 조기 반환 경로 전부
- `src/calendar.ts` — `reviewDay` 의 4상태 전부
- `src/program.ts` — `stintAt` 의 경계 조건

### Step 8: 사양 상수 정합성 확인

**Action**: 하드코딩된 상수가 데이터와 어긋나지 않는지 확인한다.
- `PROGRAM_ORDER` (proposal.ts) 가 `catalog.programs` 의 id 집합과 정확히 일치하는가 (FR-4.7)
- `LABEL_TO_ID` (schedule.ts) 가 모든 프로그램 요일표의 빅6 라벨을 커버하는가
  — 커버하지 못하면 그 종목이 조용히 보조 운동으로 분류된다
- `perSide` 단계가 정확히 16개인가 (FR-1 확정 사항)

이를 검증하는 테스트를 `test/data.test.ts` 또는 신규 `test/consistency.test.ts` 에 추가한다.

### Step 9: FR 전수 체크

**Action**: SPEC 의 FR-1 ~ FR-10 각 항목을 읽고 대응 구현·테스트를 확인한다.
특히 **"하지 않을 것" 으로 규정된 항목**을 확인한다 (구현되면 위반이다).

| FR | "하지 않을 것" | 확인 |
|---|---|---|
| FR-1.1 | 좌/우 분리 저장 | `SessionRecord.sets` 가 여전히 `number[]` 하나 |
| FR-1.5 | `sideNote` 가 계산에 관여 | `sideNoteFor` 시그니처가 `(id, perSide)` 뿐 |
| FR-3.6 | 과거 이력 pruning | `slice`/`splice`/상한 상수 부재 |
| FR-4.9 | 거절 이력으로 재제안 차단 | `proposeSwitch` 본문에 `'declined'` 부재 |
| FR-7.3 | 다지기 로직 재구현 | `session.ts` 에 증량 상수 부재 |
| ADR-4 | `'missed'` 저장 | `AppState` 에 미수행 필드 부재 |
| ADR-6 | 조회가 제안 생성 | `calendar.ts` 에 `proposeSwitch` 부재 |

---

## Implementation Notes

### 이 Phase 에서 코드를 고쳐야 할 때
감사 결과 위반이 발견되면 **해당 Phase 의 PLAN 을 다시 읽고** 그 Phase 의 의도대로 고친다.
Phase 5 에서 임기응변으로 고치면 설계 의도와 어긋날 수 있다.

### 테스트 이름 규칙
EC 대조를 grep 으로 하려면 테스트 이름에 `EC-N` 이 들어가야 한다.
예: `test('EC-9: 1단계에서 불가능 — canConsolidate 가 false', ...)`
이름을 바꾸는 것은 동작에 영향이 없으므로 이 Phase 에서 정비해도 안전하다.

### 커버리지 70% 의 의미
NFR-4 의 70% 는 **하한**이다. 커버리지를 채우기 위해 의미 없는 테스트를 추가하지 않는다.
`src/catalog.ts` 의 예외 경로처럼 실질적으로 도달하기 어려운 코드는 낮아도 무방하다.
중요한 것은 **EC 11건과 동작 보존 5항목이 전부 검증되는 것**이다.

---

## Completion Checklist

- [ ] EC-1 ~ EC-11 각각이 하나 이상의 테스트 이름에 매핑됨 (grep 으로 확인)
- [ ] 동작 보존 사양 5항목이 새 테스트에 살아 있음 (기준 커밋과 대조)
- [ ] NFR-1 — `dependencies` 비어 있음, `src/` 외부 import 0건
- [ ] NFR-2 — 신규 함수가 인자를 변형하지 않음. 각 모듈에 불변성 테스트 존재
- [ ] NFR-4 — 전체 커버리지 ≥ 70%
- [ ] NFR-5 — `new Date()` / `Date.now()` / `new Date('...')` 검색 0건
- [ ] NFR-6 — 격려·동기부여 문구 0건
- [ ] `PROGRAM_ORDER` 가 카탈로그 id 집합과 일치
- [ ] `LABEL_TO_ID` 가 전 프로그램 요일표의 빅6 라벨을 커버
- [ ] `perSide` 단계 16개 확인
- [ ] FR "하지 않을 것" 7항목 전부 미구현 확인
- [ ] 전체 테스트 통과
- [ ] `data/progressions.json` 무변경 (제약 c)

---

## Verification

### Manual Verification
```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session

# 전체 + 커버리지
node --experimental-strip-types --test --experimental-test-coverage test/

# EC 대조
for n in 1 2 3 4 5 6 7 8 9 10 11; do
  printf 'EC-%-3s ' "$n"; grep -rl "EC-$n" test/ | tr '\n' ' '; echo
done

# NFR-5
grep -rn "new Date()" src/; grep -rn "Date.now()" src/; grep -rnE "new Date\(['\"]" src/

# NFR-1
node -e "const p=require('./package.json');console.log(p.dependencies??{})"

# NFR-6
grep -rnE '화이팅|잘했|훌륭|대단|힘내|축하|파이팅' src/

# 제약 c
git diff --name-only main -- data/

# 타임존 3종
for tz in UTC Asia/Seoul America/Los_Angeles; do
  echo "== $tz"; TZ=$tz node --experimental-strip-types --test test/ 2>&1 | tail -5
done
```

### Expected Output
```
# fail 0
all files coverage >= 70%
EC-1 ~ EC-11 전부 파일 매핑 있음
(NFR-5 / NFR-6 grep 결과 없음)
{}
(data/ diff 없음)
타임존 3종 결과 동일
```

---

## Notes

- 이 Phase 는 **발견하는 것이 목적**이다. 아무것도 발견되지 않는다면 그것도 유효한 결과다.
- 발견된 위반은 이 문서의 아래 표에 기록하고, 수정 후 다시 감사한다.
- Phase 5 완료 후 `/dotclaude:update-docs` 로 `CHANGELOG.md`(신규 생성, 0.1.0)와
  `README.md` 를 갱신한다. Target Version 은 0.1.0 이다.
- GLOBAL.md 의 "설계 결정 — 확인 대기" 3건(ADR-2 필드명 통합, ADR-4 보조 운동 제외,
  ADR-6 2단계 API)이 사용자 확인을 받았는지 이 시점에 최종 확인한다.

### 감사 결과 기록

| 항목 | 결과 | 조치 |
|---|---|---|
| EC 대조 | | |
| 동작 보존 5항목 | | |
| NFR-1 | | |
| NFR-2 | | |
| NFR-4 커버리지 | | |
| NFR-5 | | |
| NFR-6 | | |

---

## Completion Date

## Completed By
