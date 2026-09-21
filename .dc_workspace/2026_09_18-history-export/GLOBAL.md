# bigsix SPEC3 — Global Documentation

**Target Version**: 0.2.0 (추가분 — 미릴리스 상태에 얹는다)
**Work Type**: feature
**Base Branch**: `feature/ui` (`9791b15`) — 새 브랜치·worktree 생성 없음 (사용자 지시)
**Working Branch**: `feature/ui`
**Worktree**: `/home/ulismoon/Documents/bigsix-feature-ui`
**SOT**: 같은 디렉터리의 `SPEC.md` (SPEC3) — 본 문서와 어긋나면 SPEC 이 이긴다.
**선행 SPEC/GLOBAL 승계**:
- `.dc_workspace/2026_09_03-program-session/GLOBAL.md` — 엔진 ADR-1~7
- `.dc_workspace/2026_09_04-ui/GLOBAL.md` — UI 1차 ADR-8~14
- `.dc_workspace/2026_09_05-ui-2/GLOBAL.md` — UI 2차 ADR-15~19
- 이번은 **ADR-20 부터** 잇는다.

---

## Feature Overview

SPEC3 「Overview」 3항을 그대로 잇는다.

1. **볼 곳이 없다** — 도메인의 `reviewDay`/`reviewRange` 를 부르는 UI 가 없다.
2. **꺼낼 수 없다** — 기록이 `localStorage` 에만 있어 백업·AI 분석이 불가능하다.
3. **남는 자료가 분석에 모자란다** — 세션 당시 목표 · 세트별 RPE · 완료 시각이 저장되지 않는다.

**Solution 요지**
- **FR-29** 구조 정리(동작 무변경)를 먼저 한다 — 도메인 index 경유 · import 표기 통일 · `src/lib/ui/` 역할별 폴더화.
- 기록 탭을 새로 두어 **날짜별 목록**과 **종목별 추이**를 보여준다 (FR-23~25).
- **JSON · CSV 내보내기**와 **JSON 가져오기** 를 붙인다 (FR-26, FR-27).
- 앞으로의 세션부터 **목표 · 세트별 RPE · 완료 시각** 을 기록에 함께 남긴다 — 저장 스키마 v3 → v4 (FR-28).

---

## Architecture Decisions

1차·2차의 ADR-1~19 를 승계하고, 이번 개정에서 새로 결정한 사항을 **ADR-20~27** 로 잇는다.

### 승계 요약 (변경 없음)

- ADR-1~7 (엔진): planDay/planOn, AppState.stints/proposals, SessionInput/SessionRecord 분리, 미수행일 파생, 날짜 주입, 제안 2단계 API, history 인덱스 기반 카운트.
- ADR-8~14 (UI 1차): 단일 SvelteKit 앱, 보조 운동 제거, `adjustedAtSessionIndex` 앵커, 저장 봉투, `todayClock`, `boot()` 시퀀스, 페이즈 매핑.
- ADR-15~19 (UI 2차): 파생 카운트 유지, 자유 운동 판정 필터(`judgingHistory`), RPE 관련 정정, cube-study 준용 화면 규약.

**이번 개정에서 유효성이 재확인된 것**
- **ADR-3 · ADR-7 · ADR-15**: 저장 필드는 최소로 유지한다. 새 세 필드(`target` · `setRpes` · `completedAt`)는 저장 필드이지 **파생 필드가 아니다** — 이유는 시점을 다시 살릴 수 없기 때문이다 (`target` 은 그날의 목표이고 재계산으로 복원되지 않는다, `completedAt` 은 그 시각의 실제 클럭). 파생 대 저장 판단의 기준(「시간이 지나면 다시 만들 수 있는가」)이 「저장」 쪽에 있다.
- **ADR-4**: 미수행일은 파생. FR-24 는 이 규칙을 그대로 쓰고 `reviewDay().status` 를 노출만 한다.
- **NFR-3 도메인 순수성**: 도메인은 여전히 시각을 읽지 않는다. `completedAt` 은 UI 가 채워 넣는다 (ADR-24).

---

### ADR-20 — 기록 탭은 순수 함수 + 얇은 컴포넌트로 나눈다. 새 코드는 전부 `src/lib/ui/history/` 아래.

**Problem**
FR-23~27 이 요구하는 화면 · 내보내기 · 가져오기 로직을 라우트 컴포넌트에 얹으면 CLAUDE.md 규약(「순수 로직은 룬을 쓰지 않는 순수 함수로 뺀다」)이 흔들린다.

**Decision**
새 파일은 전부 `src/lib/ui/history/` 아래에 모은다. 라우트는 `src/routes/history/+page.svelte` 하나이고 그림만 그린다.

**파일 목록과 책임**

