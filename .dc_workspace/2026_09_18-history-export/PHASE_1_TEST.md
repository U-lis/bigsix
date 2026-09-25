# Phase 1 — TEST 체크리스트

## FR-29.1 (R-1) — 도메인 내부 직접 참조 정리

- [x] `grep -n "\\.\\./\\.\\./domain\\|\\.\\./domain\\|\\$lib/domain/(?!index|types)" src/routes src/lib/ui` 결과 없음.
- [x] `src/routes/+page.svelte` — `getProgram` 을 `$lib/domain` 에서 import.
- [x] `src/lib/ui/session/labels.ts` — `getProgression`, `weekdayOf` 를 `$lib/domain` 에서 import.
- [x] `src/lib/ui/today/todayScreen.ts` — `addDays` 를 `$lib/domain` 에서 import.
- [x] `src/lib/ui/session/ProposalBanner.svelte` — `getProgram` 을 `$lib/domain` 에서 import.
- [x] `src/lib/ui/session/FreeExerciseForm.svelte` — 도메인 참조 전부 `$lib/domain` · `$lib/domain/types`.

## FR-29.2 (R-2) — Import 표기 통일

- [x] `grep -rnE "from ['\"][^'\"]*\.ts['\"]" src/ --exclude-dir=domain` 결과 없음. 컴포넌트 `.svelte` 확장자는 유지되어 있다.
- [x] `src/lib/ui/state/boot.ts` — `./storage`, `./state.svelte` (같은 층), `$lib/domain`, `$lib/data/catalog` (층 넘음).
- [x] `src/lib/ui/session/session.svelte.ts` — `$lib/ui/state/storage`, `$lib/domain`, `$lib/domain/types`.
- [x] `src/lib/domain/*.ts` — **변경 없음.** 상대 경로 + `.ts` 유지, `$lib` 0건. `tz-probe` · `runUnderTZ` 테스트 통과로 plain Node 실행 확인.

## FR-29.3 (R-3) — 폴더 재배치

- [x] `ls src/lib/ui/` — 디렉터리 5개 (`shell/ state/ common/ today/ session/`), 파일 0개.
- [x] `ls src/lib/ui/shell/` — About.svelte, Toast.svelte, theme.svelte.ts, wakelock.svelte.ts, install.svelte.ts, sw.svelte.ts, nav.ts (7개).
- [x] `ls src/lib/ui/state/` — storage.ts, state.svelte.ts, boot.ts, today.svelte.ts, reset.ts (5개).
- [x] `ls src/lib/ui/common/` — ChipGroup.svelte, Confirm.svelte (2개).
- [x] `ls src/lib/ui/session/` — session.svelte.ts, timer.svelte.ts, notify.ts, ExerciseCard.svelte, FreeExerciseForm.svelte, ProposalBanner.svelte, RepsInput.svelte, RpeInput.svelte, TimerInput.svelte, labels.ts (10개).
- [x] `ls src/lib/ui/today/` — todayScreen.ts (1개).
- [x] 커밋 b (`git show -M --stat`) 에서 이동한 18개가 전부 rename 으로 잡힌다 (import 줄만 바뀜).
- [x] 커밋 c 의 diff 는 import 교체·확장자 제거·별칭 통일뿐, 로직 변경 없음.

## FR-29.4 — 재발 방지 검사 (`tests/unit/structure.test.ts`)

- [x] `LAYER_ROOTS` 상수가 정의됨 (9개): `lib/domain`, `lib/data`, `lib/ui/shell`, `lib/ui/state`, `lib/ui/common`, `lib/ui/today`, `lib/ui/session`, `lib/ui/history`, `routes`.
- [x] "src/ 에 .ts 확장자 import 0건 (domain 제외)" 검사 + "domain 은 상대 import 전부 .ts, $lib 0건" 검사.
- [x] "UI · 라우트에서 $lib/domain 은 index 또는 types 이외 참조 0건" 검사.
- [x] "층 넘는 상대 경로 0건" 검사.
- [x] "src/lib/ui 직속 파일 0건" 검사.
- [x] 이 테스트 파일 자체가 규칙을 어기지 않는다 (자기 참조 통과).
- 실행 결과: 7개 assertions 전부 통과 (PLAN 예상 4~6건보다 1개 더 — 자기참조 검사 포함).

