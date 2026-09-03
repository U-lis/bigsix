# Phase 3B: 자동 전환 제안

## Objective

`src/proposal.ts` 를 신설해 FR-4(자동 전환 제안) 전체를 구현한다.
ADR-6(생성과 노출의 분리)과 ADR-7(카운트는 파생 계산)이 이 Phase 의 핵심이다.

**병렬 Phase**: 3A / 3C 와 동시 실행 가능. 파일 겹침 0.

---

## Prerequisites

- [ ] Phase 2 완료 — `record.promotedTo` / `record.blockedBy` 가 `history` 에 남는다
- [ ] Phase 1 의 `isMonday`, `diffDays` 사용 가능
- [ ] 워크트리 분리 (병렬 실행 시):
      `git worktree add ../bigsix-feature-program-session-3B feature/program-session-3B feature/program-session`

---

## Scope

### In Scope
- `src/proposal.ts` (신규) — 판정 + 제안 레코드 상태 전이
- `test/proposal.test.ts` (신규)

### Out of Scope — 병렬 안전을 위한 절대 규칙
- **`src/index.ts` 를 읽지도 쓰지도 않는다.** export 통합은 Phase 3.5 단독 책임
- **`test/helpers.ts` 를 수정하지 않는다.** 고유 픽스처는 `test/proposal.test.ts` 안에 로컬로
- **`src/program.ts` 를 import 하지 않는다.** 3A 와 동시 진행 중이므로 존재를 가정하지 않는다
- **`acceptProposal` 의 실제 구간 전환** → Phase 3.5. 이 Phase 는 `proposals` 배열 갱신까지만 한다
- 제안을 화면에 붙이는 것(`planOn` 의 `proposal` 필드) → Phase 4

---

## Instructions

### Step 1: 승급 기준점 계산 (ADR-7 핵심)

**Files**: `src/proposal.ts`

**Action**: 모듈 내부 함수를 만든다.

```
promotionBaseline(history, progressionId, floorDate: IsoDate): IsoDate | null
```

`history` 에서 해당 종목의 세션을 **`floorDate` 이상인 것만** 추려, 그중
`promotedTo !== undefined` 인 **가장 이른** 레코드의 `date` 를 반환한다. 없으면 `null`.

**"가장 이른" 인 이유가 EC-6 이다.** SPEC FR-4.4 는 "카운트 도중 추가 승급이 일어나도
카운트를 리셋하지 않는다" 고 한다. 기준점을 매번 **마지막** 승급으로 잡으면 추가 승급마다 리셋된다.
따라서 **카운트가 시작된 승급**, 즉 `floorDate` 이후 구간에서 **처음 나타나는** 승급이 기준점이다.

`floorDate` 인자는 Phase 3.5 에서 `currentStint.startedAt` 이 주입될 자리다 (EC-7).
**3B 는 `program.ts` 를 import 하지 않고 이 값을 파라미터로 받는다.**

### Step 2: 강등 무효화 판정 (EC-5)

**Files**: `src/proposal.ts`

**Action**: 모듈 내부 함수를 만든다.

```
hasSetback(history, progressionId, since: IsoDate): boolean
```

`since` **이후**(경계 포함)의 해당 종목 세션 중 하나라도 아래에 해당하면 `true`:
- `outcome === 'abandoned'`
- `kind === 'consolidation'`

FR-4.3 이 강등을 "`outcome: 'abandoned'` 기록 또는 그로 인해 발생한 `kind: 'consolidation'` 세션의 조합"
으로 정의한다. SPEC 충돌 4 대로 **스키마 변경이 필요 없다.**

**주의**: 기준점 세션 자신은 승급 세션이므로 `abandoned` 도 `consolidation` 도 아니다.
경계 포함이어도 문제가 없다.

### Step 3: 종목별 카운트 (FR-4.1, FR-4.2)

**Files**: `src/proposal.ts`

**Action**:

