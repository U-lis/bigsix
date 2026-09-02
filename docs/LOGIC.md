# 진행 로직 (bigsix-engine)

UI 없는 순수 함수 모듈. `src/` 아래, 상태를 변형하지 않고 새 값을 돌려준다.
테스트: `npm test` (Node 24 내장 러너, 의존성 0)

## 상태

```ts
AppState = {
  steps: { pushup: 5, squat: 3, ... }   // 종목별 현재 훈련 단계
  history: SessionRecord[]              // 시간순 운동 기록
}
SessionRecord = { date, progressionId, step, performedStep?, sets, rpe?, kind, outcome? }
```

`step` 은 훈련 중인 단계, `performedStep` 은 실제로 수행한 단계(다지기면 `step - 1`).
`sets` 는 세트별 실제 수행값(횟수 또는 초). `rpe` 는 1~10, 선택 입력.
`kind` 는 `work`(정규) 또는 `consolidation`(이전 단계 다지기).
`outcome: 'abandoned'` 는 사용자가 도중에 '불가능' 을 눌러 중단한 도전이다.

## 기능 4개

### 1. 해금 판정 — `checkGate(state, catalog, id)`
브리지·핸드스탠드는 **빅4 전부 6단계 완료** 전에는 잠긴다. 잠긴 이유를 종목별로 돌려준다.
빅4는 항상 열려 있다.

### 2. 오늘 뭘 얼마나 — `planDay(state, catalog, programId, weekday)`
프로그램 표(요일별 종목)에 현재 단계의 목표를 채워 넣는다.
반환: 운동 목록 + 보조 운동(악력·종아리·목) + 잠긴 종목 + 휴식일 여부.

종목 하나의 목표는 `planExercise` 가 계산한다. 책 플로우차트 그대로:

| 상황 | 다음 세션 목표 |
|---|---|
| 초보자 기준을 아직 못 넘음 | 매번 초보자 기준 도전 (실패 시 아래 '다지기 전환' 참조) |
| 초보자 통과, 중급자 미달 | 유지 1세트(직전 평균) + 중급자까지 최대한 |
| 중급자 통과, 상급자가 2세트 | 유지 1세트 + 상급자까지 최대한 |
| 중급자 통과, 상급자가 3세트 | 유지 2세트 + 마지막 세트 최대한 |
| 직전 평균이 목표의 90% 이상 | 목표 기준 자체에 도전 |

워밍업은 최대 2세트. 1~2단계는 1단계 중급+상급, 3단계부터는 직전 두 단계의 중급 기준.
핸드스탠드 2단계에는 1단계(월 헤드스탠드)가 동반 단계로 자동으로 붙는다.

### 2-1. 다지기 전환 — `canConsolidate` / `planConsolidation`

초보자 기준에 도전하다 안 되겠다 싶으면 사용자가 **그 자리에서 '불가능'** 을 누른다.
세션을 건너뛰지 않고, 확인을 받은 뒤 **같은 날 바로 이전 단계 세션으로 전환**한다.

```ts
const plan = planExercise(state, catalog, 'pushup');   // 5단계 초보자 1×5 도전
// 사용자가 4회에서 '불가능' → 도전 기록을 outcome:'abandoned' 로 남기고
if (canConsolidate(state, catalog, 'pushup')) {
  const fallback = planConsolidation(state, catalog, 'pushup');  // 4단계 2×25
}
```

`currentStep` 은 5단계 그대로다. 내려가는 건 그날 세션뿐이다.

**수행량은 다지기가 쌓일수록 올라간다.** 이전 단계 상급자 기준을 기준값으로,
다지기 `consolidationBumpEvery`(3)회마다 `consolidationBumpRatio`(0.1)만큼 더한다.

| 누적 다지기 | 0~2회 | 3~5회 | 6~8회 | 9~11회 |
|---|---|---|---|---|
| 기준 30 | 30 | 33 | 36 | 39 |
| 기준 25 | 25 | 28 | 30 | 33 |

같은 자리에 머무는 동안 자극이 늘지 않는 문제를 이걸로 막는다.
1단계에는 내려갈 곳이 없어 `canConsolidate` 가 false 를 돌려준다.

### 3. 승급 판정 — `evaluateSession(state, catalog, record)`
상급자(10단계는 최상급자) 기준을 채웠으면 다음 단계로. 판정은 **수행 횟수만** 본다.
세트를 더 많이 했으면 상위 N개로 판정한다.

승급하지 않는 경우:
- 기준 미달
- 다지기 세션 (판정 대상 아님)
- 10단계 (더 올라갈 곳 없음)
- **RPE 거부권** — 최근 3회 RPE 평균 ≥ 8 이면 기준을 채워도 보류

`applySession` 이 판정 + 상태 갱신을 한 번에 한다.

### 4. RPE 반영
- **승급 거부권**: 위 참조. RPE 를 입력하지 않으면 작동하지 않는다.
- **목표 하향**: 직전 RPE ≥ 9 면 다음 세션의 유지 세트 목표를 1 낮춘다.

심박수는 쓰지 않는다. 이 프로그램은 저반복 고강도 구간이 많아 근력 진전과 심박 반응이 무관하다.

## 조정 가능한 값 — `src/rules.ts`

`book` 주석이 붙은 값은 책에 명시된 것, 나머지는 앱 정책이다.

| 상수 | 값 | 출처 |
|---|---|---|
| `gateStep` | 6 | book |
| `gateRequiresCompletion` | true | 결정 — 6단계 완수 후 7단계 진입 |
| `attemptThreshold` | 0.9 | book |
| `maxWarmupSets` | 2 | book |
| `startStep` | 2 | book |
| `consolidationSets` | 2 | book |
| `consolidationBumpEvery` / `Ratio` | 3 / 0.1 | 정책 |
| `rpeVetoWindow` / `rpeVetoMean` | 3 / 8 | 정책 |
| `rpeDownshiftAt` / `Amount` | 9 / 1 | 정책 |

## 책과 다른 지점

책의 플로우차트는 초보자 기준에 실패하면 **다음 세션** 을 다지기로 잡는다.
이 구현은 **같은 세션 안에서** 사용자 확인을 받아 전환한다. 그러지 않으면 실패한 날이
통째로 빈 날이 되기 때문이다. 또 책에는 없는 **다지기 누적에 따른 수행량 증가** 를 넣었다.
둘 다 `src/rules.ts` 의 상수로 조정할 수 있고, 승급 기준 자체는 건드리지 않는다.
