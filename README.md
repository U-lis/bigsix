# bigsix

폴 웨이드 『죄수 운동법』(*Convict Conditioning*)의 **빅6 6종 × 10단계** 진행 로직.
프로그램(루틴)을 고르면 실제 달력 날짜로 오늘 무엇을 얼마나 할지 계산하고,
기준을 채웠는지 판정해 다음 단계로 올린다. 지나간 날의 수행 여부도 조회한다.

UI 없는 순수 함수 모듈이다. 의존성이 없고, Node 24 내장 타입 스트리핑과 내장 테스트 러너만 쓴다.
엔진은 시스템 시각을 읽지 않는다 — 날짜는 항상 인자로 받는다.

```bash
npm test          # 474개 테스트
npm run gen       # data/progressions.json → docs/MOVEMENTS.md
```

## 쓰는 법

```ts
import {
  loadCatalog, initialState, describePrograms, selectProgram,
  planOn, applySession, reviewRange, acceptProposal,
} from './src/index.ts';

const catalog = loadCatalog('data/progressions.json');
let state = initialState();                       // 전 종목 2단계, 프로그램 미선택

// 프로그램 5종 설명을 보고 하나를 고른다
describePrograms(catalog);
// → [{ id, name, frequency, trainingDays, restDays, progressionIds }, ...]
state = selectProgram(state, catalog, 'good_behavior', '2026-09-02');
// 선택일이 그 루틴의 휴식일이면 다음 운동일이 1일차다

// 그날 뭘 얼마나 — 실제 날짜로 묻는다
const today = planOn(state, catalog, '2026-09-02');
// → { kind: 'plan', weekday, programId, dayNumber, rest, exercises, locked, proposal }
// 프로그램 미선택이면 예외 대신 { kind: 'no-program', date } 를 돌려준다

// 하고 나서 기록
const { state: next, evaluation, record } = applySession(state, catalog, {
  date: '2026-09-02', progressionId: 'pullup', step: 5,
  sets: [10, 10], rpe: 7, kind: 'work',
});
// → evaluation.promote === true, next.steps.pullup === 6, record.promotedTo === 6

// 지나간 날 조회 — 상태를 바꾸지 않는다
reviewRange(next, catalog, '2026-09-01', '2026-09-03');
// → [{ date, programId, dayNumber, status: 'done'|'partial'|'missed'|'rest', planned, performed }, ...]
// 그날 계획은 풀업 + 스쿼트인데 풀업만 기록했으므로 09-02 는 'partial'

// 전환 제안이 떠 있으면 승인한다
if (today.kind === 'plan' && today.proposal) {
  state = acceptProposal(state, catalog, '2026-09-07');   // 그날부터 새 구간
}
```

## 담긴 것

| | |
|---|---|
| `data/progressions.json` | 60단계 전체 — 이름(한/영)·초보자/중급자/상급자 기준·페이지·좌우 구분·동작 요약, 프로그램 5종 |
| `src/` | 해금 판정 · 목표 계산 · 승급 판정 · 주간 배치 · 프로그램 구간 · 전환 제안 · 날짜 조회 |
| `docs/PROGRESSIONS.md` | 기준 수치표와 진급 판정 규칙 |
| `docs/MOVEMENTS.md` | 60단계 동작 요약 (JSON 에서 생성) |
| `docs/LOGIC.md` | 로직 명세와 조정 가능한 상수 |

`src/` 안의 모듈 구분:

| | |
|---|---|
| `catalog.ts` `gate.ts` | 데이터 적재, 선행 조건 판정 |
| `plan.ts` `schedule.ts` | 종목별 목표 계산, 요일별 배치 |
| `evaluate.ts` `history.ts` | 승급 판정, 기록 조회 |
| `date.ts` | 순수 날짜 유틸 (`weekdayOf` `addDays` `diffDays` `dateRange` `isMonday`) |
| `program.ts` | 프로그램 선택·전환, 수행 구간(stint), 일차 계산 |
| `proposal.ts` | 자동 전환 제안 생성·승인·거절 |
| `session.ts` | 도전 포기 → 다지기 전환, 세션 기록 |
| `calendar.ts` | 날짜 기반 진입점 `planOn`, 수행 기록 조회 `reviewDay` / `reviewRange` |

## 규칙 요약

**목표 계산** — 직전 세션 결과로 다음 목표가 정해진다. 중급자 기준 미달이면 유지 1세트 + 목표까지 최대한,
통과했으면 상급자 기준의 세트 수(2 또는 3)에 따라 갈린다. 직전 평균이 목표의 90% 이상이면 기준 자체에 도전한다.

**승급** — 상급자 기준을 채우면 다음 단계로. 판정은 **수행 횟수만** 본다.