```
maintenanceCount(history, progressionId, floorDate: IsoDate): number
```

1. `baseline = promotionBaseline(history, progressionId, floorDate)`. `null` 이면 `0` 반환
2. `hasSetback(history, progressionId, baseline)` 이면 **`0` 반환** (EC-5 리셋)
3. `baseline` **이후**(그 승급 세션 자신은 제외)의 해당 종목 세션 수를 반환한다

FR-4.2: `kind` 가 `work` 든 `consolidation` 든 **그 종목의 세션이면 카운트한다.**
다만 `consolidation` 이 있으면 2번에서 이미 `0` 이 되므로 실질적으로는 `work` 만 남는다.
그래도 **필터 조건에 `kind` 를 넣지 않는다** — FR-4.2 의 문언을 코드로 그대로 표현한다.

날짜가 아니라 **세션 수**다. 같은 날 2회는 2로 센다 (FR-4.2, EC-4).

### Step 4: 다음 순번 프로그램 (FR-4.7)

**Files**: `src/proposal.ts`

**Action**: 고정 순서 배열을 모듈 상수로 둔다.

```
PROGRAM_ORDER = ['new_blood','good_behavior','veterano','solitary_confinement','supermax']
```

`nextProgramId(programId): string | null` — 배열에서 다음 원소. `supermax` 면 `null`.
배열에 없는 id 면 `null`.

**카탈로그 배열 순서에 의존하지 않는다.** FR-4.7 이 순서를 고정 사양으로 명시했으므로
명시적 상수로 둔다. 단, Phase 5 에서 이 상수가 `catalog.programs` 의 id 집합과 일치하는지 검증한다.

### Step 5: `proposeSwitch` — 순수 판정 (FR-4.1, FR-4.5, FR-4.6, FR-4.10)

**Files**: `src/proposal.ts`

**Action**:

```
proposeSwitch(state, catalog, date: IsoDate, opts: { floorDate: IsoDate; programId: string })
  : SwitchProposal | null
```

판정 순서 (하나라도 걸리면 즉시 `null`):
1. `isMonday(date)` 가 `false` → `null` (**FR-4.6: 생성은 월요일에만**)
2. `nextProgramId(opts.programId)` 가 `null` → `null` (FR-4.7: `supermax` 에서는 제안하지 않는다)
3. 이미 `pending` 제안이 있으면 → `null` (FR-4.6b: 미결 제안은 최대 1개)
4. 대상 종목 결정 — `opts.programId` 의 요일표가 다루는 빅6 종목 중
   **`checkGate(state, catalog, id).unlocked === true` 인 것만** (FR-4.5).
   잠긴 종목(`bridge`/`hspu`)은 제외한다
5. 대상 종목이 0개면 → `null` (판정할 것이 없다)
6. 대상 종목 **전부**가 `maintenanceCount(...) >= 3` → 제안 생성. 하나라도 미달이면 `null`

반환하는 `SwitchProposal`:
- `proposedAt: date`
- `fromProgramId: opts.programId`
- `toProgramId: nextProgramId(...)`
- `status: 'pending'`
- `resolvedAt: null`

**이 함수는 상태를 저장하지 않는다** (FR-4.10, NFR-2). 반환값을 `commitProposal` 에 넘기는 것은 호출자다.

**`opts` 로 `programId`/`floorDate` 를 받는 이유**: 3A 의 `currentStint` 를 import 하지 않기 위함이다.
Phase 3.5 에서 이 두 값을 `currentStint` 에서 뽑아 주입하는 래퍼를 만든다.
`opts` 형태를 유지하면 3.5 의 배선이 순수한 추가가 되고 3B 코드를 다시 고칠 필요가 없다.

