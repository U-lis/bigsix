# Phase 2.5 — 동작 설명 노출 (FR-30)

**앞 페이즈**: Phase 2 (하단 4탭 · `/history` stub)
**뒤 페이즈**: Phase 3 (스키마 v4)
**번호**: 기록 기능(3~8)과 독립이고 분량이 작아 뒤 번호를 밀지 않고 `2.5` 로 끼운다
(선례 `.dc_workspace/2026_09_03-program-session/PHASE_3.5_PLAN.md`).

## SPEC 참조

FR-30.1~30.6 · UI-11 · EC-71~73 · H-8. FR-30.7(사진 자료 보강)은 이 페이즈에 포함하지 않는다 —
자료가 도착한 뒤 `progressions.json` 만 고치는 별도 작업이다.

## 전제 — 데이터는 이미 있다

- `src/lib/data/progressions.json` 의 60단계 전부에 `summary: string[]` (2~3줄, 평균 87자, 최소 64 / 최대 123).
- 도메인 타입에도 이미 있다 — `Step.summary`, `Step.page`, `Step.perSide`, `Step.pairWith`
  (`src/lib/domain/types.ts:20-38`). `getStep(catalog, id, n)` 로 꺼낸다 (`domain/catalog.ts:17`).
- 따라서 **도메인·데이터 변경이 없다.** 화면에서 부르기만 하면 된다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/lib/domain/index.ts` | `getStep` · `getProgression` 이 index 에 없으면 export 추가 (Phase 1 의 ADR-21 규칙) |
| `src/lib/ui/session/howto.ts` (신규) | 순수 함수. `howtoFor(catalog, progressionId, performedStep): Howto[]` — `{ step, nameKo, nameEn, unit, perSide, page, lines }` 를 낸다. `pairWith` 가 있으면 동반 단계까지 배열로 (FR-30.4). `summary` 가 비었으면 그 항목을 빼서 빈 상자가 생기지 않게 한다 (EC-71) |
| `src/lib/ui/session/Howto.svelte` (신규) | 표시 전용. `<details>` + `<summary>` 로 접기(CSS, DOM 에서 빼지 않는다). `data-howto` · `data-howto-toggle` 훅. 마지막 줄에 출처 한 줄 (FR-30.6) |
| `src/lib/ui/session/ExerciseCard.svelte` | 목표 아래에 `Howto` 배치 (UI-11). 넘기는 단계는 `performedStep` (FR-30.2) |
| `src/lib/ui/session/FreeExerciseForm.svelte` | 사용자가 고른 단계의 설명을 같은 컴포넌트로 노출 |
| `CLAUDE.md` | `data-*` 훅 목록에 `data-howto` · `data-howto-toggle` 추가 |
| `tests/unit/howto.test.ts` (신규) | 아래 TEST 문서 |

경로는 Phase 1 재배치 이후 기준이다 (`src/lib/ui/session/`).

## 커밋 경계

1. `feat(ui): 동작 설명 순수 함수 (FR-30)` — `howto.ts` + 테스트. (index export 가 필요하면 여기서)
2. `feat(ui): 운동 카드에 동작 설명 (FR-30)` — `Howto.svelte` + `ExerciseCard` · `FreeExerciseForm` 배선 + `CLAUDE.md` 훅 목록.

## 화면 (cube-study CONVENTIONS 준용)

- 자리: 운동 카드 안, **목표 아래**. 목표가 시선의 첫 지점이라는 FR-21 위계를 지킨다.
- 접힌 상태가 기본. 펼침은 `<details>` 의 기본 동작에 맡긴다 — 포커스·키보드 조작을 브라우저가 처리한다.
- 제목 줄에 단계명(한글, 영문 병기)과 쪽수. 본문은 `summary` 줄을 `<li>` 로.
- `perSide` 단계는 기존 `sideNote` 문구를 그대로 쓴다 — 새 문구를 만들지 않는다 (중복 방지).
- 아이콘 없음. 글자만으로 충분한 자리다.
- 색은 `app.css` 토큰만. 강조·격려 문구 금지 (NFR-2).

## 완료 기준

- 오늘 화면의 운동 카드에서 설명을 펼쳐 읽을 수 있다.
- 다지기 세션 카드는 이전 단계 설명을 보여준다.
- 핸드스탠드 2단계 카드는 1단계 설명까지 함께 보여준다.
- `pnpm check` 오류/경고 0, `pnpm test` 전부 통과.
- 도메인·데이터 파일에 변경이 없다 (`git diff --stat` 에 `src/lib/domain/`(index export 제외) · `src/lib/data/` 없음).

## 임시 배포

이 페이즈에 포함하지 않는다. 다만 사용자가 "운동하면서 쓰겠다" 고 하면 이 페이즈까지만 올린
임시 배포가 의미 있다 — 판단은 사용자가 한다.
