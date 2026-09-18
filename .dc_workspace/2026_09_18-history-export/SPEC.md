# bigsix 기록 보기 · 내보내기 — Specification (SPEC3)

**Target Version**: 0.2.0 (추가분 — 미릴리스 상태에 얹는다)
**Work Type**: feature
**Base Branch**: `feature/ui` (`100133c`) — 새 브랜치를 만들지 않는다 (사용자 지시)
**선행 SPEC**: `.dc_workspace/2026_09_04-ui/SPEC.md`, `.dc_workspace/2026_09_05-ui-2/SPEC.md` —
이 문서는 둘을 **대체하지 않고 잇는다.** D-1~D-19, E-1~E-15, NFR, 알려진 한계는 전부 유효하다.

---

## Overview

**Purpose**
앱을 실제로 쓰면서 "이전과 비교해 잘 되고 있는가" 를 판단할 **자료**를 만든다.
사람은 화면에서 보고, AI 는 내보낸 파일을 받아 분석한다. 두 쪽이 같은 사실을 본다.

**Problem**

*(1) 볼 곳이 없다.* 라우트는 오늘(`/`) · 프로그램(`/programs`) · 단계(`/steps`) 셋뿐이다.
도메인에는 `reviewDay` / `reviewRange`(`src/lib/domain/calendar.ts:82,118`)가 있지만
UI 에서 부르는 곳이 없다. 지난 날 무엇을 했는지, 빠진 날이 언제인지 화면으로 알 수 없다.

*(2) 꺼낼 수 없다.* 기록은 기기 브라우저의 `localStorage` (`bigsix.state`)에만 있다
(`src/lib/ui/storage.ts:23`). 내보내기가 없어 AI 에 넘길 수도, 백업할 수도 없다.
브라우저 데이터를 지우거나 기기를 바꾸면 기록이 사라진다.

*(3) 남는 자료가 분석에 모자란다.* 지금 저장되는 `SessionRecord` 로는 세 가지를 알 수 없다.

| 알 수 없는 것 | 원인 | 위치 |
|---|---|---|
| 그 세션의 **목표**가 무엇이었나 | 목표는 매번 파생 계산하고 저장하지 않는다. `DayReview.plannedExercises` 는 **조회 시점의 단계로 재계산한 값**이다 | `src/lib/domain/types.ts:262-268` |
| **세트별** RPE | 세트마다 입력받지만 완료 시 최댓값 하나로 합친다 | `src/lib/ui/session.svelte.ts:121,216-218` |
| 몇 시에 했나 / 같은 날 순서 | `date` (YYYY-MM-DD) 만 있다 | `src/lib/domain/types.ts:72-73` |

"목표 대비 얼마나 했나" 가 분석의 핵심인데, 목표가 남지 않으면 과거 기록은 수행값만 있는 숫자 열이 된다.

**Solution**
기록 탭을 새로 두어 **날짜별 목록**과 **종목별 추이**를 보여주고, **JSON · CSV 내보내기**와
**JSON 가져오기**를 붙인다. 그리고 앞으로의 세션부터 **목표 · 세트별 RPE · 완료 시각**을
기록에 함께 남긴다 (저장 스키마 v3 → v4, 도메인 변경).

---

## 확정 사항 (사용자 결정, 2026-09-18)

| # | 항목 | 결정 |
|---|---|---|
| H-1 | 기록 보기 형태 | **날짜별 목록 + 종목별 추이** 둘 다. 한 탭 안에서 전환 |
| H-2 | 내보내기 형식 | **JSON + CSV.** JSON 은 전체(백업 · AI 분석), CSV 는 스프레드시트용 |
| H-3 | 가져오기 | "작업이 크지 않으면 넣는다." → **넣는다** (근거: 아래 OQ-18) |
| H-4 | 기록 보강 | **세션 당시 목표 · 세트별 RPE · 완료 시각** 셋 다 저장 |
| H-5 | 배포 | 구현 후 `feature/ui` 를 **임시 배포**한다 (`deploy/README.md` 「이번 작업의 임시 배포」). 릴리스·태그는 하지 않는다 |
| H-6 | 화면 디자인 | **cube-study 와 같은 원칙으로 직접 설계**한다. 색·배치·컴포넌트의 방향이 불분명하면 cube-study 를 참고한다 (아래 「화면 설계」) |
| H-7 | 아이콘 | Font Awesome 등 공개 아이콘 세트를 먼저 찾아본다. 마땅한 것이 없으면 **직관성·시인성을 기준으로 직접 그린다** |