| 파일 | 책임 | 룬 여부 |
|---|---|---|
| `range.ts` | 기록 표시 범위(첫 stint `selectedAt` 과 첫 record `date` 중 이른 날 ~ `todayClock.today`) 산출, 30일 단위 페이지 창 계산 | 순수 |
| `dayList.ts` | 창을 순회하며 `reviewDay` 를 부르고 `promotedTo`/`blockedBy`/stint 시작·제안 승인일을 결합해 `DayRow[]` 를 만든다 | 순수 |
| `progression.ts` | 한 종목의 `history` 를 시간순으로 훑어 단계 경계 표기와 저장된 목표로만의 충족 판정을 붙인 `ProgressionRow[]` 를 만든다. `defaultProgressionId(state)` 도 포함 | 순수 |
| `exportJson.ts` | `buildExportJson({state, catalog, meta})` — 파일 스키마(아래 (B.3)) 조립 | 순수 |
| `exportCsv.ts` | `buildCsvRows(state, catalog): CsvRow[]`, `formatCsv(rows): string` — RFC 4180 인용 + UTF-8 BOM | 순수 |
| `importJson.ts` | `parseImport(text, current): ImportResult` — 파일 파싱·검증. `storage` 가 새로 export 하는 `validateAndMigrateAppStateEnvelope` 를 재사용 | 순수 |
| `download.svelte.ts` | `saveFile({name, mime, content}): 'downloaded'|'shared'|'unavailable'` — Blob → `<a download>` → Web Share → 실패 감지 | 브라우저 얇은 층 |
| `HistoryView.svelte` | 최상위. `appState` 를 읽어 SegToggle · DayList · ProgressionTable · ExportBar 배치 | 컴포넌트 |
| `DayList.svelte`, `DayRow.svelte` | 날짜별 렌더링 | 컴포넌트 |
| `ProgressionTable.svelte` | 종목별 표 (`<table>`) | 컴포넌트 |
| `ExportBar.svelte`, `ImportDialog.svelte` | 내보내기·가져오기 UI. `ImportDialog` 는 기존 `Confirm` 위에 파일 입력 · 요약을 얹은 조합 | 컴포넌트 |

**Rationale**
`session/` 이 이미 같은 패턴(순수 함수 `labels.ts` + 컴포넌트)으로 정리돼 있다. 새 폴더의 형태를 그것과 일관되게.

---

### ADR-21 (재작성) — UI · 라우트는 도메인을 `$lib/domain`(값) / `$lib/domain/types`(타입) 로만 부른다. FR-29 로 전면 정리.

**Problem**
SPEC 「코드 배치」의 R-1 지적: UI · 라우트가 도메인 공개 API(`domain/index.ts`)를 우회해 `../../domain/schedule.ts` 식으로 내부 파일을 직접 부르는 곳이 6곳. 이번 기능이 이 규칙 위에 쌓이면 사용처가 다시 늘어난다.

**Decision**
- UI · 라우트에서 도메인 참조는 두 경로만: `$lib/domain` (값 export 전체), `$lib/domain/types` (타입 전용). 그 외 `$lib/domain/schedule` · `../domain/date` 등 내부 파일 직접 참조는 0건.
- FR-29.1 로 6곳을 정리한다. 이전 GLOBAL 의 「손대는 파일에만 정정」 · 「타입 전용은 손대지 않음」 원칙은 폐기.
- 새 함수가 필요한데 index 에 없으면 index 에 export 를 더한다. Phase 1 첫 커밋이 그 자리다.

**Rejected 대안**
- 손대는 파일에만 정정: 규약이 계속 「두 벌」로 남는다. 새로 쓰는 코드와 옛 코드가 다른 규칙을 따르는 것이 근본 문제.
- 도메인 서브패스 export 허용: `$lib/domain/date` 를 정식 경로로 열면 「무엇이 공개 API 인지」가 모호해진다.

---

### ADR-22 — 스키마 v3 → v4. 마이그레이션은 no-op. `InProgressSession` 에 `target` 스냅샷 필드.

**Problem**
FR-28 이 세션 입력에 `target` · `setRpes` · `completedAt` 세 필드를 얹지만 기존 판정(승급 · 유지 · 강등)은 어느 것도 보지 않는다. 옛 기록은 이 필드가 없이 그대로 남아야 한다 (EC-57).

**Decision**
- `SessionInput` 에 세 필드를 **선택 필드로** 추가. 형태는 아래 (B.1).
- `CURRENT_SCHEMA_VERSION`: 3 → 4. `APP_STATE_MIGRATIONS[3]` 와 `IN_PROGRESS_MIGRATIONS[3]` 를 no-op 마이그레이터로 잇는다 — ADR-11 의 체인 확장 원칙 그대로.
- `InProgressSession` 에 `target?: SessionTarget` 을 얹는다. `begin(startedAt, plan)` 은 `plan.goal` · `plan.work` 를 스냅샷으로 저장한다. `beginFree` 는 계획이 없으므로 target 없이 시작한다. 앱을 껐다 켜도 스냅샷은 봉투에 남는다 (FR-28.3, EC-68).
- `isInProgressShape` 는 `target` 을 선택 필드로 확인한다 (있으면 `{ goal, work }` 형태만 검사, 없으면 통과).

**Rationale**
ADR-15 「같은 릴리스에서 스키마는 한 번만 올린다」와 어긋나지 않는다 — 0.2.0 은 아직 태그되지 않은 미릴리스이며 SPEC2 배포로 v3 봉투가 사용자 기기에 앉을 수 있는 첫 시점이 지났다. SPEC3 이 그 위에 얹히므로 v3→v4 no-op 마이그레이터가 필요하다.

---

### ADR-23 — `abandonChallenge` · `recordConsolidation` 시그니처는 뒤에 `extras?` 옵션 객체를 얹는다. `rpe` 위치 유지.

