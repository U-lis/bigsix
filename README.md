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

**목표 계산** — 지금 통과 중인 기준을 그대로 노린다. 초보자 구간이면 초보자 기준,
중급자 구간이면 중급자 기준이 그날의 목표다.

**승급** — **단계별 목표를 순차로 3회 연속 통과**해야 다음 단계로 간다.
초보자 3연속 → 중급자 3연속 → 상급자 3연속. 한 세션에 상급자 기준을 크게 넘겨도
그 기준의 연속 1회일 뿐이다. 판정은 **수행 횟수만** 본다.
끝까지 하고 미달하면 연속이 0 이 되지만 아래 기준으로 내려가지는 않는다.
중단('불가능')과 다지기는 연속을 깨지 않는다.

**다지기** — 초보자 기준에 도전하다 안 되면 사용자가 '불가능' 을 눌러 그 자리에서 이전 단계 세션으로
전환한다(현재 단계는 유지). 다지기가 3회 쌓일 때마다 수행량을 기준의 10% 씩 올린다 — 30 → 33 → 36 → 39.

**선행 조건** — 브리지·핸드스탠드는 빅4(푸시업·스쿼트·풀업·레그 레이즈)를 전부 6단계 완료해야 열린다.

**RPE**(주관적 강도, 1~10, 선택 입력) — 승급 결정을 대체하지 않고 두 군데에만 쓴다.
3연속을 완성한 시점에 최근 3회 평균이 8 이상이면 **승급을 보류**한다. 그것 하나뿐이다.
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

## 도메인 사용 예

`src/lib/domain` (SvelteKit 앱)을 쓰는 대표 패턴은 위 「쓰는 법」 예제 코드와 동일하다.
UI 는 `$lib/domain` (값 export 전체) 또는 `$lib/domain/types` (타입 전용)로만 도메인을 참조한다.

## 기록 보기 · 내보내기 · 가져오기

### 기록 탭

하단 네비 「기록」 탭(`/history`)에서 지난 수행 이력을 조회한다. 두 가지 보기를 제공한다.

- **날짜별**: 오늘부터 과거로, 날짜 한 줄에 루틴명·며칠차·상태(수행/일부/미수행/휴식)를 보여준다.
  각 날짜를 펼치면 종목별 세트 값, 목표(있으면), RPE 를 확인할 수 있다.
  기본 범위는 최근 30일이며 「이전 30일 더 보기」 버튼으로 넓힌다.
- **종목별**: 빅6 6종 중 하나를 선택하면 그 종목의 세션을 최근 것부터 한 줄씩 보여준다.
  날짜·수행 단계·세트 값·목표 대비 충족 여부·RPE·성격(정규/다지기/자유/중단)·승급 결과가 담긴다.
  목표 충족 여부는 세션 당시 저장된 목표로만 판정한다. 목표가 없는 이전 기록은 "—" 로 표시된다.

### JSON 내보내기

「JSON 내보내기」 버튼을 누르면 `bigsix-YYYY-MM-DD.json` 파일이 내려받아진다. 최상위 구조:

```json
{
  "meta": { "app", "version", "commit", "exportedAt", "schemaVersion" },
  "appState": { /* 저장 봉투의 AppState 그대로 */ },
  "catalog": { /* 종목 id → 한국어명 · 단계명 · 기준, AI 분석용 이름표 */ }
}
```

진행 중 세션은 포함되지 않는다 — 완결된 기록만 나간다.
이 파일을 AI 에 넘기면 카탈로그 없이도 종목·단계를 해석할 수 있다.

### CSV 내보내기

「CSV 내보내기」 버튼을 누르면 `bigsix-YYYY-MM-DD.csv` 파일이 내려받아진다.
세트 한 줄(long format), UTF-8 BOM 포함(엑셀 한글 깨짐 방지).

22열 순서:
`date, completed_at, program, day_number, progression, step, performed_step, step_name, unit,
kind, outcome, set_index, value, set_rpe, session_rpe, goal_label, goal_sets, goal_value,
target, target_mode, promoted_to, blocked_by`

`target` 은 그 세트의 목표 숫자, `target_mode` 는 `fixed`(이만큼만) / `max`(이 값을 하한으로 최대한).
없는 값은 빈 칸. 스프레드시트에서 바로 피벗·필터링할 수 있다.

### JSON 가져오기

「JSON 가져오기」 버튼으로 이전에 내보낸 JSON 파일을 불러와 현재 기록을 대체한다.

- **덮어쓰기**다. 병합하지 않는다. 실행 전 확인 창에서 현재 기록 수·가져올 기록 수·날짜 범위를 보여준다.
- 확인 창에 "먼저 현재 기록을 내보내 두라" 는 안내가 함께 표시된다. 되돌리기 수단은 없다.
- **진행 중 세션이 있으면 막힌다.** 먼저 세션을 끝내거나 취소한 뒤 가져오기를 시도한다.
- 미래 스키마 버전·형태 불일치·JSON 파싱 실패는 거절하고 사유를 표시한다. 현재 기록은 그대로 유지된다.

## 라이선스

MIT. 단, 위 서지의 저작권은 원저작자와 출판사에 있다.