---

## Functional Requirements

### FR-23: 기록 탭

- [ ] FR-23.1: 하단 네비에 **「기록」** 탭(`/history`)을 추가한다. 순서는 오늘 · 프로그램 · 단계 · 기록.
      탭 정의는 `src/lib/ui/nav.ts` 의 `TABS` 한 곳에서만 바꾼다.
- [ ] FR-23.2: 기록 탭 안에서 **「날짜별」 / 「종목별」** 두 보기를 전환한다. 기존 `ChipGroup` 을 쓴다.
      마지막으로 고른 보기는 기억하지 않아도 된다 (기본: 날짜별).
- [ ] FR-23.3: 기록이 하나도 없고 프로그램도 미선택이면 "아직 기록이 없습니다" 한 줄과
      내보내기·가져오기 영역만 보인다. 가져오기는 빈 상태에서도 쓸 수 있어야 한다 (EC-60).

### FR-24: 날짜별 목록

- [ ] FR-24.1: 오늘부터 과거로, **날짜 하나당 한 줄**. 범위는 첫 구간 `selectedAt` 과 첫 기록 `date`
      중 이른 날부터 오늘까지. 기록 · 구간이 모두 없으면 목록이 없다.
- [ ] FR-24.2: 각 줄에 표시한다 — 날짜 · 요일 · 루틴명 · 며칠차 · 상태(`수행` / `일부` / `미수행` / `휴식`).
      상태는 `reviewDay().status` 를 그대로 쓴다. **색만으로 알리지 않는다** — 문구가 함께 선다.
- [ ] FR-24.3: 그날의 세션을 종목마다 펼쳐 보여준다 — 종목명 · 수행 단계명 · 세트 값 목록 ·
      (있으면) 목표 · RPE. 세션 성격이 **다지기 / 자유 운동 / 중단**이면 그 사실을 문구로 붙인다.
- [ ] FR-24.4: 그날 **승급**했으면(`promotedTo`) "N단계로 승급" 을 적는다.
      **승급 보류**(`blockedBy`)면 사유를 적는다 (`rpe` → RPE 보류, `master` → 최상단).