**Problem**
기존 시그니처 `(state, catalog, id, date, sets, rpe?)` 에 FR-28 세 필드를 위치 인자로 붙이면 세션·계획·통합 테스트의 30+ 호출부(예: `tests/unit/session.test.ts` 는 60여 회, `tests/unit/integration.test.ts:400·406`, `tests/unit/steps.test.ts:170`, `tests/unit/calendar.test.ts:693`)가 전부 손이 간다.

**Decision**
7번째 파라미터로 옵션 객체 `extras?: SessionExtras` 를 붙인다.

```ts
export interface SessionExtras {
  target?: SessionTarget;             // FR-28.1
  setRpes?: (number | null)[];        // FR-28.1
  completedAt?: string;               // FR-28.4 — ISO 8601 with local offset
}

function abandonChallenge(
  state, catalog, progressionId, date, sets, rpe?, extras?
): AbandonResult;

function recordConsolidation(
  state, catalog, progressionId, date, sets, rpe?, extras?
): { state; record };
```

`applySession` 은 `record = { ...input }` 로 스프레드하므로 시그니처 변경 없이 새 필드가 자동으로 실린다.

**Rejected**: (a) 옵션 객체로 완전 대체 — diff 폭발. (b) 위치 인자로 세 개 추가 — `rpe` 뒤에 셋이 붙어 순서 실수 취약.

---

### ADR-24 — 시각의 근원은 `todayClock` 하나. `nowIsoLocal()` 을 얹는다. 컴포넌트는 여전히 `new Date()` 를 부르지 않는다.

**Problem**
FR-28.4 는 `completedAt` 을 UI 가 채우게 하면서 컴포넌트에서 `new Date()` 를 직접 부르는 것은 금한다. `todayClock` 은 `today: IsoDate` (YYYY-MM-DD) 만 노출하고, `timer.svelte.ts` 의 `Clock` 은 개별 타이머용이다. 세션 완료 시각을 얻을 자리가 없다.

**Decision**
- `todayClock` 에 `nowIsoLocal(): string` 을 얹는다. 반환은 로컬 오프셋 포함 ISO 8601 문자열 (`2026-09-18T13:45:23+09:00`). 내부는 `Date` 하나에서 `getFullYear/Month/Date/Hours/Minutes/Seconds/getTimezoneOffset` 을 조합한다 — `toISOString()` 은 UTC 라 오프셋을 잃는다.
- 테스트에서 시각을 고정하기 위해 `todayClock.setClock({ now: () => number })` 훅을 얹는다. `timer.svelte.ts` 의 `Clock` 인터페이스를 재사용한다. 기본은 `Date.now`.
- `session.svelte.ts` 의 `finalize` · `abandon` 이 `todayClock.nowIsoLocal()` 을 부른다.

**Rationale**
「시각의 근원 하나」 원칙(SPEC2 GLOBAL 의 boot / today / timer 3자 구조)을 확장할 뿐, 새 근원을 만들지 않는다.

---

### ADR-25 — 내보내기 파일 최상위는 `{meta, appState, catalog}`. 가져오기는 `meta.schemaVersion + appState` 만 취해 저장 봉투를 재조립한 뒤 기존 마이그레이션 체인을 그대로 탄다.

**Problem**
FR-26.2 · FR-27.2. 파일은 사람과 AI 모두 읽고, 봉투는 마이그레이션 체인이 이해할 형태여야 한다. 두 요구를 하나의 최상위 스키마로 담아야 한다.

**Decision**
- **파일 스키마 (JSON)**: 아래 (B.3).
- **가져오기 재조립**: 파싱한 파일에서 `envelope = { schemaVersion: file.meta.schemaVersion, appState: file.appState }` 로 봉투를 만들고, `storage` 가 새로 export 하는 `validateAndMigrateAppStateEnvelope(envelope)` 를 부른다. 이 함수는 기존 `migrateAppStateEnvelope` + `isAppStateShape` 를 묶어 `{ ok, state } | { error: 'future-version'|'corrupt', ... }` 를 돌려준다.
- `catalog` 필드는 가져오기에서 **무시**한다 — 현재 앱의 카탈로그를 쓴다. 이름표는 분석용이지 상태의 일부가 아니다.

**Rationale**
SPEC 「검증은 기존 저장 계층을 재사용 — 새 검증 경로를 따로 만들지 않는다」 를 문자 그대로 지킨다. 미래 버전(`v5`) 파일은 `future-version` 으로 자동 거절 (EC-63).

---

### ADR-26 — `src/lib/ui/` 를 역할별 하위 폴더 6개로 재배치. 이동 커밋은 이동 + 최소 경로 수정 (매 커밋 통과).

**Problem**
SPEC 「R-3」: `src/lib/ui/` 직속 파일 18개가 컴포넌트 · 룬 스토어 · 순수 함수 · 저장 계층으로 섞여 있다. 하위 폴더는 `session/` 하나뿐. 새 기능(`history/`)이 얹힐 때 규칙이 모호하다.

**Decision (폴더 배정 확정)**