**대상 종목 추출 시 `LABEL_TO_ID` 가 필요하다.** 3A 가 `schedule.ts` 에서 이것을 export 하지만
3B 는 3A 에 의존할 수 없다. **`src/schedule.ts` 에서 export 하는 변경은 3A·3B 양쪽이 동일하게 수행한다.**
같은 줄을 같은 내용으로 고치므로 머지 시 충돌이 나더라도 해소가 자명하다.
대안으로 `catalog.progressions.map(p => p.id)` 와 프로그램 요일표의 라벨을 대조해도 되지만,
매핑 중복을 피하기 위해 export 방식을 택한다.

### Step 6: 상태 전이 함수 3종 (ADR-6, FR-4.6a, FR-4.6b, FR-4.9)

**Files**: `src/proposal.ts`

| 함수 | 동작 |
|---|---|
| `commitProposal(state, proposal): AppState` | `proposals` 에 push. 이미 `pending` 이 있으면 **예외를 던진다** (불변식 위반) |
| `activeProposal(state): SwitchProposal \| null` | `proposals` 에서 `status === 'pending'` 인 것. 없으면 `null`. **`date` 인자를 받지 않는다** — 날짜 무관하게 매일 노출된다 (FR-4.6a) |
| `declineProposal(state, onDate): AppState` | `pending` 을 `status: 'declined'`, `resolvedAt: onDate` 로 갱신 (FR-4.9) |
| `markAccepted(state, onDate): AppState` | `pending` 을 `status: 'accepted'`, `resolvedAt: onDate` 로 갱신. **구간 전환은 하지 않는다** — Phase 3.5 |

`declineProposal` / `markAccepted` 는 `pending` 이 없으면 상태를 그대로 반환한다 (no-op).
예외를 던지지 않는다 — 사용자가 같은 버튼을 두 번 눌러도 안전해야 한다.

**FR-4.9 의 핵심**: `proposeSwitch` 는 `status === 'declined'` 레코드를 **읽지 않는다.**
쿨다운도 영구 차단도 없다. 거절 이력은 조회·통계 목적으로만 남는다.
리뷰 시 `proposeSwitch` 본문에 `'declined'` 문자열이 등장하지 않음을 확인한다.

---

## Implementation Notes

### 왜 생성(월요일)과 노출(매일)을 분리해야 하는가
FR-4.6(생성은 월요일) + FR-4.6a(노출은 매일) + FR-5.5/NFR-2(조회는 순수)를 동시에 만족시키려면
**조회가 제안을 만들어 저장할 수 없다.** 조회 함수가 순수하면서 화요일에 제안을 보여주려면
그 제안이 이미 상태에 있어야 한다. 그래서 `proposeSwitch`(생성 판정) 와
`activeProposal`(저장된 것 노출) 이 별개 함수다.

### `activeProposal` 이 날짜를 받지 않는 것이 사양이다
날짜를 받으면 "월요일에만 보여준다" 같은 구현이 슬쩍 들어갈 수 있다.
FR-4.6a 는 정확히 그것을 금지한다. **시그니처에 날짜가 없는 것이 사양을 강제한다.**

### EC-5 와 EC-6 이 서로 반대 방향인 이유
- EC-6: 기준점 **이후**의 승급은 무시한다 → 기준점을 **가장 이른** 승급으로 잡는다
- EC-5: 기준점 이후의 **강등**은 카운트를 무효화한다 → `hasSetback` 이 `true` 면 0

두 규칙이 같은 스캔 구간(`baseline` 이후)을 보면서 승급은 무시하고 강등은 반영한다.
구현 시 이 비대칭을 헷갈리지 않도록 주석을 남긴다.

### EC-11 은 별도 코드가 필요 없다
RPE 거부권으로 보류된 세션은 `promotedTo === undefined` 다 (Phase 2, ADR-3).
`promotionBaseline` 이 `promotedTo !== undefined` 만 찾으므로 그 세션은 애초에 기준점 후보가 아니다.
**"RPE 보류를 제외한다" 는 조건문을 쓰지 않는다.** 테스트로 이 자동 충족을 증명한다.

---

## Sample Code