## FR-29.5 — CLAUDE.md 갱신

- [x] `grep -n "\\$lib/domain\\|층을 넘\\|역할별 하위 폴더" CLAUDE.md` — 규칙 세 문장 존재 (CLAUDE.md:48–60).
- [x] 「규약을 어긴 실제 사례」 절에 FR-29 항목 등재 (CLAUDE.md:68–75).

## NFR-25 유지

- [x] 커밋 a: `pnpm check` 0/0, `pnpm test` 657 passed.
- [x] 커밋 b: `pnpm check` 0/0, `pnpm test` **실패** (정정 — 2026-09-21 검증).
  > 커밋 30ae3b7 은 순수 `git mv` 18개만 포함하고 import 경로를 고치지 않았다.
  > tests/ 의 경로 수정은 커밋 c(e3ff29c)에서 일괄 처리됐다.
  > 커밋 메시지 본문도 "이 커밋에서는 러너가 새 경로를 몰라 테스트가 깨진다"로 명시.
  > PLAN 도입부·RISK-1 이 이 예외를 선례 184fcff 로 정당화. ADR-26 의 "이번엔 예외 없이"
  > 원칙과 상충하지만, 이동·경로수정을 다음 커밋에서 한 번에 처리하는 방식이 채택됐다.
  > 이동·경로수정 커밋 쌍은 반드시 짝으로 merge — 커밋 b 단독 push 금지.
- [x] 커밋 c: `pnpm check` 0/0, `pnpm test` 657 passed.
- [x] 커밋 d: `pnpm check` 0/0, `pnpm test` 664 passed (657 + 7 structure 검사).
- [x] 커밋 e: `pnpm check` 0/0, `pnpm test` 664 passed.

## 동작 무변경 (수동 확인)

- [ ] 앱을 열어 오늘 · 프로그램 · 단계 화면이 이전과 동일하게 표시.
- [ ] 세션을 시작 → 세트 입력 → 완료 흐름이 이전과 동일.
- [ ] 3탭이 아직 유지됨 (기록 탭은 Phase 2 에서 추가).

---

## 검증 메모 (2026-09-21 코드 검증)

### 쟁점 1 — 커밋 b(30ae3b7) 테스트 실패

**결론: TEST 문서 오기. PLAN 도입부·RISK-1 이 맞다.**

커밋 30ae3b7 은 `git mv` 18개만 포함하고 import 경로를 전혀 고치지 않았다
(git diff stat 에서 18개 모두 0줄 변경 rename). tests/ 의 경로 수정은
커밋 c(e3ff29c) 에서 일괄 처리됐다. 커밋 메시지 본문도 이를 명시.

`git show 30ae3b7:tests/unit/todayScreen.test.ts` 로 확인: 당시 테스트 파일은
여전히 `../../src/lib/ui/todayScreen.ts`(이동 전 경로)를 참조 — 이 커밋에서는
해당 경로가 존재하지 않으므로 테스트 실패.

TEST 문서 항목 "커밋 b: 657 통과 (예외 없음)"은 잘못됐다 — 위에서 정정 완료.
PLAN 도입부의 "커밋 2 는 예외"와 GLOBAL.md RISK-1 이 사실과 일치한다.

### 쟁점 2 — vitest.config.ts $lib alias

**결론: 타당. GLOBAL.md ADR-27 에 사실 기록 완료.**

커밋 0cc45cb 에서 추가. FR-29.1 로 `todayScreen.ts` 등이 `$lib/domain` 을
사용하기 시작했는데, tests 가 이 파일들을 직접 import 하므로 vitest 러너가
`$lib` 를 해석할 수 없어 실패한다.

검증 경로:
- `tests/unit/todayScreen.test.ts` → `../../src/lib/ui/today/todayScreen.ts`
- `src/lib/ui/today/todayScreen.ts:16` → `import ... from '$lib/domain'`
- 106b8f7 baseline의 `vitest.config.ts` 에는 `$lib` alias 없음.
- alias 없이는 위 transitive import 에서 "Cannot resolve $lib/domain" 발생.