| 폴더 | 소속 파일 | 성격 |
|---|---|---|
| `src/lib/ui/shell/` | `About.svelte`, `Toast.svelte`, `theme.svelte.ts`, `wakelock.svelte.ts`, `install.svelte.ts`, `sw.svelte.ts`, `nav.ts` | 앱 껍데기 — 상단 바 동반 요소와 하단 네비 계산 |
| `src/lib/ui/state/` | `storage.ts`, `state.svelte.ts`, `boot.ts`, `today.svelte.ts`, `reset.ts` | 저장 · 상태 봉투 · 부팅 · 시각 근원 |
| `src/lib/ui/common/` | `ChipGroup.svelte`, `Confirm.svelte` (+ 이식할 `SegToggle.svelte`) | 재사용 폼 · 다이얼로그 |
| `src/lib/ui/session/` | 기존 `session/*` + `session.svelte.ts`, `timer.svelte.ts`, `notify.ts` | 세션 진행 중 스토어 · 화면 · 카운트업 타이머 · 알림음 (세션 도중 울림) |
| `src/lib/ui/today/` | `todayScreen.ts` | 오늘 화면 파생 |
| `src/lib/ui/history/` | ADR-20 의 신규 파일 목록 | SPEC3 기록 탭 |

**결과**: `src/lib/ui/` 직속 파일 0개. 모든 파일이 6개 하위 폴더 중 하나에 속한다.

**Rejected 대안**
- 성격 축(stores/pure) 로 나눔 — 같은 화면의 스토어와 순수 함수가 흩어짐.
- `nav/` 별도 폴더 — 파일 하나뿐이라 폴더가 과함. `shell/` 에 편입.
- `notify` 를 `shell/` 에 — 실제로는 세션 도중의 카운트업 완료 알림음이 유일 사용처 → `session/` 에.

**커밋 규칙 (SPEC FR-29.3)**
1. 이동 커밋: `git mv` + 이동 때문에 깨지는 import 경로만 고친다(`src/`, `tests/` 모두). 표기는 기존 방식 그대로 둔다. import 줄만 바뀌므로 git 이 rename 으로 인식한다 (`git diff -M --stat` 로 확인).
2. 표기 통일 커밋: R-2 규칙(ADR-27)으로 `src/` 의 import 표기를 바꾼다.

선례 `184fcff` 는 이동 커밋에서 테스트가 깨지는 것을 허용했지만, 이번엔 NFR-25 「각 커밋에서 통과」를 예외 없이 지킨다 — bisect 가 가능해야 한다.

---

### ADR-28 — 동작 설명은 데이터를 그대로 낸다. 새 저장소도, 새 화면도 만들지 않는다.

**Problem**
FR-30 — 운동 중 자세·방법을 알 수 없다. 설명 본문을 어디서 가져오고 어디에 둘 것인가.

**Decision**
- 본문의 출처는 `src/lib/data/progressions.json` 의 `Step.summary` 하나다. 60단계 전부에 이미 있다. **새 파일·새 필드·새 저장소를 만들지 않는다.**
- 표시 자리는 오늘 화면의 운동 카드 안 하나다 (H-8). 단계 화면과 별도 동작 화면은 범위 밖 — 탭이 늘지 않는다.
- 화면 층은 순수 함수(`ui/session/howto.ts`) + 표시 컴포넌트(`Howto.svelte`) 로 나눈다. ADR-20 과 같은 구조.
- 접기는 `<details>` — 포커스·키보드·ESC 처리를 브라우저에 맡긴다. `{#if}` 로 DOM 에서 빼지 않는다 (CONVENTIONS 5.1).
- 보강(FR-30.7)은 **데이터만 고치는 일**이다. 사진 자료가 도착하면 `progressions.json` 의 `summary` 를 늘리고 `python3 tools/gen_movements.py` 로 `docs/MOVEMENTS.md` 를 다시 만든다. 화면 코드는 그대로다.

**Rejected 대안**
- 설명 전용 화면 + 5번째 탭 — 운동 중에 화면을 옮겨야 한다. 불편의 원인 그대로.
- 책 원문 전재 — 저작권. README 「데이터 출처」가 그은 선을 넘지 않는다.
- 이미지 추가 — 이슈 #3. 이번엔 글만 (사용자 요청 문구 그대로 "글로 설명").

---

### ADR-27 — R-2 import 표기 규칙과 FR-29.4 재발 방지 검사.

**규칙**
- **층을 넘는 import**: `$lib/...` 별칭, `.ts` 확장자 없음 (`*.svelte.ts` 는 `*.svelte` 로). 컴포넌트 `.svelte` 확장자는 유지 — 해석에 필요하다.
- **같은 층 안**: 상대 경로 허용, 확장자 없음.
- **예외 — `src/lib/domain/**`**: 내부 import 는 상대 경로 + `.ts` 확장자를 **유지**하고 `$lib` 를 쓰지 않는다. 도메인은 plain Node(`--experimental-strip-types`)로도 실행된다 — `tests/unit/tz-probe.ts` 와 `tests/unit/date.test.ts` 의 `runUnderTZ` 가 여러 `TZ` 로 도메인을 직접 띄워 타임존 무관성을 검증한다. Node 는 확장자 없는 상대 import 와 `$lib` 별칭을 풀지 못하므로 확장자를 지우면 이 검증이 깨진다. `tsconfig.json` 의 `rewriteRelativeImportExtensions: true` 가 이 표기를 허용한다.
- **「층」의 경계**: `src/lib/domain/*`, `src/lib/data/*`, `src/lib/ui/{shell,state,common,today,session,history}` 각각, `src/routes/*` 각각이 하나의 층. `ui/state` 안에서만 `./foo`, `ui/state` → `ui/session` 은 `$lib/ui/session/...`.
- **대상**: `src/` 전체. `tests/` 는 SPEC 명시로 범위 밖 — 다만 파일 이동으로 깨진 tests 경로는 당연히 함께 고친다.