**다지기** — 초보자 기준에 도전하다 안 되면 사용자가 '불가능' 을 눌러 그 자리에서 이전 단계 세션으로
전환한다(현재 단계는 유지). 다지기가 3회 쌓일 때마다 수행량을 기준의 10% 씩 올린다 — 30 → 33 → 36 → 39.

**선행 조건** — 브리지·핸드스탠드는 빅4(푸시업·스쿼트·풀업·레그 레이즈)를 전부 6단계 완료해야 열린다.

**RPE**(주관적 강도, 1~10, 선택 입력) — 승급 결정을 대체하지 않고 두 군데에만 쓴다.
최근 3회 평균이 8 이상이면 기준을 채워도 **승급을 보류**하고, 직전 값이 9 이상이면 다음 세션의 유지 세트를 1 낮춘다.
심박수는 쓰지 않는다 — 이 프로그램은 저반복 고강도 구간이 많아 근력 진전과 심박 반응이 무관하다.

**프로그램 구간** — 프로그램을 고른 날부터 그 루틴대로 수행한다. 선택일이 그 루틴의 휴식일이면
**첫 운동일이 1일차**다. 중간에 갈아탈 수 있고, 같은 루틴으로 되돌아와도 이전 구간을 잇지 않고
새 구간으로 일차를 다시 센다. 구간 이력은 무제한 보존한다.

**자동 전환 제안** — 현 루틴에 배치된 모든 종목이 승급했고, 승급 이후 그 종목 세션이 강등 없이
3회 쌓이면 다음 루틴을 제안한다. 판정과 제안 생성은 **월요일에만** 하고, 생성된 제안은
승인·거절 전까지 매일 노출된다. 잠긴 종목(브리지·핸드스탠드)은 판정에서 제외한다.
거절 이력은 남기지만 재제안을 막는 데 쓰지 않는다.
승인일은 월요일이 아니어도 된다 — 월요일 제약은 제안 *생성*에만 붙는다.

**수행 여부** — 미수행일은 저장하지 않는다. 그날의 계획에서 그날의 기록을 뺀 차집합으로 계산해
`done` / `partial` / `missed` / `rest` 넷 중 하나를 낸다.

**좌우 기록** — perSide 16단계(푸시업·스쿼트·풀업·핸드스탠드의 7~10단계)는 **약한 쪽 기준**으로
기록한다. 계획 결과의 `sideNote` 에 "양쪽 다 수행하고 적게 한 쪽을 입력한다" 는 고지가 담긴다
(스쿼트는 다리, 나머지는 팔). 표시용 문구이며 목표 수치 계산에 관여하지 않는다.

**세션 흐름** — 도전 중 '불가능' 을 누르면 그날 바로 이전 단계 다지기로 전환한다.
1단계에서는 내려갈 곳이 없어 단계를 유지한다.

**승급 기록** — 세션 기록에 승급 결과(`promotedTo`)와, 기준은 채웠으나 승급이 막힌 사유
(`blockedBy`: `rpe` 보류 / `master` 최상단)를 남긴다. 두 필드는 엔진만 채운다.

조정 가능한 값은 전부 [`src/rules.ts`](src/rules.ts) 에 모여 있다.

## 알려진 한계

**타입 검사기가 없다.** 의존성 0 원칙 때문에 `tsc` 를 쓰지 않는다. Node 의 타입 스트리핑은
타입 주석을 지울 뿐 검사하지 않으므로, 타입 오류는 실행 전에 잡히지 않는다.
구조를 바꾸는 변경은 테스트로 검증한다 (현재 474개, line 100% / branch 94.95% / funcs 100%).

**`DayReview.plannedExercises` 는 과거 목표가 아니다.** 조회 시점의 현재 단계로 재계산한 값이라,
그날 이후 단계가 오르내렸다면 수치가 다르다. 과거 시점 목표의 정확한 복원은 지원하지 않는다.
수행 여부 판정의 근거는 종목 목록(`planned`)이지 이 수치가 아니다.

## 데이터 출처

수치와 단계명은 한국어판 **『죄수 운동법』**(폴 웨이드 저, 정미화 옮김, 비타북스 2017, ISBN 979-11-5846-142-3)
실물과 대조했다. 각 단계 본문과 장 끝 「진행 단계 차트」를 **이중 대조**했고, 어긋나는 곳은 문서에 남겼다.

`docs/MOVEMENTS.md` 의 동작 설명은 **책 원문이 아니라 직접 작성한 요약**이다.

훈련 내용 자체를 익히려면 책을 사라. 이 레포는 기준 수치와 진행 로직만 다룬다.

## 라이선스

MIT. 단, 위 서지의 저작권은 원저작자와 출판사에 있다.
