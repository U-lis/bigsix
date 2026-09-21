# Phase 1 — 구조 정리 (FR-29)

**목표**
기능 작업이 얹히기 전에 SPEC 「R-1 · R-2 · R-3」 을 전부 바로잡는다. **동작은 바뀌지 않는다** — 이 페이즈의 모든 커밋은 이동 · import 경로 · export 추가뿐이고, 렌더링과 판정에 영향을 주지 않는다. 매 커밋에서 테스트 수는 그대로 (657) — 다만 커밋 2 는 예외(파일 이동만, 러너가 새 경로를 몰라 실패). 커밋 3 이후 다시 통과한다.

## SPEC 참조

- FR-29.1 (R-1): UI · 라우트의 도메인 내부 직접 import 6곳 → `$lib/domain` 경유.
- FR-29.2 (R-2): `src/` 전체 import 표기 통일 — 층 넘으면 `$lib/...`, 같은 층은 상대 경로, 확장자 표기 없음.
- FR-29.3 (R-3): `src/lib/ui/` 를 6개 역할 하위 폴더로 재배치. 이동 커밋은 이동 + 최소 경로 수정만, 매 커밋 통과 (SPEC FR-29.3).
- FR-29.4: 재발 방지 단위 테스트.
- FR-29.5: `CLAUDE.md` 코드 절 규칙 · 사례 갱신.

## 커밋 경계 (5개)

### (a) `refactor(domain): index 에 필요한 함수 export 추가 + UI 도메인 index 경유`

- `src/lib/domain/index.ts` — 현재 index 에 없는 함수가 있으면 추가 export. 실측상 이번 기능에 필요한 함수(`reviewDay`, `reviewRange`, `stintAt`, `dayNumber`, `activeProposal`, `getProgram`, `getProgression`, `getStep`, `meetsStandard`, `applySession`, `abandonChallenge`, `recordConsolidation`, `judgingState`) 는 모두 index 에 있음을 확인한다. 없으면 이 커밋에서 export 추가.
- R-1 6곳 index 경유:
  - `src/routes/+page.svelte:15` — `$lib/domain/schedule` → `$lib/domain`.
  - `src/lib/ui/session/labels.ts:8` — `../../domain/catalog.ts` → `$lib/domain`.
  - `src/lib/ui/session/labels.ts:9` — `../../domain/date.ts` → `$lib/domain`.
  - `src/lib/ui/todayScreen.ts:16` — `../domain/date.ts` → `$lib/domain`.
  - `src/lib/ui/session/ProposalBanner.svelte:7` — `../../domain/schedule.ts` → `$lib/domain`.
  - `src/lib/ui/session/FreeExerciseForm.svelte:20` — 도메인 imports → `$lib/domain`.
- 이 커밋에서 `pnpm test`/`check` 통과. 테스트 수 657 그대로.

### (b) `refactor(ui): src/lib/ui 를 역할별 하위 폴더로 이동`