**적용 예**
- `ui/state/boot.ts` 가 `state/storage` 부를 때: `import { ... } from './storage'`.
- `ui/state/boot.ts` 가 `data/catalog` 부를 때: `import { loadCatalog } from '$lib/data/catalog'`.
- `ui/state/boot.ts` 가 `domain/index` 부를 때: `import { ... } from '$lib/domain'`.

**vitest.config.ts `$lib` alias** — Phase 1 커밋 a(0cc45cb) 에서 추가. FR-29.1 이후 `todayScreen.ts` 등이 `$lib/domain` 을 직접 사용하기 시작해, tests 러너가 이 파일들을 transitive import 할 때 `$lib` 를 해석하지 못하는 문제 방지. SvelteKit 이 앱 빌드 시 자동으로 심는 별칭을 vitest 설정에도 명시한 것으로, 동작상 neutral — 필수. 계획에 없던 변경이지만 타당성 검증됨 (Phase 1 검증 2026-09-21).

**Phase 3 검증 확인 사항 (2026-09-21)**

1. **domain/index.ts export * 쟁점 (PLAN 정오)**: `PHASE_3_PLAN.md` 는 `SessionTarget · SessionExtras` 를 `index.ts` 에 명시 추가하도록 지시했으나, `index.ts` 1행 `export * from './types.ts'` 가 이미 모든 타입을 자동 재수출한다. 코더 판단(명시 추가 불필요)이 옳다. 결과는 동일 — 두 타입 모두 `$lib/domain` 으로 접근 가능. PLAN 체크리스트에 정오 기재.

2. **formatIsoLocal(date, offsetMinutes) 순수 포매터 export (PLAN 외 추가, 승인)**: `src/lib/ui/state/today.svelte.ts` 에 계획에 없던 `formatIsoLocal` 을 export 함. 오프셋 계산 로직을 분리해 프로세스 TZ 를 강제하지 않고도 테스트에서 직접 검증 가능하게 한다. `nowIsoLocal()` 내부는 이 함수를 호출한다. ADR-24 취지(결정성 확보)에 부합 — 승인. PLAN 체크리스트에 기재.

3. **recompute clock 주입 변경 (기존 동작 무변경)**: `recompute(now: Date = new Date(this.#clock.now()))` — 기본값이 `new Date()` 에서 `new Date(this.#clock.now())` 로 변경. 프로덕션에서 `#clock` 은 항상 `Date.now` 이므로 동작 변화 없음. `setClock` 주입 시 `today` 와 `nowIsoLocal()` 의 시각 근원이 일관되는 효과 — 테스트 결정성 향상. 기존 테스트 전부 통과 확인.

**FR-29.4 재발 방지 검사** — `tests/unit/structure.test.ts` 신규:

- (a) UI · 라우트에서 `$lib/domain/{index or types}` 이외의 domain 참조 0건. 상대 경로에 `domain/` 등장 0건.
- (b) `src/` 안에서 `.ts` 확장자 import 0건 — **`src/lib/domain/**` 제외**. 도메인은 반대로 검사한다: 상대 import 는 전부 `.ts` 확장자, `$lib` 참조 0건 (plain Node 실행 보장).
- (c) 층 넘는 상대 경로 0건. 파일 소속 층을 경로에서 계산해 참조 대상의 층과 비교. 다르면 위반.
- (d) `src/lib/ui/` 직속에 파일 0건. 하위는 정확히 `{shell, state, common, today, session, history}` 6개.

`tests/` 는 검사 대상 안에 포함하지 않는다 (SPEC 명시).

구현 참조: cube-study `tests/unit/routes.test.ts`. `node:fs` 로 순회. 노드 러너.

---

## 데이터 모델 변경 (요약)

### (B.1) `SessionInput` 확장 (도메인 `types.ts`)

```ts
export interface SessionTarget {
  /** 세션 시작 시점의 목표 라벨·세트·값. plan.goal 스냅샷. */
  goal: { label: StandardLabel; sets: number; value: number };
  /** 세트별 목표. plan.work 스냅샷. sets 배열과 인덱스로 대응한다. */
  work: TargetSet[];
}

export interface SessionInput {
  // 기존 필드 유지
  date: IsoDate;
  progressionId: ProgressionId;
  step: number;
  performedStep?: number;
  sets: number[];
  rpe?: number;
  kind: 'work' | 'consolidation' | 'free';
  outcome?: 'completed' | 'abandoned';

  // FR-28.1 신규 (선택)
  /** 시작 당시 목표. 자유 운동은 없다. */
  target?: SessionTarget;
  /** 세트별 RPE. sets.length 와 길이가 같아야 한다. 입력 없는 세트는 null. */
  setRpes?: (number | null)[];
  /** 완료 또는 중단 시각. ISO 8601 로컬 오프셋 포함. UI 가 채운다. */
  completedAt?: string;
}
```

`SessionRecord extends SessionInput` 은 그대로 → 세 필드가 기록에도 자연히 실린다.

### (B.2) `InProgressSession` 확장 (`src/lib/ui/state/storage.ts`)

```ts
export interface InProgressSession {
  // 기존 필드 유지
  startedAt: IsoDate;
  progressionId: ProgressionId;
  step: number;
  performedStep: number;
  kind: 'work' | 'consolidation' | 'free';
  workSets: SetEntry[];

  /** 시작 시 스냅샷. free 세션은 없다. */
  target?: SessionTarget;
}
```