없음. 기존 패턴(순수 함수 + 배열 필터 + 스프레드 반환)에서 추론 가능하다.

---

## Completion Checklist

- [ ] `src/proposal.ts` 신규 작성
- [ ] `promotionBaseline` — `floorDate` 이후 **가장 이른** 승급 (EC-6)
- [ ] `hasSetback` — `abandoned` 또는 `consolidation` (FR-4.3, EC-5)
- [ ] `maintenanceCount` — 세션 수 기준, `kind` 무관 필터 (FR-4.2)
- [ ] `PROGRAM_ORDER` 상수 + `nextProgramId` — `supermax` → `null` (FR-4.7)
- [ ] `proposeSwitch` — 월요일 아니면 `null` (FR-4.6)
- [ ] `proposeSwitch` — 잠긴 종목 제외 (FR-4.5)
- [ ] `proposeSwitch` — 대상 종목 **전부** 3회 이상일 때만 제안 (FR-4.1)
- [ ] `proposeSwitch` — `pending` 이 이미 있으면 `null` (FR-4.6b)
- [ ] `proposeSwitch` 본문에 `'declined'` 문자열 부재 (FR-4.9)
- [ ] `proposeSwitch` 가 상태를 저장하지 않음 — 순수 (FR-4.10)
- [ ] `proposeSwitch` 가 `opts: { floorDate, programId }` 형태로 인자를 받음 (3.5 배선 대비)
- [ ] `commitProposal` / `activeProposal` / `declineProposal` / `markAccepted` 구현
- [ ] `activeProposal` 시그니처에 날짜 인자 **없음** (FR-4.6a)
- [ ] `markAccepted` 가 구간 전환을 하지 않음 (Phase 3.5 책임)
- [ ] `src/program.ts` 를 import 하지 않음
- [ ] `src/index.ts` 를 **건드리지 않았음**
- [ ] `test/helpers.ts` 를 **건드리지 않았음**
- [ ] `test/proposal.test.ts` 작성 — EC-5 / EC-6 / EC-11 포함
- [ ] 전체 테스트 통과
- [ ] 타입 체크 통과

---

## Verification

### Manual Verification
```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session-3B

node --experimental-strip-types --test test/proposal.test.ts
node --experimental-strip-types --test test/

# 병렬 안전 규칙
git diff --name-only feature/program-session | grep -E 'src/index.ts|test/helpers.ts|src/program.ts'

# FR-4.9 — 거절 이력이 재제안을 막지 않음
grep -n "declined" src/proposal.ts

# 3A 비의존 확인
grep -n "program.ts" src/proposal.ts
```

### Expected Output
```
# fail 0
(git diff grep 결과 없음)
# declined 는 declineProposal 안에서만 등장. proposeSwitch 본문에는 없음
(program.ts import 결과 없음)
```

---

## Notes

- 이 Phase 의 함수들은 `floorDate` 를 파라미터로 받으므로 **EC-7(전환 시 리셋)을 단독 검증할 수 없다.**
  3B 는 "`floorDate` 를 주면 그 이후만 본다" 까지만 증명하고,
  실제로 `currentStint.startedAt` 이 주입되는지는 Phase 3.5 의 통합 테스트가 본다.
- `proposeSwitch` 의 대상 종목 추출을 위해 `schedule.ts` 의 `LABEL_TO_ID` export 가 필요하다.
  3A 도 같은 변경을 하므로 머지 시 동일 내용 충돌이 날 수 있다. **해소는 자명하다 — 한쪽을 취하면 된다.**
- FR-4.1 의 "상급자 기준 충족 → 승급" 은 `promotedTo` 존재가 곧 증명이다.
  승급은 상급자 기준 충족 없이는 일어나지 않기 때문이다 (Phase 2 `evaluateSession`).
  **별도로 상급자 기준을 재판정하지 않는다** — SPEC 충돌 3 이 금지하는 재평가다.

---

## Completion Date

## Completed By