- [ ] FR-24.5: **루틴을 갈아탄 날**(구간 `startedAt` · 제안 승인일)에 그 사실을 적는다 (이슈 #1 「표시해야 할 것」).
- [ ] FR-24.6: `미수행` 인 날은 계획됐던 종목명을 적는다 (`DayReview.planned`).
      **목표 수치는 적지 않는다** — `plannedExercises` 는 과거 목표가 아니다 (`types.ts:262-268`).
- [ ] FR-24.7: 한 번에 **최근 30일**을 그리고, "이전 30일 더 보기" 로 늘린다 (NFR-24).

### FR-25: 종목별 추이

- [ ] FR-25.1: 빅6 종목 중 하나를 고른다 (`ChipGroup`). 기본값은 기록이 가장 최근인 종목.
- [ ] FR-25.2: 그 종목의 세션을 **최근 것부터** 한 줄씩 — 날짜 · 수행 단계 · 세트 값 · 세트 합계 ·
      목표(있으면) · 목표 기준 충족 여부(있으면) · RPE · 성격(정규/다지기/자유/중단) · 승급.
- [ ] FR-25.3: 목표 기준 충족 여부는 **저장된 목표로만** 판정한다. 목표가 없는 옛 기록은 "—" 로 둔다.
      재계산으로 채워 넣지 않는다 (EC-57).
- [ ] FR-25.4: 단계가 바뀌는 지점(승급 · 다지기)이 줄 사이에서 구분돼 보여야 한다.
- [ ] FR-25.5: 그래프는 그리지 않는다. 표만 (Out of Scope 참고).

### FR-26: 내보내기

- [ ] FR-26.1: 기록 탭에 **「JSON 내보내기」 · 「CSV 내보내기」** 버튼을 둔다.
- [ ] FR-26.2: **JSON** 은 한 파일에 다음을 담는다.
  - `meta` — 앱 이름 · 버전 · 커밋(About 과 같은 값) · 내보낸 시각 · 저장 스키마 버전
  - `appState` — 저장 봉투의 `appState` **그대로** (가공 없음. 가져오기의 입력이 된다)
  - `catalog` — 분석에 필요한 이름표. 종목 id → 한국어명, (종목, 단계) → 단계명 · 단위 · perSide ·
    초보자/중급자/상급자 기준. AI 가 id 만 보고 해석하지 않아도 되게 한다
  - 진행 중 세션(`bigsix.session.inprogress`)은 **넣지 않는다** — 완결된 기록만 (EC-59)
- [ ] FR-26.3: **CSV** 는 **세트 한 줄**(long format)이다. 열:
      `date, completed_at, program, day_number, progression, step, performed_step, step_name, unit,
      kind, outcome, set_index, value, set_rpe, session_rpe, goal_label, goal_sets, goal_value,
      target, promoted_to, blocked_by`.
      세션 단위 값은 그 세션의 모든 세트 줄에 반복한다. 없는 값은 빈 칸. UTF-8 BOM 을 붙인다
      (엑셀 한글 깨짐 방지).
- [ ] FR-26.4: 파일명은 `bigsix-YYYY-MM-DD.json` / `.csv` (내보낸 날, `todayClock.today`).
- [ ] FR-26.5: 저장 방식 — `Blob` + `<a download>` 로 내려받는다. 설치형 PWA(iOS 독립 실행 등)에서
      내려받기가 막히는 환경이면 **Web Share API(파일 공유)** 로 넘긴다. 둘 다 안 되면 그 사실을
      문구로 알린다 — 눌러도 아무 일이 없는 버튼을 두지 않는다 (NFR-22 준용, EC-61).
- [ ] FR-26.6: 내보내기는 상태를 바꾸지 않는다.

### FR-27: 가져오기 (복원)

- [ ] FR-27.1: 기록 탭에 **「JSON 가져오기」** 를 둔다. 입력은 FR-26.2 형식의 JSON 파일 하나.
- [ ] FR-27.2: 검증은 **기존 저장 계층을 재사용**한다 — 마이그레이션 체인(`storage.ts:144`)과
      형태 검증(`isAppStateShape`, `storage.ts:99`). 새 검증 경로를 따로 만들지 않는다.
      미래 스키마 버전 · 형태 불일치 · JSON 파싱 실패는 거절하고 사유를 적는다.
- [ ] FR-27.3: **덮어쓰기**다. 병합하지 않는다. 쓰기 전에 확인을 받는다 — 현재 기록 수와 가져올
      기록 수 · 날짜 범위를 나란히 보여주고 기존 `Confirm` 을 쓴다.
- [ ] FR-27.4: 진행 중 세션이 있으면 가져오기를 막는다. 먼저 끝내거나 취소하라고 적는다 (EC-62).
- [ ] FR-27.5: 가져오기 직전 상태를 되돌릴 수단은 두지 않는다. 대신 확인 문구에
      "먼저 현재 기록을 내보내 두라" 를 적는다.

### FR-28: 기록 보강 (도메인 변경, 스키마 v4)

- [ ] FR-28.1: `SessionInput` 에 선택 필드 셋을 추가한다.
  - `target?` — 세션 시작 시점의 계획에서 뽑은 **목표 스냅샷**: `goal`(label · sets · value)과
    그날의 세트별 목표(`work: TargetSet[]`). 자유 운동은 계획이 없으므로 없다.
  - `setRpes?` — 세트별 RPE. `sets` 와 길이가 같고, 입력하지 않은 세트는 `null`.
  - `completedAt?` — 완료(또는 중단) 시각, ISO 8601 로컬 오프셋 포함 문자열.
- [ ] FR-28.2: 기존 `rpe` 필드는 **그대로 둔다** (세트 RPE 최댓값, `maxSetRpe`). 판정(RPE 거부권 ·
      유지 세트 감산)은 계속 `rpe` 만 본다. **새 필드 셋은 어떤 판정에도 들어가지 않는다.**
- [ ] FR-28.3: `target` 은 세션 시작(`begin`) 때 `InProgressSession` 에 함께 저장해 두었다가 완료 시
      넘긴다. 완료 시점에 다시 계산하지 않는다 — 앱을 껐다 켜도 시작 당시 목표가 남아야 한다.
- [ ] FR-28.4: `completedAt` 은 UI 가 채운다. 도메인은 시각을 읽지 않는다 (README 원칙 유지).
      UI 에서의 시각 근원은 기존 규약(`todayClock` / `timer` 의 `Clock`)에 맞춘다 — 컴포넌트에서
      `new Date()` 를 직접 부르지 않는다.
- [ ] FR-28.5: `abandonChallenge` · `recordConsolidation` 도 새 필드를 받아 기록에 남긴다.
- [ ] FR-28.6: `CURRENT_SCHEMA_VERSION` 을 3 → 4 로 올린다. v3 → v4 마이그레이션은 **no-op** —
      옛 기록은 새 필드가 없는 채로 읽힌다. **과거 기록을 재계산으로 채우지 않는다** (EC-57).
      진행 중 세션 봉투도 v4 로 올리고, `target` 이 없는 옛 진행 중 세션은 없는 채로 완료된다.

### FR-29: 구조 정리 — 틀어진 규칙 바로잡기 (기능 작업의 선행)

2026-09-18 구조 점검에서 SvelteKit 표준 위반(Svelte 4 문법 · 서버 파일 · 도메인의 UI 역참조 ·
컴포넌트 hex)은 0건이었으나, **규칙이 틀어진 곳이 셋** 나왔다. 기록 기능이 그 위에 쌓이기 전에 바로잡는다.
**동작은 바꾸지 않는다** — 이 FR 의 커밋은 전부 이동 · import 경로 변경뿐이고, 테스트 수와 결과가 그대로여야 한다.

| # | 틀어진 곳 | 증거 | 바로잡은 상태 |
|---|---|---|---|
| R-1 | UI 가 도메인 공개 API(`domain/index.ts`)를 우회해 **내부 파일을 직접 import** | `routes/+page.svelte:15` (`schedule`), `ui/session/labels.ts:8-9` (`catalog` · `date`), `ui/todayScreen.ts:16` (`date`), `ui/session/ProposalBanner.svelte:7` (`schedule`), `ui/session/FreeExerciseForm.svelte:20` (`catalog`) — 6곳 | UI · 라우트는 `$lib/domain` 만 부른다 (타입은 `$lib/domain/types` 허용). 필요한 함수는 index 에 export 를 더한다 |
| R-2 | import 표기가 **두 가지로 갈림** | 라우트·컴포넌트 일부는 `$lib/...`(확장자 없음, `src/` 전체 35곳), `src/lib/ui` 는 `../domain/index.ts` 식 상대 경로 + `.ts` 확장자 (`ui/` 아래 13개 파일). `.ts` 확장자는 Node 단독 실행 시절(0.1.0)의 흔적 | **층을 넘는 import 는 `$lib/...` 별칭, 확장자 없음.** 같은 층 안(예: `domain/*` 끼리, `ui/session/*` 끼리)은 상대 경로 허용, 역시 확장자 없음. 대상은 `src/` 전체. `tests/` 는 러너 경로라 이번 범위 밖 |
| R-3 | `src/lib/ui` 가 **평평함** — 컴포넌트(`.svelte`) · 룬 스토어(`.svelte.ts`) · 순수 함수(`.ts`) · 저장 계층이 한 폴더에 섞이고 하위 폴더는 `session/` 하나 | `src/lib/ui/` 직속 파일 18개 | **역할별 하위 폴더로 나눈다.** 기능 단위(`session/`, `history/`)와 공용 단위(예: 앱 껍데기 — 상단 바·테마·화면 유지·설치·서비스워커·About·토스트 / 저장·상태 — storage · state · boot · today · reset / 공용 컴포넌트 — ChipGroup · Confirm)로. 정확한 폴더명과 배정은 설계(GLOBAL)에서 정한다 |

- [ ] FR-29.1: R-1 — 6곳을 index 경유로 바꾼다.
- [ ] FR-29.2: R-2 — `src/` 의 import 표기를 위 규칙으로 통일한다.
- [ ] FR-29.3: R-3 — `src/lib/ui` 를 역할별 하위 폴더로 옮긴다. **이동 커밋은 내용 무변경**(git 이 rename 으로
      인식하게), 경로 갱신은 다음 커밋 — 선례 `184fcff` 와 같은 방식.
- [ ] FR-29.4: **재발 방지 검사.** 위 세 규칙을 단위 테스트로 못박는다 — `src/` 를 읽어
      (a) UI · 라우트에서 `domain/` 내부 파일 import 0건, (b) `src/` 에서 `.ts` 확장자 import 0건,
      (c) 층을 넘는 상대 경로(`../domain`, `../../domain` 등) 0건, (d) `src/lib/ui` 직속에 규칙 밖 파일 0건.
      cube-study 의 `tests/unit/routes.test.ts` 처럼 규약을 테스트로 두는 방식.
- [ ] FR-29.5: `CLAUDE.md` 「코드」 절에 R-1~R-3 규칙을, 「규약을 어긴 실제 사례」에 이번 건을 적는다.

---

## Non-Functional Requirements

- [ ] NFR-23: 1·2차 NFR 전부 유효. 특히 **NFR-2 표시 원칙**(사실만. 백분율·격려·게이미피케이션 금지),
      **NFR-3 도메인 순수성**, **NFR-4 단방향 의존**, `CLAUDE.md` 의 화면·코드 규약(토큰 색, `data-*` 훅,
      룬만, 44px 터치 타깃, 서버 기능 없음).
- [ ] NFR-24: 1년치(세션 약 1,500건 · 날짜 365일) 저장 데이터에서 기록 탭 첫 표시가 체감 지연 없이
      뜬다. 날짜별 목록은 30일 단위로만 `reviewDay` 를 부른다.
- [ ] NFR-25: `pnpm check` 오류·경고 0, `pnpm test` 전부 통과를 각 커밋에서 유지. 기준선 **657개**.
- [ ] NFR-26: CSV 생성 · JSON 조립 · 가져오기 검증은 **룬 없는 순수 함수**로 둔다
      (`src/lib/ui/` 아래, `nav.ts` · `todayScreen.ts` 와 같은 방식). 브라우저 API(Blob · share · 파일 입력)는
      얇은 층으로 분리해 happy-dom 으로 테스트한다.
- [ ] NFR-27: 내보낸 JSON 을 그대로 가져오면 **원래 `appState` 와 깊은 동등**이어야 한다 (왕복 테스트).
- [ ] NFR-28 (보안): 파일은 기기 밖으로 자동 전송되지 않는다. 서버 업로드 없음. 가져오기 입력은
      형태 검증을 통과한 것만 저장한다. 문자열은 Svelte 텍스트 바인딩으로만 그린다 (`{@html}` 금지).

---

## Constraints

- 기존 패턴을 따른다. SvelteKit 2 + Svelte 5 룬 + adapter-static, 의존성 추가 없음
  (CSV · JSON 생성은 직접 작성).
- `src/lib/domain/**` 은 FR-28 범위에서만 바꾼다. 기록 보기는 도메인이 이미 노출한 함수
  (`reviewDay` · `reviewRange` · `describeProgram` · 카탈로그)만 부른다.
- 하단 네비가 3 → 4탭이 된다. `nav.ts` 주석의 "3개 고정" 서술과 `CLAUDE.md` 의 "하단 3탭" 서술을 함께 고친다.

### 코드 배치 (2026-09-18 구조 점검 결과)

현재 구조는 SvelteKit 표준을 지킨다 — Svelte 4 문법 · 서버 파일 · 도메인의 UI 역참조 0건,
컴포넌트 hex 는 `theme-color` 한 줄. 다만 새 기능이 흐트러진 자리를 넓히지 않도록 아래를 지킨다.

- 새 파일은 `src/lib/ui/history/` 아래에 모은다. `session/` 과 같은 방식 — 순수 함수(`.ts`, 룬 없음)와
  컴포넌트(`.svelte`)를 한 폴더에, 역할별 파일로.
- 라우트는 `src/routes/history/+page.svelte` 하나. 화면에 계산 로직을 두지 않는다 — 순수 함수를 부르고 그린다.
- 도메인은 **`$lib/domain`(index)으로만** 부른다. 필요한 함수가 index 에 없으면 index 에 export 를 더한다.
- 기존 코드의 틀어진 곳은 **FR-29 로 전부 바로잡는다** (부분 적용 아님). 기능 작업보다 먼저 한다.
- `+layout.svelte` 에는 탭 추가 외에 아무것도 더하지 않는다.

---

## 화면 설계 (cube-study 준용, H-6 / H-7)

정본: `~/Documents/cube-study/.dc_workspace/CONVENTIONS.md` (화면 규약), 참조 구현은 같은 저장소의
`src/lib/ui/Records.svelte`(기록 표) · `SegToggle.svelte`(2~4지선다) · `src/routes/+layout.svelte`(아이콘).
bigsix 의 `CLAUDE.md` 「화면을 만들거나 고칠 때」가 이미 그 규약을 옮겨 두었고, 아래는 이번 화면에 걸리는 것만 짚는다.

- [ ] UI-1 세로 순서 고정 (CONVENTIONS 1.1): `<h1>기록</h1>` → 보기 전환(설정) → 본문(목록 또는 표)
      → 더 보기 → 내보내기·가져오기. 보기를 바꿔도 영역의 자리는 그대로다.
- [ ] UI-2 `<h1>` 은 화면 이름 하나 (1.2). 날짜·종목명은 `<h1>` 에 넣지 않는다.
- [ ] UI-3 보기 전환(날짜별/종목별)은 2지선다라 **cube-study `SegToggle` 방식**을 가져온다 — 선택지를 나란히 두고
      활성 쪽을 강조, 항상 보이는 한 줄 설명. 종목 선택은 6개라 SegToggle 범위(2~4)를 넘으므로 기존 `ChipGroup`.
- [ ] UI-4 기록은 **`<table>` 로 적는다** (`Records.svelte` 원칙) — 머리글로 열 이름을 한 번만, 숫자 칸은
      `tabular-nums` + 오른쪽 정렬로 자릿수를 맞춘다. 최고 기록 강조 · 배지 · 추세선 없음.
- [ ] UI-5 상태(수행/일부/미수행/휴식) · 목표 충족은 **색과 글자를 함께** (4.3). 색은 `data-result` 같은
      단일 속성 하나만 보고 칠한다 (4.1). 색은 `app.css` 토큰만.
- [ ] UI-6 접기는 CSS, `{#if}` 로 영역을 넣었다 빼지 않는다 (5.1). 기록 목록은 `localStorage` 에서 오므로
      프리렌더 시점과 부팅 후가 다르다 — **목록 영역의 자리를 예약**한다 (3.1 의 예약 기준).
- [ ] UI-7 `data-*` 훅: `data-history-view`, `data-history-day`, `data-history-session`, `data-export-json`,
      `data-export-csv`, `data-import` 등 `data-{역할}` 규약으로 늘리고 `CLAUDE.md` 의 훅 목록에 더한다.
- [ ] UI-8 터치 타깃 44px, 하단 네비 52px (4.4). 4탭이 되어도 360px 폭에서 라벨이 잘리지 않는지 확인한다.
- [ ] UI-9 확인 창(가져오기)은 `<dialog>` + `showModal()` — `About` · 기존 `Confirm` 과 같은 방식.
- [ ] UI-10 **아이콘** (H-7): 내보내기 · 가져오기(· 필요하면 기록 탭)에 쓴다.
  1. Font Awesome Free 에서 먼저 찾는다 (예: `download`, `upload`, `file-export`, `file-import`, `share`).
     패키지를 추가하지 않고 **인라인 SVG** 로 옮기며, 출처와 라이선스(Font Awesome Free 아이콘은 CC BY 4.0 —
     표기 의무)를 파일 주석과 About 에 남긴다. Font Awesome 의 형태가 기존 상단 바 아이콘(24×24 선형,
     `stroke="currentColor"`)과 어긋나면 같은 계열의 MIT/ISC 세트(Lucide · Tabler)를 본다.
  2. 마땅한 것이 없으면 **직접 그린다.** 기준은 직관성(무엇을 하는지 모양만으로 짐작되는가)과
     시인성(16px 에서 선이 뭉개지지 않는가, 라이트·다크 둘 다).
  3. 어느 경우든 **아이콘만 있는 버튼은 만들지 않는다** — 글자 라벨이 함께 선다 (`CLAUDE.md`).

---

## Analysis Results

### Related Code

| 무엇 | 위치 | 쓰임 |
|---|---|---|
| 날짜별 수행 판정 | `src/lib/domain/calendar.ts:82` `reviewDay`, `:118` `reviewRange` | FR-24 의 근거. 그대로 쓴다 |
| 하단 탭 | `src/lib/ui/nav.ts` `TABS`, `src/routes/+layout.svelte:209-213` | FR-23.1 |
| 저장 봉투 · 마이그레이션 | `src/lib/ui/storage.ts:33,127-160` | FR-27.2 재사용, FR-28.6 |
| 세트 RPE 병합 | `src/lib/ui/session.svelte.ts:216` `maxSetRpe` | FR-28.2 — 유지 |
| 세션 완료 · 중단 | `src/lib/ui/session.svelte.ts:114` `finalize`, `abandon` | FR-28.3~28.5 수정 지점 |
| 세션 시작 | `src/lib/ui/session.svelte.ts:59` `begin(startedAt, plan)` | FR-28.3 — `plan.goal` · `plan.work` 스냅샷 |
| 기록 생성 | `src/lib/domain/evaluate.ts` `applySession` (`record = { ...input }`) | 새 필드가 스프레드로 그대로 실린다 |
| 선택 버튼 그룹 · 확인 | `src/lib/ui/ChipGroup.svelte`, `Confirm.svelte` | FR-23.2, FR-25.1, FR-27.3 |
| 앱 버전 · 커밋 | `About.svelte`, `vite.config.ts:21` `__COMMIT_HASH__` | FR-26.2 `meta` |
| 달력 뷰 요구 | GitHub 이슈 #1 (OPEN) | FR-24 가 그 「표시해야 할 것」을 목록 형태로 충족. 달력 격자는 범위 밖 |

### Conflicts Identified

| # | 충돌 | 해소 |
|---|---|---|
| C-1 | SPEC2 Out of Scope 가 "수행 기록 목록 화면 (이슈 #1)" 을 뺐다 | 이번 SPEC 이 목록을 **범위에 넣는다.** 달력 격자는 여전히 제외 |
| C-2 | `CLAUDE.md` / `nav.ts` 가 "하단 3탭 고정" 을 전제로 서술 | 4탭으로 고치고 문서도 갱신 (Constraints) |
| C-3 | `SessionInput.rpe` (단일)와 새 `setRpes` 의 중복 | `rpe` 는 판정용 파생값으로 남긴다. 둘이 어긋나지 않게 `rpe = max(setRpes)` 를 테스트로 묶는다 |
| C-4 | 도메인 원칙 "시스템 시각을 읽지 않는다" vs `completedAt` | 도메인은 받기만 한다. 값은 UI 가 넣는다 (FR-28.4) |
| C-5 | 가져오기가 저장 계층의 "손상 시 원본을 지우지 않는다" 원칙(`storage.ts` 머리 주석)과 부딪힘 | 가져오기는 **사용자의 명시적 확인 뒤 덮어쓰기**다. 검증 실패 시 아무것도 쓰지 않는다 |

### Edge Cases

| # | 상황 | 요구되는 동작 |
|---|---|---|
| EC-56 | 기록 0건 · 구간 0개 | 목록 없음 + 안내 한 줄. 내보내기는 빈 `appState` 로 동작 (FR-23.3) |
| EC-57 | v4 이전에 저장된 옛 기록 | 목표 · 세트 RPE · 시각이 "—". 재계산해 채우지 않는다 (FR-25.3 / FR-28.6) |
| EC-58 | 같은 날 같은 종목 세션 2개 이상 | 둘 다 표시. 순서는 `history` 순서(=저장 순서) |
| EC-59 | 진행 중 세션이 있는 상태에서 내보내기 | 완결된 기록만 나간다 (FR-26.2) |
| EC-60 | 새 기기 · 빈 상태에서 가져오기 | 가능해야 한다 — 기기 이전의 주 경로 |
| EC-61 | 내려받기와 공유가 모두 안 되는 환경 | 그 사실을 문구로 알린다 (FR-26.5) |
| EC-62 | 진행 중 세션이 있는 상태에서 가져오기 | 막는다 (FR-27.4) |
| EC-63 | 미래 스키마 버전(v5 등) 파일 가져오기 | 거절 + "앱이 이 파일보다 오래됐다" (FR-27.2) |
| EC-64 | JSON 이 아니거나 `appState` 형태가 아닌 파일 | 거절. 현재 기록은 그대로 (C-5) |
| EC-65 | 이전 버전(v1~v3)에서 내보낸 파일 | 마이그레이션 체인을 타고 읽힌다 |
| EC-66 | 프로그램 미선택 기간의 자유 운동 기록 | 날짜별 목록에 그날이 나온다 — 구간이 없어도 기록 날짜는 범위에 든다 (FR-24.1) |
| EC-67 | 세트 일부에만 RPE 입력 | `setRpes` 는 입력 안 한 자리가 `null`, `rpe` 는 입력된 값의 최댓값 |
| EC-68 | 세션 도중 앱을 껐다 켬 · 자정 넘김 | `target` 은 시작 당시 값. `date` 는 기존대로 `startedAt`, `completedAt` 은 실제 완료 시각 |
| EC-69 | CSV 값에 쉼표 · 따옴표 (단계명 등) | RFC 4180 규칙으로 인용 |
| EC-70 | 세트 0개로 중단된 세션 | CSV 에 세트 없는 세션 한 줄(`set_index` 빈 칸)을 남긴다 — 중단 사실이 사라지면 안 된다 |

---

## Out of Scope

- 달력 격자(주간 · 월간) 뷰 — 이슈 #1 의 나머지. 이번엔 목록
- 그래프 · 차트 — 표만. 분석은 내보낸 파일로
- 병합 가져오기 — 덮어쓰기만
- 가져오기 직전 상태로의 되돌리기
- 클라우드 동기화 · 서버 업로드 · 자동 백업
- **수동 단계 조정 이력** — `/steps` 에서 단계를 바꾼 사실은 `history` 에 남지 않는다
  (`types.ts:155-163`, FR-13.4). 추이에서 설명 안 되는 단계 변화로 보일 수 있다. 이번엔 다루지 않고
  알려진 한계로 적는다
- 과거 기록의 목표 복원(재계산 백필)
- 0.2.0 릴리스(태그 · 버전 올림 · CHANGELOG 확정)

---

## Open Questions

| # | 질문 | 제안 | 상태 |
|---|---|---|---|
| OQ-18 | 가져오기를 넣을 만큼 작업이 작은가 | **작다.** 검증·마이그레이션은 `storage.ts` 에 이미 있고, 새로 쓰는 것은 파일 입력 · 확인 화면 · 덮어쓰기 한 번이다. 내보내기만 있으면 백업이 "꺼내기만 되는 백업" 이라 기기 이전에 쓸모가 없다 | H-3 으로 반영. 이견 있으면 빼도 FR 번호만 비는 구조 |
| OQ-19 | CSV 를 세트 한 줄(long)로 할지 세션 한 줄(wide)로 할지 | **세트 한 줄.** 세트 수가 1~3으로 가변이라 wide 는 빈 열이 생기고, 피벗·AI 분석은 long 이 쉽다 | 제안대로 진행 예정 |

---

## References

- `.dc_workspace/2026_09_04-ui/SPEC.md` · `GLOBAL.md` — 1차
- `.dc_workspace/2026_09_05-ui-2/SPEC.md` · `GLOBAL.md` — 2차 (ADR-19 까지)
- `deploy/README.md` — 임시 배포 절차. Tailscale tailnet 경유라 집 밖에서도 같은 명령
- GitHub 이슈 #1 — 주간·월간 캘린더 뷰