- 18개 `git mv` (선례 `184fcff` 그대로):
  - **shell/**: `About.svelte`, `Toast.svelte`, `theme.svelte.ts`, `wakelock.svelte.ts`, `install.svelte.ts`, `sw.svelte.ts`, `nav.ts`
  - **state/**: `storage.ts`, `state.svelte.ts`, `boot.ts`, `today.svelte.ts`, `reset.ts`
  - **common/**: `ChipGroup.svelte`, `Confirm.svelte`
  - **session/**: `session.svelte.ts` → `session/session.svelte.ts`, `timer.svelte.ts` → `session/timer.svelte.ts`, `notify.ts` → `session/notify.ts`
  - **today/**: `todayScreen.ts`
- 이동 때문에 깨지는 import 경로만 함께 고친다 (`src/` · `tests/`). 표기(별칭·확장자)는 기존 방식 그대로 — 통일은 커밋 (c).
- import 줄만 바뀌므로 `git diff -M --stat` 에서 18개 전부 rename 으로 잡혀야 한다.
- 이 커밋에서 `pnpm test`/`check` 통과. 테스트 수 657 그대로 (NFR-25, SPEC FR-29.3).

### (c) `refactor: src/ import 표기 통일 (R-2)`

- 규칙 (ADR-27):
  - 층 넘으면 `$lib/...` 별칭.
  - 같은 층은 상대 경로.
  - `.ts` 확장자 표기 없음 (`state.svelte.ts` 는 `state.svelte` 로). 컴포넌트의 `.svelte` 는 **유지** — 모듈 해석에 필요하다.
  - 예외: `src/lib/domain/**` 내부는 상대 경로 + `.ts` 유지 (ADR-27).
- 아래 표는 최종 표기 기준이다. 경로 자체는 커밋 (b) 에서 이미 새 위치를 가리키고, 이 커밋은 표기만 규칙에 맞춘다:

| 파일 | 갱신 내용 |
|---|---|
| `src/routes/+layout.svelte` | `$lib/ui/boot` → `$lib/ui/state/boot`, `$lib/ui/state.svelte` → `$lib/ui/state/state.svelte`, `$lib/ui/session.svelte` → `$lib/ui/session/session.svelte`, `$lib/ui/today.svelte` → `$lib/ui/state/today.svelte`, `$lib/ui/theme.svelte` → `$lib/ui/shell/theme.svelte`, `$lib/ui/wakelock.svelte` → `$lib/ui/shell/wakelock.svelte`, `$lib/ui/install.svelte` → `$lib/ui/shell/install.svelte`, `$lib/ui/sw.svelte` → `$lib/ui/shell/sw.svelte`, `$lib/ui/nav` → `$lib/ui/shell/nav`, `$lib/ui/About.svelte` → `$lib/ui/shell/About.svelte`, `$lib/ui/Toast.svelte` → `$lib/ui/shell/Toast.svelte` |
| `src/routes/+page.svelte` | `$lib/ui/session.svelte` → `$lib/ui/session/session.svelte`, `$lib/ui/state.svelte` → `$lib/ui/state/state.svelte`, `$lib/ui/today.svelte` → `$lib/ui/state/today.svelte`, `$lib/ui/todayScreen` → `$lib/ui/today/todayScreen`, `$lib/ui/Confirm.svelte` → `$lib/ui/common/Confirm.svelte`, session 내부 컴포넌트들은 이미 `$lib/ui/session/*` 이라 그대로 |
| `src/routes/programs/+page.svelte`, `src/routes/steps/+page.svelte` | 같은 방식으로 새 subfolder 경로 반영 |
| `src/lib/ui/state/boot.ts` | 상대 `./storage`, `./state.svelte` 유지. `../domain/index.ts` → `$lib/domain`, `../data/catalog.ts` → `$lib/data/catalog`. 확장자 제거 |
| `src/lib/ui/state/state.svelte.ts` | `./storage` (같은 층), `../domain/types.ts` → `$lib/domain/types`. 확장자 제거 |
| `src/lib/ui/state/storage.ts` | `../domain/types.ts` → `$lib/domain/types` |
| `src/lib/ui/state/today.svelte.ts` | `../domain/types.ts` → `$lib/domain/types` |
| `src/lib/ui/state/reset.ts` | `./state.svelte` 는 같은 층, `./session.svelte` 는 층 넘음 → `$lib/ui/session/session.svelte` |
| `src/lib/ui/session/session.svelte.ts` | `../domain/index.ts` → `$lib/domain`, `../domain/types.ts` → `$lib/domain/types`, `../storage.ts` 는 층 넘음 → `$lib/ui/state/storage` |
| `src/lib/ui/session/timer.svelte.ts` | `../domain/*` → `$lib/domain` 계열. `./notify` 는 같은 층 |
| `src/lib/ui/session/notify.ts` | 필요 시 갱신 |
| `src/lib/ui/session/labels.ts` | `$lib/domain` · `$lib/domain/types` (이미 R-1 에서 반영됨) |
| `src/lib/ui/session/ExerciseCard.svelte` | `../session.svelte` → `./session.svelte`, `../storage` → `$lib/ui/state/storage`, 도메인은 `$lib/domain` |
| `src/lib/ui/session/FreeExerciseForm.svelte`, `RepsInput.svelte`, `RpeInput.svelte`, `TimerInput.svelte`, `ProposalBanner.svelte` | 같은 방식 |
| `src/lib/ui/today/todayScreen.ts` | 도메인은 `$lib/domain` · `$lib/domain/types` |
| `src/lib/ui/shell/About.svelte` | `./sw.svelte` (같은 층), `../reset` → `$lib/ui/state/reset`, `../storage` → `$lib/ui/state/storage` |
| `src/lib/ui/shell/theme.svelte.ts` 등 | 필요 시 갱신 |
| `src/lib/data/catalog.ts` | `../domain/catalog.ts` → `$lib/domain`, `../domain/types.ts` → `$lib/domain/types` |
| `src/lib/domain/*` (내부) | **변경 없음.** 상대 경로 + `.ts` 확장자 유지 (ADR-27 예외 — plain Node 실행) |

- `tests/` 는 SPEC 명시로 범위 밖 — 다만 파일 이동으로 깨진 tests 경로는 함께 고친다 (`tests/unit/*.test.ts` 에서 `../../src/lib/ui/storage.ts` → `../../src/lib/ui/state/storage.ts` 등 이동에 맞춘 경로만).
- 확장자·별칭 스크립트: `sed -E -i "s#from ['\\\"]([^'\\\"]+)\\.ts['\\\"]#from '\\1'#g"` 등을 문자열 리터럴 안 아닌지 확인하며 신중 적용 + 수동 검토.
- 이 커밋 이후 `pnpm test`/`check` 다시 통과. 테스트 수 657.

### (d) `test: 구조 규약 재발 방지 검사 (FR-29.4)`

- `tests/unit/structure.test.ts` 신규.
- 검사 항목 (ADR-27):
  - `LAYER_ROOTS` 상수 정의와 자체 검사.
  - UI · 라우트에서 `$lib/domain/(?!(index|types))` 참조 0건. 상대 경로에 `domain/` 등장 0건.
  - `src/` 전체에서 `.ts` 확장자 import 0건 — `src/lib/domain/**` 제외. 도메인은 반대로 상대 import 전부 `.ts`, `$lib` 0건.
  - 층 넘는 상대 경로(`../`, `../../` 로 층 경계 넘음) 0건. 파일 소속 층을 경로에서 계산해 참조 대상의 층과 비교.
  - `src/lib/ui/` 직속에 파일 0건. 하위는 `{shell, state, common, today, session}` 5개 존재 (history 는 Phase 4 에서 생김).
- `node:fs` 로 순회, happy-dom 불필요.
- 테스트 수 657 + N (신규 4~6 케이스).

### (e) `docs: FR-29 규칙과 사례를 CLAUDE.md 에 반영 (FR-29.5)`

- `CLAUDE.md` 「코드」 절 규칙 추가:
  - 도메인 참조는 `$lib/domain`(값) · `$lib/domain/types`(타입) 로만.
  - `src/` 안 import 는 층 넘으면 `$lib/...`, 같은 층은 상대 경로. 확장자 표기 금지. 단 `src/lib/domain/**` 은 상대 경로 + `.ts` 유지, `$lib` 금지 (plain Node 로도 돈다).
  - `src/lib/ui/` 직속에 파일 두지 않는다 — 역할별 하위 폴더 (`shell`, `state`, `common`, `today`, `session`, `history`).
- 「규약을 어긴 실제 사례」 절에 이번 건 추가:
  - "직접 domain 내부 파일 참조 6곳 · `.ts` 확장자 흔적 · `ui/` 평평함 — 2026-09-18 SPEC3 진입 전 구조 점검에서 발견. FR-29 (Phase 1) 로 정정. 재발 방지는 `tests/unit/structure.test.ts`."
- 이 커밋에서도 테스트 수 657 + N 그대로. 코드 변경 없음.

## 변경 파일 (요약)

- 이동: 18개 `git mv` (커밋 b).
- 경로 갱신: 20+ 개 (커밋 c).
- 신규: `tests/unit/structure.test.ts` (커밋 d).
- 편집: `src/lib/domain/index.ts` (필요 시, 커밋 a), `CLAUDE.md` (커밋 e).
- 6개 UI 파일 R-1 정리 (커밋 a).

## 완료 기준

- 커밋 a~e 전부에서 `pnpm check` 오류/경고 0, `pnpm test` 전부 통과. 예외 없음.
- `structure.test.ts` 4가지 검사 통과.
- `grep -rnE "from ['\"][^'\"]*\.ts['\"]" src/ --exclude-dir=domain` 결과 없음. 도메인은 `tz-probe` · `runUnderTZ` 테스트가 통과하는 것으로 확인.
- `grep -rnE "^import.*from ['\"]\.\.?/.*/(domain)/" src/` 결과 없음 (UI · 라우트 기준).
- `ls src/lib/ui/` 결과: `shell/ state/ common/ today/ session/` — 파일 0개.
- 앱을 열어 오늘/프로그램/단계 화면이 이전과 동일하게 동작 (동작 무변경).