`SetEntry.rpe?` 는 그대로 재사용 — 세트별 RPE 는 이미 여기에 저장되고 있다. `finalize` 는 `workSets.map(e => e.rpe ?? null)` 로 `setRpes` 배열을 만들어 도메인에 넘긴다.

### (B.3) 내보내기 JSON 파일 스키마

```json
{
  "meta": {
    "app": "bigsix",
    "version": "0.2.0-...",         // __APP_VERSION__
    "commit": "9791b15",            // __COMMIT_HASH__
    "exportedAt": "2026-09-18T13:45:23+09:00",  // todayClock.nowIsoLocal()
    "schemaVersion": 4               // CURRENT_SCHEMA_VERSION
  },
  "appState": { /* AppState 그대로. 진행 중 세션은 없다. */ },
  "catalog": {
    "progressions": {
      "pushup": {
        "nameKo": "푸시업",
        "steps": [
          { "n": 1, "nameKo": "벽 푸시업", "unit": "reps", "perSide": false,
            "beginner": { "sets": 3, "value": 10 },
            "intermediate": { "sets": 3, "value": 25 },
            "progression": { "sets": 2, "value": 50 } }
        ]
      }
    }
  }
}
```

- 파일명: `bigsix-YYYY-MM-DD.json` (내보낸 날 = `todayClock.today`, FR-26.4).
- `JSON.stringify` 인덴트 2.
- 진행 중 세션(`bigsix.session.inprogress`)은 담지 않는다 (FR-26.2, EC-59).

### (B.4) 내보내기 CSV 스키마 (세트 한 줄, long, **22열**)

- 첫 문자 `﻿` (UTF-8 BOM).
- 열 순서 고정:
  `date, completed_at, program, day_number, progression, step, performed_step, step_name, unit, kind, outcome, set_index, value, set_rpe, session_rpe, goal_label, goal_sets, goal_value, target, target_mode, promoted_to, blocked_by`
- 열 정의:

| 열 | 근원 |
|---|---|
| `date` | `record.date` (YYYY-MM-DD) |
| `completed_at` | `record.completedAt ?? ''` |
| `program` | `stintAt(state, record.date)?.programId` → `getProgram(catalog, id).name.ko`. stint 없으면 빈 칸 |
| `day_number` | `dayNumber(stint, record.date)`. stint 없으면 빈 칸 |
| `progression` | `getProgression(catalog, record.progressionId).name.ko` |
| `step`, `performed_step` | 기록 그대로. `performed_step` 은 `record.performedStep ?? record.step` |
| `step_name` | `getStep(catalog, id, performed_step).name.ko` |
| `unit` | 같은 step 의 `unit` (`reps`\|`seconds`) |
| `kind`, `outcome` | 기록 그대로. `outcome` 없으면 빈 칸 |
| `set_index` | 1 부터. 세트 0개면 빈 칸으로 한 줄 (EC-70) |
| `value` | 세트값. 세트 없으면 빈 칸 |
| `set_rpe` | `record.setRpes?.[i] ?? ''` |
| `session_rpe` | `record.rpe ?? ''` (세션 값, 모든 세트 줄에 반복) |
| `goal_label`, `goal_sets`, `goal_value` | `record.target?.goal` 세 값. target 없으면 셋 다 빈 칸 |
| `target` | 그 세트의 `record.target?.work[i-1]?.target` — **숫자만**. target 없으면 빈 칸 |
| `target_mode` | `record.target?.work[i-1]?.mode` — `fixed` \| `max`. target 없으면 빈 칸 |
| `promoted_to`, `blocked_by` | 세션 값, 모든 세트 줄에 반복 |

- 인용 규칙(RFC 4180): 값 안에 `,` · `"` · `\r` · `\n` 이 있으면 값 전체를 `"..."` 로 감싸고 내부 `"` 는 `""` 로 이스케이프 (EC-69).
- 파일명: `bigsix-YYYY-MM-DD.csv`.

### (B.5) 가져오기 판별 유니온

```ts
export type ImportResult =
  | { ok: true; appState: AppState; counts: {
      current: number; incoming: number;
      currentRange: { from: IsoDate; to: IsoDate } | null;
      incomingRange: { from: IsoDate; to: IsoDate } | null;
    } }
  | { ok: false; reason: 'not-json' | 'shape' | 'future-version' | 'schema-missing'; detail?: string };
```

- `parseImport(text, current: AppState): ImportResult`.
- `not-json` — JSON 파싱 실패.
- `shape` — `appState` 필드가 없거나 `isAppStateShape` 실패 (EC-64).
- `future-version` — `meta.schemaVersion > CURRENT_SCHEMA_VERSION` (EC-63). `detail` 에 버전 숫자.
- `schema-missing` — `meta` 자체가 없거나 `meta.schemaVersion` 이 숫자가 아님.

### (B.6) `src/lib/ui/state/storage.ts` 신규 export

```ts
export type EnvelopeValidation =
  | { ok: true; state: AppState }
  | { ok: false; reason: 'future-version'; version: number }
  | { ok: false; reason: 'corrupt' };

export function validateAndMigrateAppStateEnvelope(
  envelope: { schemaVersion: number; appState: unknown }
): EnvelopeValidation;
```

내부에서 기존 `migrateAppStateEnvelope` + `isAppStateShape` 를 그대로 재사용. 새 검증 경로 없음.

---

