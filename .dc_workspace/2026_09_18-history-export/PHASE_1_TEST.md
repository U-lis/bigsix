# Phase 1 — TEST 체크리스트

## FR-29.1 (R-1) — 도메인 내부 직접 참조 정리

- [ ] `grep -n "\\.\\./\\.\\./domain\\|\\.\\./domain\\|\\$lib/domain/(?!index|types)" src/routes src/lib/ui` 결과 없음.
- [ ] `src/routes/+page.svelte` — `getProgram` 을 `$lib/domain` 에서 import.
- [ ] `src/lib/ui/session/labels.ts` — `getProgression`, `weekdayOf` 를 `$lib/domain` 에서 import.
- [ ] `src/lib/ui/today/todayScreen.ts` — `addDays` 를 `$lib/domain` 에서 import.
- [ ] `src/lib/ui/session/ProposalBanner.svelte` — `getProgram` 을 `$lib/domain` 에서 import.
- [ ] `src/lib/ui/session/FreeExerciseForm.svelte` — 도메인 참조 전부 `$lib/domain` · `$lib/domain/types`.

## FR-29.2 (R-2) — Import 표기 통일

- [ ] `grep -rnE "from ['\"][^'\"]*\.ts['\"]" src/ --exclude-dir=domain` 결과 없음. 컴포넌트 `.svelte` 확장자는 유지되어 있다.
- [ ] `src/lib/ui/state/boot.ts` — `./storage`, `./state.svelte` (같은 층), `$lib/domain`, `$lib/data/catalog` (층 넘음).
- [ ] `src/lib/ui/session/session.svelte.ts` — `$lib/ui/state/storage`, `$lib/domain`, `$lib/domain/types`.
- [ ] `src/lib/domain/*.ts` — **변경 없음.** 상대 경로 + `.ts` 유지, `$lib` 0건. `tz-probe` · `runUnderTZ` 테스트 통과로 plain Node 실행 확인.

## FR-29.3 (R-3) — 폴더 재배치

- [ ] `ls src/lib/ui/` — 디렉터리 5개 (`shell/ state/ common/ today/ session/`), 파일 0개.
- [ ] `ls src/lib/ui/shell/` — About.svelte, Toast.svelte, theme.svelte.ts, wakelock.svelte.ts, install.svelte.ts, sw.svelte.ts, nav.ts (7개).
- [ ] `ls src/lib/ui/state/` — storage.ts, state.svelte.ts, boot.ts, today.svelte.ts, reset.ts (5개).
- [ ] `ls src/lib/ui/common/` — ChipGroup.svelte, Confirm.svelte (2개).
- [ ] `ls src/lib/ui/session/` — session.svelte.ts, timer.svelte.ts, notify.ts, ExerciseCard.svelte, FreeExerciseForm.svelte, ProposalBanner.svelte, RepsInput.svelte, RpeInput.svelte, TimerInput.svelte, labels.ts (10개).
- [ ] `ls src/lib/ui/today/` — todayScreen.ts (1개).
- [ ] 커밋 b (`git show -M --stat`) 에서 이동한 18개가 전부 rename 으로 잡힌다 (import 줄만 바뀜).
- [ ] 커밋 c 의 diff 는 import 교체·확장자 제거·별칭 통일뿐, 로직 변경 없음.

## FR-29.4 — 재발 방지 검사 (`tests/unit/structure.test.ts`)

- [ ] `LAYER_ROOTS` 상수가 정의됨: `['src/lib/domain', 'src/lib/data', 'src/lib/ui/shell', 'src/lib/ui/state', 'src/lib/ui/common', 'src/lib/ui/today', 'src/lib/ui/session', 'src/lib/ui/history', 'src/routes']`.
- [ ] "src/ 에 .ts 확장자 import 0건 (domain 제외)" 검사 + "domain 은 상대 import 전부 .ts, $lib 0건" 검사.
- [ ] "UI · 라우트에서 $lib/domain 은 index 또는 types 이외 참조 0건" 검사.
- [ ] "층 넘는 상대 경로 0건" 검사.
- [ ] "src/lib/ui 직속 파일 0건" 검사.
- [ ] 이 테스트 파일 자체가 규칙을 어기지 않는다 (자기 참조 통과).

## FR-29.5 — CLAUDE.md 갱신

- [ ] `grep -n "\\$lib/domain\\|층을 넘\\|역할별 하위 폴더" CLAUDE.md` — 규칙 세 문장 존재.
- [ ] 「규약을 어긴 실제 사례」 절에 FR-29 항목 등재.

## NFR-25 유지

- [ ] 커밋 a: `pnpm check` 0/0, `pnpm test` 657 passed.
- [ ] 커밋 b: `pnpm check` 0/0, `pnpm test` 657 통과 (예외 없음).
- [ ] 커밋 c: `pnpm check` 0/0, `pnpm test` 657 passed.
- [ ] 커밋 d: `pnpm check` 0/0, `pnpm test` 657 + N passed (N = 신규 structure 검사).
- [ ] 커밋 e: `pnpm check` 0/0, `pnpm test` 657 + N passed.

## 동작 무변경 (수동 확인)

- [ ] 앱을 열어 오늘 · 프로그램 · 단계 화면이 이전과 동일하게 표시.
- [ ] 세션을 시작 → 세트 입력 → 완료 흐름이 이전과 동일.
- [ ] 3탭이 아직 유지됨 (기록 탭은 Phase 2 에서 추가).