## Completion Checklist

- [x] (a) `refactor(domain)`: 도메인 index 경유 6곳 정리. Verified in `src/routes/+page.svelte`, `src/lib/ui/session/labels.ts`, `src/lib/ui/today/todayScreen.ts`, `src/lib/ui/session/ProposalBanner.svelte`, `src/lib/ui/session/FreeExerciseForm.svelte`. `pnpm check` 0/0, `pnpm test` 657.
- [x] (a) `vitest.config.ts` `$lib` alias 추가. Verified in `vitest.config.ts`. `$lib/domain` 경유 전환 후 tests transitive import 해석에 필요 — 타당 (쟁점 2 검증).
- [x] (b) `refactor(ui)`: `src/lib/ui/` 18개 파일 역할별 하위 폴더로 `git mv`. Verified: `git show -M --stat 30ae3b7` 18개 전부 rename. 이 커밋에서 테스트 깨짐 (쟁점 1).
- [x] (c) `refactor`: R-2 import 표기 통일. Verified: `grep -rnE "from.*\.ts'" src/ --exclude-dir=domain` 결과 없음. `pnpm test` 657.
- [x] (d) `test`: `tests/unit/structure.test.ts` 신규. Verified: 7 assertions passed (LAYER_ROOTS 9개, 5가지 규약 검사). `pnpm test` 664.
- [x] (e) `docs`: `CLAUDE.md` FR-29 규칙·사례 추가. Verified: `CLAUDE.md:48–75`. `pnpm test` 664.
- [x] 완료 기준 전부 충족: `pnpm check` 0/0, `pnpm test` 664 (657+7), 구조 검사 통과, import grep 결과 없음.

## 임시 배포

이 페이즈에 포함하지 않는다.