## Conflicts / Constraints 요약

- SPEC C-1 ~ C-5 그대로 승계.
- `CLAUDE.md` 의 「하단 3탭」 서술과 `nav.ts` 의 「3개 고정」 주석은 Phase 2 에서 4탭으로 고친다.
- 기존 코드의 틀어진 곳은 FR-29 로 전부 바로잡는다 (부분 적용 아님, Phase 1).
- `+layout.svelte` 에는 탭 추가 외에 아무것도 더하지 않는다.

---

## data-* 훅 목록 (신규)

Phase 3~6 에서 도입되고 Phase 8 에서 `CLAUDE.md` 훅 목록에 더한다.

- `data-history-view` — 값: `'day'` | `'progression'`. HistoryView 루트.
- `data-history-empty` — 기록 없음 안내 영역.
- `data-history-toggle` — 날짜별/종목별 SegToggle 그룹.
- `data-day-row` — 값: `YYYY-MM-DD`.
- `data-day-status` — 값: `'rest'|'done'|'partial'|'missed'`.
- `data-day-session` — 값: `id:{index}`.
- `data-day-more` — 「이전 30일 더 보기」 버튼.
- `data-history-progression` — 값: `ProgressionId`. 종목 선택 ChipGroup.
- `data-prog-row` — 값: `YYYY-MM-DD:{idx}`.
- `data-prog-meets` — 값: `'yes'|'no'|''`.
- `data-export-json` / `data-export-csv` / `data-import` — 버튼.
- `data-export-status` — 값: `'downloaded'|'shared'|'unavailable'`.
- `data-import-dialog` — 확인 다이얼로그 루트.
- `data-import-error` — 값: `'not-json'|'shape'|'future-version'|'schema-missing'`.
- `data-import-block` — 값: `'inprogress'`.

---

## 아이콘 (UI-10, H-7)

**우선순위 (사용자 결정)**
1. **Font Awesome Free 먼저.** 후보: `file-arrow-down`(JSON 내보내기), `file-csv`(CSV 내보내기), `file-arrow-up`(JSON 가져오기), `share-nodes`(Web Share fallback 표시).
   - 패키지 추가 없이 **인라인 SVG** 로 옮긴다.
   - **라이선스: CC BY 4.0** — 파일 주석과 About 에 표기 (예: "아이콘: Font Awesome Free — https://fontawesome.com/license/free (CC BY 4.0)").
2. FA 의 형태가 상단 바 아이콘(24×24 선형 · `stroke="currentColor"`) 톤과 어긋나면 **Lucide/Tabler** (MIT/ISC — 표기 의무 없음). 후보: `download`, `file-spreadsheet`, `upload`, `share-2`.
3. 그래도 마땅한 것이 없으면 **직관성 · 시인성 기준으로 직접 그린다** — 16px 축소 시 선이 뭉개지지 않고 라이트·다크 둘 다 대비가 살아야 한다.
4. 어느 경우든 **아이콘만 있는 버튼은 만들지 않는다** — 「JSON 내보내기」 같은 텍스트 라벨을 항상 함께 표기 (`CLAUDE.md`).

최종 선택은 Phase 5~6 구현 시 실물 확인 후 확정한다.

---

## SegToggle 이식 (UI-3)

- 결정: **이식한다.** `~/Documents/cube-study/src/lib/ui/SegToggle.svelte` 를 `src/lib/ui/common/SegToggle.svelte` 로 그대로(주석 포함) 옮긴다.
- 근거: SPEC UI-3 이 명시적으로 "2지선다라 cube-study `SegToggle` 방식을 가져온다" 로 지정. ChipGroup 은 hint 라인이 없어 항상 보이는 한 줄 설명(모바일에 hover 없음)을 못 살린다.
- 사용처: 기록 탭 안 「날짜별 · 종목별」 전환 하나. 종목 6개 선택은 SegToggle 범위(2~4) 초과라 `ChipGroup` 을 그대로 쓴다.

---

## 하이드레이션 자리 예약 (UI-6)

기록 목록은 `localStorage` 에서 오므로 프리렌더 순간과 부팅 후가 다르다. `HistoryView` 는 `booted` 가 false 인 동안에도 자리를 예약한다 (스켈레톤 4~5줄 또는 `min-height`).

판단 근거: cube-study CONVENTIONS 3.1 「그 영역의 표시 여부가 `localStorage` 나 브라우저 상태에서 오는가 → 오면 예약」.

---

## 폭 검증 (UI-8)

4탭이 360px 폭에서 라벨(오늘 · 프로그램 · 단계 · 기록)이 잘리지 않는지 확인. 라벨은 2~3자 한글이라 여유가 있지만 `+layout.svelte` 의 `<nav>` 는 `flex: 1` 로 각 탭이 90px 이 된다. 검사는 자동화하지 않고 리뷰에서 실측한다.

---

## Phase 목록 (총 9개, 전부 순차)

병렬 조건 검토: 파일 겹침 · 런타임 의존 · 테스트 자원 세 축 모두에서 뒤로 갈수록 앞 산출물을 사용 → 병렬 불가. SPEC2 GLOBAL ADR-14 「개발자 1인, 순차」 원칙 승계.

| # | 이름 | Status | 요지 | SPEC 참조 |
|---|---|---|---|---|
| 1 | 구조 정리 (FR-29) | Complete | 도메인 index 경유 + 파일 이동 + import 표기 통일 + 재발 방지 테스트 + CLAUDE.md 규칙 | FR-29.1~29.5 |
| 2 | 4탭 확장 + /history stub | Complete | 하단 네비 4탭, 기록 라우트 stub | FR-23.1 |
| 2.5 | 동작 설명 노출 | Complete | 운동 카드에서 그 단계의 자세·방법을 읽는다. 데이터(`summary`)는 이미 있어 화면에서 부르기만 한다. 도메인·데이터 변경 없음 | FR-30, UI-11, EC-71~73 |
| 3 | 스키마 v4 & 세션 기록 보강 | Complete | ADR-22 · ADR-23 · ADR-24. storage v4 · types 확장 · session.svelte finalize · nowIsoLocal | FR-28.1~28.6 |
| 4 | 기록 탭 뼈대 + 날짜별 목록 | Complete | SegToggle 이식. `history/range.ts`, `history/dayList.ts`, HistoryView·DayList·DayRow. 30일 페이지 | FR-23.2/3, FR-24.1~7, UI-1~9 |
| 5 | 종목별 추이 | Not Started | `history/progression.ts`, ProgressionTable. HistoryView 배치 | FR-25.1~5 |
| 6 | 내보내기 (JSON + CSV) | Not Started | `history/exportJson.ts`, `history/exportCsv.ts`, `history/download.svelte.ts`, ExportBar | FR-26.1~6 |
| 7 | 가져오기 | Not Started | `history/importJson.ts`, ImportDialog | FR-27.1~5 |
| 8 | 문서 갱신 | Not Started | README · CHANGELOG · CLAUDE.md 4탭 · data-* 훅 목록 · 문서 지도 | Constraints |

임시 배포는 페이즈에 넣지 않는다 — 사용자가 별도 지시로 `deploy/README.md` 절차를 수행한다.

---

## 위험 · 트레이드오프

- **RISK-1**: FR-29 이동 커밋(Phase 1 커밋 2, 30ae3b7)이 `pnpm test`/`check` 를 잠시 깨뜨렸다 — **실제 발생 확인 (Phase 1 검증 2026-09-21)**. NFR-25 「각 커밋 통과」와 충돌하지만 선례 `184fcff` 로 정당화. ADR-26 의 "이번엔 예외 없이" 원칙과 상충하나, 이동 + 경로 수정을 커밋 b·c 로 분리해 처리하는 방식이 채택됐다. 커밋 b·c 는 짝으로 push · merge — 커밋 b 단독 push 금지.
- **RISK-2**: R-2 의 「같은 층」 판정 대상이 각 subfolder 단위 → 구현 시 층 경계 판정 함수가 잘못되면 검사가 너무 헐거워지거나 빡빡해진다. `LAYER_ROOTS` 상수를 명시하고 그 상수 자체를 테스트한다.
- **RISK-3**: `NFR-24` — 1년치 데이터에서 스크롤이 30일 단위로 확장될 때마다 `reviewDay` 30회를 다시 부른다. **Phase 4 실측 결과 (2026-09-21)**: 30일 창 평균 **0.18ms**, 1년 창(365일) 평균 **1.22ms** — memoization 불필요. YAGNI 결정 유지. (vitest 환경, AMD Ryzen 기준. 태스크 설계 당시 참조 수치 2.58ms/35.87ms보다 유의하게 빠름 — 환경 차이로 추정)
- **RISK-4**: `completedAt` 이 로컬 오프셋 포함 문자열이라 세션 도중 타임존 이동(비행 등)이 있으면 표시가 어긋난다. 도메인은 이 값을 판정에 쓰지 않으므로 표시상 이슈 — 알려진 한계로 CHANGELOG 에 적는다.
- **RISK-5**: Web Share API 감지 — iOS 독립 실행 모드에서 `<a download>` 가 무시되는 케이스가 있으나 확실한 사전 감지가 어렵다. 사전 판정(`navigator.canShare?.({ files: [test] })`) + 시도 시 예외 catch 두 겹으로 감지. 둘 다 안 되면 「내려받기·공유 모두 안 됩니다」 문구 (EC-61).
- **RISK-6**: 진행 중 세션의 `target` 스냅샷 — SPEC2 시절 v3 봉투에는 이 필드가 없다. v3→v4 no-op 이 값을 채우지 않으므로 그 진행 중 세션은 `target === undefined` 로 완료된다 (FR-28.6 명시).

---

## SPEC 지적 / 확인 사항

- SPEC FR-25.3 「재계산으로 채워 넣지 않는다 (EC-57)」는 정확하다. `plannedExercises` 는 현재 단계 기준의 재계산 값이라 옛 세션의 실제 목표가 아니다 (`src/lib/domain/types.ts:262-268` 주석).
- SPEC UI-3 「종목 선택은 6개라 SegToggle 범위(2~4)를 넘으므로 `ChipGroup`」이 명시적으로 있어, `ChipGroup` 은 hint 라인이 없지만 종목명 라벨만으로 사용처가 충족된다 — 실무상 문제 없음.
- 테스트 기준선: `pnpm test` 실측 결과 **657 tests passed (28 files)**. NFR-25 의 「기준선 657개」는 정확하다. 각 페이즈 커밋 후 이 숫자 이상을 유지한다 (신규 테스트로 늘어난다). Phase 1 완료 후 현재 기준선: **664 tests (29 files)** — structure.test.ts 7건 추가.
