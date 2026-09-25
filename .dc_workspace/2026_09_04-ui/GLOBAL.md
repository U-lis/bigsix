# bigsix UI (SvelteKit PWA) — Global Documentation

**Target Version**: 0.2.0
**Work Type**: feature
**Base Branch**: `main` (`832424a`)
**Working Branch**: `feature/ui`
**Worktree**: `/home/ulismoon/Documents/bigsix-feature-ui`
**SOT**: 같은 디렉터리의 `SPEC.md` — 본 문서와 어긋나면 SPEC 이 이긴다.

---

## Feature Overview

**Purpose** (SPEC Overview 요약)
0.1.0 에서 완성된 도메인 로직(순수 함수, 테스트 474개) 위에 **사람이 실제로 쓰는 화면**을 얹어,
폰 홈화면에 설치해 쓰는 하나의 PWA 앱으로 만든다.

**Solution**
저장소를 **단일 SvelteKit 앱**으로 재구성한다. 기존 `src/*.ts` 는 `src/lib/domain/` 으로 **이동만** 하고
로직은 건드리지 않는다. 그 위에 localStorage 저장 계층과 화면 3개(오늘 세션 / 프로그램 선택 /
단계 현황)를 얹는다. **계산 로직은 하나도 새로 만들지 않는다** — 도메인 함수를 호출할 뿐이다.
사용자 요구가 있으면 도메인도 바꾼다 (D-19). 이번 범위의 도메인 변경은 FR-12(보조 운동 제거),
FR-13(단계 수동 세팅 API), FR-15(문서 정정)다.

---

## Architecture Decision

0.1.0 GLOBAL.md 의 ADR-1~7 을 승계하고, 이번 개정에서 새로 결정한 사항을 ADR-8~ADR-14 로 잇는다.

### 승계 (변경 없음)

- **ADR-1**: `planDay` 는 저수준 유지 + 날짜 진입점 `planOn` 신규. `src/lib/domain/schedule.ts` /
  `src/lib/domain/calendar.ts` 로 이동하지만 성격은 그대로.
- **ADR-2**: `AppState` 는 `stints` / `proposals` 2필드 통합. **이 이관 작업이 이 스키마를 확장한다**
  (ADR-11 참조).
- **ADR-3**: `SessionInput` / `SessionRecord` 분리, `promotedTo` / `blockedBy` 는 엔진만 채운다.
- **ADR-4**: 미수행일은 파생. 보조 운동은 status 판정 제외 — **다만 ADR-9 로 보조 운동 필드 자체를
  제거**한다 (D-17 / FR-12).
- **ADR-5**: 날짜 주입 경계. `src/lib/domain/` 안에 `new Date()` / `Date.now()` 0회. UI 가 `IsoDate`
  를 만들어 넘긴다 — 그 책임 소재를 ADR-12 가 정한다.
- **ADR-6**: 제안 생성 2단계 API, `advanceProposals` 부팅 시 1회. **FR-3.1 부팅 시퀀스가 이 계약을
  그대로 소비한다** (ADR-13 참조).
- **ADR-7**: "승급 후 N회" 는 `history` 인덱스 기반 파생. `lastSetbackIndex` / `effectiveFloorIndex` /
  `promotionBaselineIndex`. **FR-13.3 불변식은 이 계산의 하한에 조정 시점을 함께 넣는 것으로 충족한다**
  (ADR-10 참조).

---

### ADR-8: 저장소 구조 — 단일 SvelteKit 앱, 별도 엔진 패키지 없음

**Decision**
`package.json` 하나. `src/lib/domain/` (기존 `src/*.ts`) + `src/lib/data/` (JSON + 로더) +
`src/lib/ui/` (Svelte 5 룬 상태) + `src/routes/` (화면). 참조 구현은 `~/Documents/cube-study` 다 (D-6).

```
bigsix-feature-ui/
├── package.json                    # 유일
├── svelte.config.js
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
├── src/
│   ├── app.html
│   ├── app.css                     # (선택)
│   ├── routes/
│   │   ├── +layout.svelte
│   │   ├── +layout.ts              # export const prerender = true
│   │   ├── +page.svelte            # 화면 1: 오늘 세션 (FR-5, FR-6)
│   │   ├── programs/+page.svelte   # 화면 2: 프로그램 선택 (FR-7)
│   │   └── steps/+page.svelte      # 화면 3: 단계 현황 + 첫 실행 (FR-8, FR-3.5)
│   └── lib/
│       ├── domain/                 # 기존 src/*.ts (이름·내용 그대로 이동)
│       │   ├── index.ts            # 공개 진입점 (FR-0.9)
│       │   ├── types.ts rules.ts catalog.ts gate.ts history.ts plan.ts
│       │   ├── evaluate.ts schedule.ts date.ts program.ts proposal.ts
│       │   ├── session.ts calendar.ts
│       │   └── steps.ts            # 신규 — FR-13 setStep API
│       ├── data/
│       │   ├── progressions.json   # 기존 data/progressions.json (무변경)
│       │   └── catalog.ts          # 카탈로그 로더 (FR-10)
│       └── ui/
│           ├── storage.ts          # localStorage envelope (FR-1)
│           ├── boot.ts             # 부팅 시퀀스 (FR-3)
│           ├── today.svelte.ts     # 오늘 날짜 (FR-4)
│           ├── state.svelte.ts     # AppState 상태·저장 (FR-1, FR-2)
│           ├── session.svelte.ts   # 진행 중 세션 (FR-2)
│           ├── timer.svelte.ts     # 카운트업 타이머 (FR-6.12~6.17)
│           ├── notify.ts           # 소리·진동·화면 점멸 (FR-6.14, EC-24)
│           └── ...                 # Screen-specific 컴포넌트
├── static/
│   ├── icon-192.png icon-512.png icon-maskable.png     # FR-11.4 (Phase 5)
│   └── robots.txt
├── tests/
│   ├── unit/                       # 기존 test/*.test.ts (474 → 조정 후)
│   └── deploy/                     # 배포 스크립트 셸 테스트 (FR-14 준용)
├── deploy/
│   ├── nginx/bigsix.conf           # 이미 존재
│   ├── release.sh deploy.sh remote.sh lib.sh
│   └── README.md
└── .github/workflows/
    ├── ci.yml                      # 타입·단위·shellcheck·셸 테스트
    └── site-check.yml              # 인증서·프리캐시 (배포된 사이트 상시 점검)
```

**Rationale**
- 참조 구현 `~/Documents/cube-study` 가 이 배치를 완결된 형태로 검증했다. 같은 스택 (Svelte 5 +
  vite + vite-pwa-sveltekit + adapter-static + vitest + svelte-check + pnpm)을 쓰기로 확정한 이상
  bigsix 만 별도 패키지를 유지할 이유가 없다 (D-6).
- SPEC 이 이관을 "별도 리팩터링 작업이 아니라 이번 작업에 포함" 하도록 확정했다 (D-6, FR-0).
- 이관 커밋과 UI 커밋을 분리하는 것은 SPEC Notes 「커밋 분리 지침」이 5단계로 명시한다
  (ADR-14 페이즈 매핑 참조).

**Rejected options**
- (i) 워크스페이스 monorepo (packages/engine + packages/app) — 두 `package.json` · lockfile ·
  publish 흐름을 도입하지만 얻는 것이 없다. 엔진 재사용처가 없다.
- (ii) 엔진을 npm 별도 패키지로 유지하고 UI 만 SvelteKit — D-6 으로 명시적으로 폐기.

---

### ADR-9: 보조 운동 필드 전면 제거 (FR-12 / D-17)

**Decision**
도메인 출력에서 보조 운동(악력·종아리·목) 관련 타입과 필드를 **삭제**한다. 파일 `data/progressions.json`
의 스케줄 라벨은 그대로 두되(FR-12.2, 실물 책과 대조한 기록), 앱은 그 라벨을 조용히 건너뛴다
(FR-12.3).

**삭제 대상 (Phase 3 에서 일괄 반영)**
| 파일 | 삭제 항목 |
|---|---|
| `src/lib/domain/types.ts` | `AccessoryItem` 타입 |
| `src/lib/domain/types.ts` | `DayPlan.accessories` 필드 |
| `src/lib/domain/types.ts` | `DayAgenda.accessories` 필드 (판별 유니온의 `kind: 'plan'` 가지) |
| `src/lib/domain/types.ts` | `DayReview.accessories` 필드 |
| `src/lib/domain/schedule.ts` | `planDay` 안의 `accessories: AccessoryItem[]` 지역·반환 |
| `src/lib/domain/program.ts` | `ProgramDescription.accessories` 필드 및 파생 로직 |
| `src/lib/domain/calendar.ts` | `planOn` / `reviewDay` / `noStintReview` 의 `accessories` 필드 |

**Rationale**
- 0.1.0 에서 `accessories` 는 "보이는데 안 세는" 참고 필드였다 (ADR-4 부수 결정 b). L-1 이 그
  모순을 명시적 한계로 남겼다. UI 를 얹는 지금 그 모순은 더 이상 유지할 수 없다 — 화면에 뜨는데
  판정에 안 들어가면 사용자가 안 한 것에 대한 판단을 못 한다.
- ADR-4 「명시적 한계」1항이 "포함하면 `solitary_confinement` 사용자는 매일 `partial`" 이라고
  경고했다. 필드 삭제 방향은 그 경고가 예언한 것이다.
- FR-12.2 로 원전(`progressions.json`)은 손대지 않는다. 안 쓰는 이유로 데이터를 지우는 것은
  다른 문제다.

**파급**
- 이관 시점(Phase 2 끝) 474개 테스트 중 **`accessories` 를 직접 검증하던 약 9개 케이스**가
  Phase 3(FR-12 커밋)에서 삭제·재작성된다. 예상 최종 테스트 수 = 대략 465±5. 정확한 수와 삭제
  사유는 Phase 3 완료 시점에 CHANGELOG 에 남긴다 (FR-12.4).
- 삭제 대상 테스트: 아래 「기존 테스트 474개 처리 방침」참조.

---

### ADR-10: FR-13.3 불변식 — `AppState` 에 조정 앵커 필드 신설, `history` 를 오염시키지 않음

**Problem**
"수동 단계 조정 시점 이후의 세션만 유지 횟수에 센다" (FR-13.3, GitHub 이슈 #4). 현재 `proposal.ts` 의
`maintenanceCount` 는 `history` 인덱스로 판정하므로 조정 사실을 알 방법이 없다.

**Options considered**
1. `AppState` 에 progression 별 조정 앵커(그 시점의 `history.length`)를 저장하고, 승급 후 카운트
   계산 시 하한으로 함께 쓴다 (ADR-7 의 `effectiveFloorIndex` 를 확장).
2. `history` 에 조정 sentinel (예: `{ kind: 'adjustment', ... }`) 을 넣어 `lastSetbackIndex` 가
   함께 인식하게 한다.
3. 조정을 `outcome: 'abandoned'` 세션으로 위장해 넣는다.
4. `stints` 를 재사용해 조정 시 새 stint 를 연다.

**Decision**: 옵션 1.

`AppState` 에 다음 필드를 추가한다.

```ts
export interface AppState {
  steps: Record<ProgressionId, number>;
  history: SessionRecord[];
  stints: ProgramStint[];
  proposals: SwitchProposal[];
  /**
   * 수동 조정 시점의 스냅샷 (FR-13.3).
   * 값 = 조정 직후의 `history.length`. 조정된 적 없는 종목은 필드에 없다.
   * 이 인덱스 **이상**인 세션만 승급·유지 판정의 대상이 된다.
   * 조정은 `history` 에 아무것도 남기지 않으므로(FR-13.4), 세션 인덱스와의 관계는
   * `< adjustedAtSessionIndex` = 조정 전, `>= adjustedAtSessionIndex` = 조정 후 로 결정적이다.
   */
  adjustedAtSessionIndex?: Partial<Record<ProgressionId, number>>;
}
```

**Rationale for choosing (1) over the others**

- 옵션 2 (`history` sentinel) 는 SessionRecord 스키마를 `kind: 'adjustment'` 로 오염시킨다.
  세션이 아닌 사건을 세션 배열에 넣으면 `sessionsAt` / `lastSession` / RPE 필터 등 기존 도메인
  전체가 sentinel 을 무시하기 위해 필터를 추가해야 한다 — **474개 테스트가 sentinel 을
  모르는 상태로 통과 중**이므로 이관 후 재작성 범위가 폭발한다. ADR-4 의 "저장하려면 트리거가
  필요한데 엔진에 트리거가 없다" 원리와 정확히 반대 방향이다.
- 옵션 3 (조정을 abandoned 로 위장) 은 사실을 왜곡한다. `outcome === 'abandoned'` 는 사용자의
  실제 도전 실패라는 의미가 있고, 조정을 그것으로 다루면 통계·조회에서 실제 포기와 구별되지 않는다.
- 옵션 4 (`stints` 재사용) 는 프로그램 구간 개념에 종목 조정을 밀어넣는다. `stintAt(date)` 이
  종목별 관심사에 오염되고, "구간" 이 프로그램 단위인지 종목 단위인지 모호해진다.
- 옵션 1 은 **`history` 를 건드리지 않는다** (FR-13.4 자동 충족). progression 별 하나의
  인덱스만 추가되고, `effectiveFloorIndex` 의 서명이 확장될 뿐이다.

**`proposal.ts` API 변경**

```ts
// 전
export function effectiveFloorIndex(
  history: SessionRecord[], progressionId: ProgressionId, floorDate: IsoDate,
): number;

// 후
export function effectiveFloorIndex(
  history: SessionRecord[], progressionId: ProgressionId,
  floorDate: IsoDate, adjustmentAnchor?: number,
): number {
  const setback = lastSetbackIndex(history, progressionId, floorDate);
  const setbackFloor = setback === null ? 0 : setback + 1;
  return Math.max(setbackFloor, adjustmentAnchor ?? 0);
}
```

`promotionBaselineIndex` / `maintenanceCount` 도 같은 인자를 받아 그대로 전파한다.
`proposeSwitchForCurrent` / `advanceProposals` 는 `state.adjustedAtSessionIndex?.[id]` 를 읽어
각 progression 별 값을 넘긴다.

**신규 API — `src/lib/domain/steps.ts`**

```ts
export function setStep(
  state: AppState, catalog: Catalog, id: ProgressionId, step: number,
): AppState {
  if (step < 1 || step > 10 || !Number.isInteger(step)) {
    throw new Error(`허용 범위 밖: ${step} (1~10 정수만)`);   // FR-13.2
  }
  const gate = checkGate(state, catalog, id);
  if (!gate.unlocked) {
    throw new Error(`잠긴 종목은 세팅할 수 없다: ${id} (${gate.reason})`);   // FR-13.2, FR-8.7
  }
  const anchors = { ...(state.adjustedAtSessionIndex ?? {}), [id]: state.history.length };
  return {
    ...state,
    steps: { ...state.steps, [id]: step },
    adjustedAtSessionIndex: anchors,
  };
}
```

`selectProgram` / `switchProgram` / `applySession` / `recordSession` / `recordConsolidation` /
`abandonChallenge` 은 `adjustedAtSessionIndex` 를 **손대지 않는다** — 스프레드로 그대로
전파되어야 한다. C-2 (0.1.0 GLOBAL.md Risk 5) 와 같은 부류의 결함이 새 필드에서도 재발하지
않도록 Phase 3B 테스트에 "조정 앵커가 그 뒤 세션 기록에서 보존된다" 케이스를 필수로 둔다.

**FR-13.6 과의 정합성**
무리한 단계로 올려도 막지 않는다 — `setStep` 은 범위와 잠금만 검사하고 "너무 어렵다" 는 판단을
하지 않는다. 사용자가 스스로 '불가능' → 다지기 → 강등 경로로 내려온다는 것이 사용자 결정이다
(FR-13.6). 강등은 ADR-7 의 `lastSetbackIndex` 가 잡는다 — 조정 앵커 뒤에서 강등이 나면 그 다음
인덱스가 새 하한이 된다.

---

### ADR-11: localStorage 저장 스키마 — 봉투(envelope) 분리, 버전 필드는 봉투에

**Decision**

두 개의 독립 봉투를 localStorage 에 저장한다.

```ts
// 1) AppState 봉투 — 도메인 상태
const APP_STATE_KEY = 'bigsix.state';
interface AppStateEnvelope {
  schemaVersion: 1;    // 이 앱이 아는 최신 버전
  appState: AppState;  // 도메인이 소유하는 값. 가공 없이 그대로 (FR-1.9)
}

// 2) 진행 중 세션 봉투 — UI 소유 (FR-2.1)
const IN_PROGRESS_KEY = 'bigsix.session.inprogress';
interface InProgressEnvelope {
  schemaVersion: 1;
  inProgress: InProgressSession;
}

interface InProgressSession {
  startedAt: IsoDate;              // FR-2.2 / FR-2.8 (완료 시 SessionInput.date)
  progressionId: ProgressionId;
  step: number;
  performedStep: number;
  kind: 'work' | 'consolidation';
  warmupSets: SetEntry[];          // 워밍업 세트 (FR-2.2)
  workSets: SetEntry[];            // 본 세트 (FR-2.2)
}

interface SetEntry {
  value: number;                    // 횟수(reps) 또는 초(seconds)
  rpe?: number;                     // FR-6.7 세트별 RPE
  /** unit === 'seconds' 세트에서 타이머 시작 시각. 재실행 후 경과 시간 복원 근거 (EC-30). */
  timerStartedAt?: number;          // Date.now() 반환값
  timerEndedAt?: number;
}
```

**Rationale for envelope-with-version**
- FR-1.2 가 "저장 형태는 최소 `{ schemaVersion, appState }` 를 담는 봉투여야 하며, `AppState`
  자체에 버전 필드를 섞지 않는다 (도메인 타입을 오염시키지 않는다)" 로 명시.
- 두 봉투를 분리하는 근거는 FR-2.6 ("진행 중 세션은 `AppState` 와 **분리된 키**에 저장한다.
  `AppState` 는 도메인이 소유하는 값이고 진행 중 세션은 UI 가 소유하는 값이다") 다.

**손상·미래 버전 처리 (FR-1.4, FR-1.5, FR-1.7, EC-1~5)**

| 상황 | 처리 |
|---|---|
| 저장 자체가 없다 | `initialState()` 로 시작. 조용히. 첫 실행 시작 단계 선택 화면(FR-3.5)으로 진입 |
| JSON 파싱 실패 | 원본 보존, `readState` 는 `{ status: 'corrupt', raw }` 반환, 화면이 "초기 상태로 시작" 선택 UI 표시 (FR-1.7 / EC-1) |
| 필수 필드 누락 / 타입 불일치 | 파싱과 동일 처리 (EC-2) |
| `schemaVersion < KNOWN` | 마이그레이션 함수 체인. 0.2.0 은 v1 하나뿐이므로 지금은 no-op (FR-1.4) |
| `schemaVersion > KNOWN` | 읽기 실패. **덮어쓰지 않는다** (FR-1.5 / EC-3). 화면에 사실 표시 |
| localStorage 쓰기 실패 (용량·차단) | 다음 저장이 성공할 때까지 배너에 "저장이 안 되고 있다" 표시 (FR-1.8 / EC-4). 앱은 계속 돈다 |
| localStorage 자체를 못 읽음 (사생활 모드) | 앱 부팅은 성공. 배너로 "저장 불가 — 이 세션이 끝나면 사라진다" 표시 (EC-5) |

**여러 탭 동시 사용 (EC-8 / D-9)**
마지막 쓰기 우선. `storage` 이벤트를 감시하지 않고 잠금도 걸지 않는다. FR-2.3 (세트마다 저장)
과의 조합으로 극단적인 경우 잃는 것은 마지막 한 세트 입력이다.

---

### ADR-12: 날짜 산출 지점 단일화 — `todayIso()` 하나

**Decision**
`src/lib/ui/today.svelte.ts` 안에 `todayIso()` 를 두고, **UI 어디에서도 `new Date()` 를 직접 부르지
않는다.** 컴포넌트는 이 반응성 값 하나만 읽는다 (FR-4.4).

```ts
// src/lib/ui/today.svelte.ts
import { browser } from '$app/environment';
import type { IsoDate } from '$lib/domain/index.js';

function computeIso(): IsoDate {
  // Date.UTC 를 쓰지 않는다 — 여기 요구는 로컬 자정 기준이다 (FR-4.2).
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

class TodayClock {
  today = $state<IsoDate>(computeIso());
  #timer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    if (!browser) return;
    // 다음 자정까지 대기 후 재산출, 그 다음부터 24시간마다. EC-6 대응.
    const scheduleNext = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      const ms = nextMidnight.getTime() - now.getTime();
      this.#timer = setTimeout(() => {
        this.today = computeIso();
        scheduleNext();
      }, ms + 1_000);   // 자정 직후 1초 여유
    };
    scheduleNext();
  }

  stop(): void { if (this.#timer !== null) clearTimeout(this.#timer); }
}
export const todayClock = new TodayClock();
```

**Rationale**
- FR-4.4 "날짜 산출 지점은 **한 곳으로 모은다**" 를 구조로 강제한다. 여러 컴포넌트에서 `new Date()`
  를 직접 부르면 자정 경계에서 컴포넌트마다 결과가 달라진다 (EC-6).
- **로컬 자정 기준으로 산출한다** (FR-4.2). 도메인의 `date.ts` 는 `Date.UTC` 를 쓰는데 그것은
  `IsoDate` 로 넘어온 뒤의 산술을 타임존 독립으로 만들기 위한 것이지, "오늘" 을 정하는 것이 아니다.
  "오늘" 은 사용자 기기의 벽시계 기준이다.
- Svelte 5 룬(`$state`)에 담으므로 자정을 넘길 때 `planOn` 재호출·화면 재렌더가 자동으로 일어난다
  (EC-6 대응).
- **NFR-5a 유지**: `todayClock` 은 `src/lib/ui/` 소속이고 `src/lib/domain/` 은 이 모듈을 import 하지
  않는다. 도메인은 여전히 시스템 시각을 읽지 않는다.

---

### ADR-13: 부팅 시퀀스 — `boot()` 하나가 정한다

**Decision**
`src/lib/ui/boot.ts` 의 `boot()` 가 FR-3.1 순서를 고정된 순서로 실행한다. 화면·컴포넌트는 부팅을
하지 않고 결과만 소비한다.

```ts
// src/lib/ui/boot.ts
export interface BootResult {
  state: AppState;
  catalog: Catalog;
  today: IsoDate;
  agenda: DayAgenda;
  inProgress: InProgressSession | null;
  storageStatus: 'ok' | 'read-blocked' | 'write-blocked' | 'corrupt' | 'future-version';
}

export function boot(): BootResult {
  const catalog = loadCatalog();                            // FR-10 — 이 한 곳
  const stored = readAppState();                            // FR-1.3 / FR-1.7
  const initial = stored.status === 'ok' ? stored.state : initialState();
  const today = todayClock.today;                           // FR-4 — todayClock 하나
  let state = advanceProposals(initial, catalog, today);    // FR-3.3 / ADR-6
  if (state !== initial && stored.status === 'ok') {
    writeAppState(state);                                   // FR-3.4
  }
  const agenda = planOn(state, catalog, today);             // FR-3.1 (4)
  const inProgress = readInProgress();                      // FR-2.4
  return { state, catalog, today, agenda, inProgress, storageStatus: ... };
}
```

**Rationale**
- FR-3.1 이 부팅 순서를 명시적으로 고정한다. `advanceProposals` 를 부팅당 1회만 호출한다는 제약
  (FR-3.2 / EC-19)을 함수 하나가 소유하는 것으로 구조에서 보장한다.
- FR-3.3 (`{ kind: 'no-program' }` 이면 프로그램 선택 화면으로) 는 `+page.svelte` 이 `agenda.kind`
  로 분기하는 것으로 충족한다 — 예외 처리로 분기하지 않는다.
- 첫 실행 시작 단계 선택 (FR-3.5) 은 `stored.status !== 'ok'` && `stored.status !== 'corrupt'` 인
  경우, 즉 진짜 첫 실행에서만 표시한다. FR-13 의 `setStep` API 를 그대로 쓴다 (FR-3.6, "별도 경로를
  만들지 않는다").

---

### ADR-14: 페이즈 매핑 = SPEC Notes 「커밋 분리 지침」의 5경계

**Decision**
SPEC Notes 「커밋 분리 지침」이 명시한 5경계를 페이즈 5개로 1:1 매핑한다. **병렬 페이즈를 만들지
않는다.** 근거는 아래 「병렬화 검토」참조.

| Phase | SPEC 경계 | 커밋 수 | 대상 |
|---|---|---|---|
| Phase 1 | (1) 파일 이동만 | 1 | `src/*.ts` → `src/lib/domain/`, `data/` → `src/lib/data/`, `test/` → `tests/unit/` |
| Phase 2 | (2) 툴체인 | 1~2 | SvelteKit 골격, `package.json` 통합, vitest, `svelte-check`, `loadCatalog` 격리 |
| Phase 3 | (3) 도메인 변경 | 3 | FR-12 / FR-13 / FR-15 각각 별도 커밋 |
| Phase 4 | (4) UI 구현 | 4~6 | 저장·부팅·날짜·카탈로그 → 오늘 세션+타이머 → 프로그램/단계 → PWA 골격 |
| Phase 5 | (5) 배포 | 2~3 | `deploy/`, `.github/workflows/`, `static/` 아이콘, **임시 배포 실행** |

**병렬화 검토**
| 후보 | 결정 | 이유 |
|---|---|---|
| Phase 3A(FR-12) / 3B(FR-13) / 3C(FR-15) 병렬 | **불가 (순차)** | 셋 다 `src/lib/domain/types.ts` 를 수정한다 (파일 겹침 확정). types.ts 하나만 세 브랜치에서 고치면 머지 시 손 조립이 필요하고, 얻는 이득이 없다 (셋을 합쳐 100 줄 남짓의 변경) |
| Phase 4A(오늘 세션) / 4B(프로그램 선택) / 4C(단계 현황) 병렬 | **불가 (순차)** | 세 화면이 공통으로 `src/lib/ui/state.svelte.ts` 를 소비하고, 화면 구현 중에 store 조정이 발생하는 것이 정상이다. cube-study 참조 구현이 사실상 이 방식(단일 브랜치, 순차 커밋)으로 진행됐다. 개발자 1인이 유일 소비자인 상황에서 worktree 병렬은 병합 비용만 늘린다 |

**Rationale**
- 병렬 페이즈는 파일·모듈·테스트 겹침이 0 이어야 하는데 위 후보는 셋 다 겹침을 인정해야 성립한다.
- 이전 작업(0.1.0)의 Phase 3A/3B/3C 는 사전에 `LABEL_TO_ID` export 이관, `test/helpers.ts` 사전
  확정 같은 **겹침 제거 작업**을 Phase 1 에 배정한 뒤 성립했다. 이번 작업의 후보는 그런 사전
  분리로 해결되는 유형이 아니다.
- 순차 실행하면 `PHASE_N.5_PLAN_MERGE.md` 가 필요하지 않다. 대신 각 페이즈의 PLAN 안에서 커밋
  경계를 명시한다.

---

## Data Model

### 신규·변경 타입 요약

```ts
// src/lib/domain/types.ts (확장)
export interface AppState {
  steps: Record<ProgressionId, number>;
  history: SessionRecord[];
  stints: ProgramStint[];
  proposals: SwitchProposal[];
  adjustedAtSessionIndex?: Partial<Record<ProgressionId, number>>;  // ADR-10 (FR-13.3)
}

// AccessoryItem, DayPlan.accessories, DayAgenda.accessories, DayReview.accessories,
// ProgramDescription.accessories — 전부 삭제 (ADR-9 / FR-12)
```

```ts
// src/lib/ui/storage.ts (신규)
export const APP_STATE_KEY = 'bigsix.state';
export const IN_PROGRESS_KEY = 'bigsix.session.inprogress';

export const CURRENT_SCHEMA_VERSION = 1;

export type ReadResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'empty' }
  | { status: 'corrupt'; raw: string }
  | { status: 'future-version'; version: number }
  | { status: 'read-blocked'; error: Error };

export interface AppStateEnvelope { schemaVersion: 1; appState: AppState; }
export interface InProgressEnvelope { schemaVersion: 1; inProgress: InProgressSession; }
```

```ts
// src/lib/ui/session.svelte.ts (신규)
export interface InProgressSession {
  startedAt: IsoDate;              // FR-2.2 / FR-2.8
  progressionId: ProgressionId;
  step: number;
  performedStep: number;
  kind: 'work' | 'consolidation';
  warmupSets: SetEntry[];          // 순서대로 채워진다. 미입력 세트는 아직 배열에 없다
  workSets: SetEntry[];
}
export interface SetEntry {
  value: number;
  rpe?: number;
  timerStartedAt?: number;         // Date.now() (EC-30)
  timerEndedAt?: number;
}
```

### Relationships

```
localStorage
 ├── 'bigsix.state'                    { schemaVersion, appState }        (FR-1)
 └── 'bigsix.session.inprogress'       { schemaVersion, inProgress } | 없음 (FR-2)

boot()
 ├── loadCatalog()                     src/lib/data/progressions.json 을 import
 ├── readAppState()                    ReadResult<AppStateEnvelope>
 ├── todayClock.today                  IsoDate (로컬 자정 기준)
 ├── advanceProposals(state, cat, d)   상태 변경 있으면 writeAppState
 ├── planOn(state, cat, d)             DayAgenda
 └── readInProgress()                  InProgressSession | null

domain (src/lib/domain/) — 브라우저·Node·Svelte 를 import 하지 않는다 (NFR-3)
 ├── types / rules / catalog(fromJSON only) / gate / history / plan / evaluate
 ├── schedule / date / program / proposal / session / calendar
 └── steps (신규, FR-13)
```

---

## API Design

### 신규 공개 함수 (도메인)

| 모듈 | 함수 | 성격 | FR |
|---|---|---|---|
| `src/lib/domain/steps.ts` | `setStep(state, catalog, id, step)` | 상태 전이 | FR-13.1 / FR-13.2 |
| `src/lib/domain/proposal.ts` | 기존 `effectiveFloorIndex` / `promotionBaselineIndex` / `maintenanceCount` 의 선택 인자 `adjustmentAnchor?: number` 추가 | 순수 | FR-13.3 |

### 삭제 대상 (ADR-9 / FR-12)

`AccessoryItem` 타입, `AccessoryItem[]` 필드 4곳, `ProgramDescription.accessories`, `planDay` 반환의
`accessories`, `describeProgram` 파생의 `accessories`.

### 변경 대상 (FR-15)

`src/lib/domain/types.ts:155` 의 `max` 주석: "이 수치를 상한으로 최대한" → "이 수치를 하한으로
최대한 (기준 이상이면 얼마든 초과 수행할 수 있고, 초과분이 승급 근거가 된다)". 코드 동작 무변경.

### 신규 UI 함수 (도메인 밖)

| 모듈 | 함수 | FR |
|---|---|---|
| `src/lib/data/catalog.ts` | `loadCatalog(): Catalog` — 앱 전용 로더. JSON 을 vite import 로 적재 후 `fromJSON` 을 부른다 | FR-10 |
| `src/lib/ui/storage.ts` | `readAppState() / writeAppState() / clearAppState()` | FR-1 |
| `src/lib/ui/storage.ts` | `readInProgress() / writeInProgress() / clearInProgress()` | FR-2 |
| `src/lib/ui/today.svelte.ts` | `todayClock.today` (`$state<IsoDate>`), `todayClock.start()` | FR-4 |
| `src/lib/ui/boot.ts` | `boot(): BootResult` | FR-3 |
| `src/lib/ui/state.svelte.ts` | `appStateStore` (룬 클래스). 세팅자마다 저장 트리거 | FR-1.6 |
| `src/lib/ui/session.svelte.ts` | `inProgressStore` — 세트 입력마다 저장, 완료 시 clear | FR-2.3 / FR-2.5 |
| `src/lib/ui/timer.svelte.ts` | 카운트업 타이머 클래스. `start()`, `stop()`, 목표 도달 시 `notify.alert()` 5초 | FR-6.12~6.17 |
| `src/lib/ui/notify.ts` | 소리·진동·화면 점멸을 동시에 시도, 하나라도 살아 있으면 통과 (EC-24) | FR-6.14 |

---

## 모듈 구성표

| 파일 | 상태 | 책임 | Phase |
|---|---|---|---|
| `package.json` | **재작성** | pnpm + SvelteKit 스크립트로 통합 | 2 |
| `svelte.config.js` | 신규 | adapter-static, PWA plug | 2 |
| `vite.config.ts` | 신규 | SvelteKitPWA 설정, `commitHash` / `__APP_VERSION__` | 2 (골격) / 4 (PWA workbox 설정 확장) |
| `vitest.config.ts` | 신규 | `tests/unit/**/*.test.ts` | 2 |
| `tsconfig.json` | 신규 | cube-study 준용 (strict, bundler, allowJs·checkJs) | 2 |
| `src/lib/domain/*.ts` | **이동만** | 기존 `src/*.ts` 를 이름·내용 그대로 이동 | 1 |
| `src/lib/data/progressions.json` | **이동만** | 기존 `data/progressions.json` | 1 |
| `src/lib/data/catalog.ts` | 신규 | `loadCatalog()` — JSON vite import 로 적재 | 2 |
| `src/lib/domain/catalog.ts` | 축소 | `loadCatalog()` (node:fs 의존) 제거 또는 격리 | 2 (FR-0.7) |
| `src/lib/domain/types.ts` | 삭제·확장 | `AccessoryItem` 등 삭제 (FR-12) + `adjustedAtSessionIndex` 추가 (FR-13.3) + `max` 주석 정정 (FR-15) | 3 |
| `src/lib/domain/steps.ts` | 신규 | `setStep` (FR-13.1) | 3 |
| `src/lib/domain/{schedule,program,calendar}.ts` | 삭제 | `accessories` 필드 제거 (FR-12) | 3 |
| `src/lib/domain/proposal.ts` | 확장 | `effectiveFloorIndex` / `promotionBaselineIndex` / `maintenanceCount` 에 `adjustmentAnchor` 인자 (FR-13.3) | 3 |
| `src/lib/domain/index.ts` | 확장 | `loadCatalog` export 제거 (Node 전용 격리 시), `setStep` export | 2 · 3 |
| `src/lib/ui/storage.ts` | 신규 | FR-1 저장 계층 | 4 |
| `src/lib/ui/state.svelte.ts` | 신규 | AppState 룬 스토어 + 저장 트리거 (FR-1.6) | 4 |
| `src/lib/ui/session.svelte.ts` | 신규 | 진행 중 세션 (FR-2) | 4 |
| `src/lib/ui/today.svelte.ts` | 신규 | `todayClock` (FR-4) | 4 |
| `src/lib/ui/boot.ts` | 신규 | 부팅 시퀀스 (FR-3) | 4 |
| `src/lib/ui/timer.svelte.ts` | 신규 | 카운트업 타이머 (FR-6.12~6.17) | 4 |
| `src/lib/ui/notify.ts` | 신규 | 다중 알림 (FR-6.14 / EC-24) | 4 |
| `src/routes/+layout.svelte` | 신규 | 상단·하단 네비 (FR-9), 저장 실패 배너 (FR-1.8) | 4 |
| `src/routes/+layout.ts` | 신규 | `export const prerender = true` | 4 |
| `src/routes/+page.svelte` | 신규 | 화면 1 — 오늘 세션 (FR-5, FR-6) | 4 |
| `src/routes/programs/+page.svelte` | 신규 | 화면 2 — 프로그램 선택 (FR-7) | 4 |
| `src/routes/steps/+page.svelte` | 신규 | 화면 3 — 단계 현황 + 첫 실행 (FR-8, FR-3.5) | 4 |
| `static/icon-192.png` `icon-512.png` `icon-maskable.png` | 신규 | PWA 에셋 (FR-11.4) | 5 |
| `deploy/{release,deploy,remote,lib}.sh` | 신규 | cube-study 준용, 로컬 실행 (FR-14) | 5 |
| `deploy/README.md` | 신규 | 배포 절차 (bigsix 특화) | 5 |
| `deploy/nginx/bigsix.conf` | **이미 존재** | 서버측 이미 배치. 참고 문서로 유지 | 5 |
| `.github/workflows/ci.yml` | 신규 | 타입·단위 (Playwright 없음: 이번 범위 X) | 5 |
| `.github/workflows/site-check.yml` | 신규 | 인증서·프리캐시 상시 점검 | 5 |
| `tests/deploy/{run,helpers,test-*}.sh` | 신규 | 배포 스크립트 셸 테스트 (cube-study 준용) | 5 |

---

## Phase Overview

| Phase | Description | Status | Dependencies |
|-------|-------------|--------|--------------|
| 1 | 파일 이동만 — git rename 인식 (FR-0.2, 0.3, 0.4 이동 부분) | Not Started | - |
| 2 | 툴체인 — SvelteKit·vitest·svelte-check·loadCatalog 격리 (FR-0.1, 0.4~0.7, 0.9) | Not Started | Phase 1 |
| 3 | 도메인 변경 — FR-12 / FR-13 / FR-15 (커밋 3개) | Not Started | Phase 2 |
| 4 | UI 구현 — 저장·부팅·화면 3개·타이머·PWA 골격 (FR-1~11 대부분) | Not Started | Phase 3 |
| 5 | 배포 — `deploy/`, CI, PWA 에셋, **임시 배포 실행** (FR-11.4, FR-14) | Not Started | Phase 4 |

**병렬 페이즈 없음. 병합 페이즈(N.5) 없음** (ADR-14 참조).

---

## Phase Dependencies

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5
```

**Phase 3 안에서의 커밋 순서**: FR-12 → FR-13 → FR-15. 셋 다 `types.ts` 를 건드리므로 순차. FR-15 는
주석만이라 어디에 두어도 되지만 마지막이 자연스럽다.

**Phase 4 안에서의 커밋 순서**:
1. 저장 계층 + 부팅 시퀀스 + 카탈로그 로더 + `todayClock` (헤드리스 단위 테스트 대상)
2. 진행 중 세션 스토어 + 타이머 + 알림
3. 화면 1 오늘 세션 + FR-6 세트 입력
4. 화면 2 프로그램 선택 + 화면 3 단계 현황 + 첫 실행 화면
5. PWA 골격 (manifest, service worker 등록, adapter-static 확인)

각 커밋 단위에서 새 UI 코드의 vitest 통과와 svelte-check 오류 0 을 유지한다 (NFR-13, NFR-17).

---

## 기존 테스트 474개 처리 방침

**대전제**
- **Phase 1 끝 시점에는 테스트가 통과하지 않는다** — 파일이 옮겨졌지만 러너는 아직 옛 경로를 본다.
- **Phase 2 끝 시점에 474개가 vitest 로 통과해야 한다** (FR-0.5). 이 시점이 SPEC 의 "이관 후 전부
  통과" 의 기준이다. Phase 1 과 Phase 2 를 한 논리 단위로 본다는 뜻이다.
- Phase 3 (도메인 변경) 이후로는 테스트 수가 줄거나 바뀌는 것이 정상이다 (FR-12.4). 변경 개수와
  사유는 Phase 3 완료 시점에 CHANGELOG 에 남긴다.

### Phase 2 통과를 위한 이관 세부

| 파일 | 조치 | 근거 |
|---|---|---|
| `test/*.test.ts` → `tests/unit/*.test.ts` | 위치 이동 + import 경로 갱신 (`../src/…` → `../../src/lib/domain/…`) + `node:test` / `node:assert` → `vitest` 로 API 변환 (`test`/`describe`/`it` 은 vitest 도 지원, `assert.equal` → `expect().toBe()` 또는 `assert` 를 vitest 의 그것으로 유지) | FR-0.4 |
| `test/helpers.ts` → `tests/unit/helpers.ts` | 위치 이동 + `loadCatalog(new URL(...))` 를 새 로더로 교체 (`import catalog from '$lib/data/progressions.json'` + `fromJSON`) | FR-0.4 / FR-10.4 |
| `test/tz-probe.ts` | 삭제 또는 `tools/` 로 이동. 검사 스크립트지 테스트가 아니다 | 정합성 |
| `test/consistency.test.ts` | 그대로 이관 (12 테스트). 데이터-도메인 정합성 검사 | — |

**단언 API 이관 방침** (Phase 2 상세)
- `node:test` 의 `test(name, fn)` / `describe` / `it` 은 vitest 에서 동일 호출로 동작한다.
- `node:assert` 는 vitest 안에서도 그대로 쓸 수 있다 (`import assert from 'node:assert/strict'`).
  단언을 일괄 재작성하지 않고, `assert` 를 유지하는 것이 이관 diff 를 최소화한다. Phase 2 는 "동작
  보존" 이 요구이므로 스타일 변경은 하지 않는다.
- `t.diagnostic()` 같은 `node:test` 고유 API 는 이 저장소에서 사용되지 않는다 (grep 확인).

### Phase 3 (FR-12) 에서 조정되는 테스트

**삭제 대상 (약 6개)**
| 파일 | 케이스 |
|---|---|
| `tests/unit/program.test.ts` | "solitary_confinement 의 보조 운동은 악력·종아리·목 3종이다 (FR-2.3)" |
| `tests/unit/program.test.ts` | "악력 운동이 월·목 두 번 나오지만 중복 제거된다" |
| `tests/unit/program.test.ts` | "나머지 4종의 보조 운동은 빈 배열이다" |
| `tests/unit/calendar.test.ts` | "solitary_confinement 월요일에 accessories 가 채워진다" |
| `tests/unit/calendar.test.ts` | "accessories 가 planned 에 섞이지 않는다" |
| `tests/unit/calendar.test.ts` | "보조 운동이 없는 프로그램은 accessories 가 빈 배열이다" |

**재작성 대상 (약 4~5개)**
| 파일 | 케이스 | 재작성 방향 |
|---|---|---|
| `tests/unit/program.test.ts` | "보조 운동이 progressionIds 에 섞이지 않는다" | "빅6 매핑에 없는 라벨은 `progressionIds` 에 나타나지 않는다" |
| `tests/unit/program.test.ts` | 필드 스냅샷 (`['trainingDays', 'restDays', 'progressionIds', 'accessories']`) | `accessories` 삭제 |
| `tests/unit/schedule.test.ts` | "빅6에 없는 보조 운동은 따로 분류된다" | "빅6에 없는 라벨은 조용히 건너뛴다 — DayPlan 에 남지 않는다" (FR-12.3) |
| `tests/unit/plan.test.ts` | DayPlan 키 스냅샷 (`['accessories','exercises','locked','rest','weekday']`) | `accessories` 삭제 |
| `tests/unit/calendar.test.ts` | "활성 구간이 없으면 plannedExercises 와 accessories 가 둘 다 빈 배열이다" | `accessories` 부분만 삭제, `plannedExercises` 검증은 유지 |
| `tests/unit/calendar.test.ts` | reviewDay rest 케이스의 `accessories.length === 2` | 삭제 |

**신규 (Phase 3 FR-12 커밋 안에)**
- `tests/unit/schedule.test.ts` 또는 `tests/unit/program.test.ts`: "빅6 매핑에 없는 라벨(악력 운동
  등)이 결과 어디에도 나타나지 않는다" — planDay / describeProgram / planOn / reviewDay 각각.

**예상 이관 후 테스트 수**: 474 → 대략 465±5 (FR-12 반영). 정확한 수치와 사유는 Phase 3 완료
시점 CHANGELOG 에 명시.

### Phase 3 (FR-13) 에서 신규되는 테스트

`tests/unit/steps.test.ts` (신규 파일):
- FR-13.2 범위 검증: 1, 10, 5 는 성공. 0 · 11 · 3.5 · NaN 은 예외.
- FR-13.2 잠긴 종목 거부: 빅4 미달 상태에서 브리지·hspu 세팅 시도 → 예외.
- FR-13.3 유지 횟수 리셋:
  - 사전 승급 + 유지 2회를 쌓은 상태에서 `setStep` 호출 → `maintenanceCount === 0`.
  - 조정 이후 새 승급 + 유지 3회 → 카운트 3, `proposeSwitch` 가 제안 생성.
- FR-13.4 `history` 불변: `setStep` 후 `state.history` 는 원본과 정확히 동일 (배열 참조 무관, 값
  동일).
- FR-13.5 해금 규칙 유지: 조정으로도 잠긴 종목의 잠금이 풀리지 않는다.
- FR-13.6 무리한 상향 허용: 4단계에서 10단계로 세팅 성공. 그 후 abandon → 다지기 경로가 정상 동작.
- **`AppState` 전 필드 보존**: `setStep` 후 `history` / `stints` / `proposals` 참조·값 동일.

`tests/unit/proposal.test.ts` 확장:
- `effectiveFloorIndex(history, id, floorDate, adjustmentAnchor)` 계약: anchor 가 setback 보다 크면
  anchor 가 이긴다.
- `advanceProposals` 가 `state.adjustedAtSessionIndex` 를 자동으로 반영한다.
- **`setStep` 후 `applySession` → `abandonChallenge` → `recordSession` 전 흐름에서
  `adjustedAtSessionIndex` 가 보존된다** (C-2 재발 방지).

### Phase 3 (FR-15) 에서의 변경

주석과 문서 수정만이라 테스트에 영향 없음. 다만 `docs/PROGRESSIONS.md` / `README.md` / `CHANGELOG.md`
에 관련 문구가 있다면 함께 정정한다 (FR-15.1 / L-5 은 이미 정리됨).

### Phase 4 (UI) 에서의 신규 테스트 (NFR-13, NFR-14)

**커버리지 목표**: UI 신규 코드 ≥ 70%. 도메인은 이관 전 수준(line 100%) 유지.

`tests/unit/storage.test.ts` — FR-1, EC-1~5
- 빈 저장 → `empty`
- 정상 라운드트립 → `ok`
- JSON 파싱 실패 → `corrupt` + 원본 보존
- 필수 필드 누락 → `corrupt`
- 미래 버전 → `future-version` + 덮어쓰지 않음
- 저장 실패 (`Storage.setItem` throw) → 에러 노출, 앱 상태 유지

`tests/unit/inprogress.test.ts` — FR-2, EC-7 / EC-7a
- 세트 값 push 마다 저장이 호출된다
- 복원 후 startedAt 이 유지된다
- 완료 시 RPE 는 세트 RPE 중 최댓값이 넘어간다 (FR-6.7a)
- 시작 날짜가 오늘이 아니면 그 사실을 노출하는 헬퍼 함수가 존재한다 (FR-2.9 근거)

`tests/unit/today.test.ts` — FR-4
- 자정 이전·이후 IsoDate 산출이 로컬 자정 기준이다
- 여러 타임존 환경에서도 `getFullYear/Month/Date` 조합이 동일한 로컬 규칙을 따른다 (모의)

`tests/unit/boot.test.ts` — FR-3
- 부팅 순서 (readAppState → today → advanceProposals → planOn) 가 지켜진다 (모의로 호출 순서 검증)
- 상태 변경 시 저장이 정확히 1회 호출된다 (FR-3.4)
- `agenda.kind === 'no-program'` 이면 라우팅 힌트 필드가 켜진다 (테스트 대상: BootResult 자체가
  아니라, layout 이 이 값을 기반으로 분기하는지 검증하는 최소 케이스 — 컴포넌트 마운트 대신 함수
  단위)

`tests/unit/timer.test.ts` — FR-6.12~6.17, EC-30
- 준비 5초 카운트다운 후 카운트업이 시작된다 (fake timers)
- 목표 시간 도달 시 `notify` 호출, 정확히 5초만 반복
- 정지 전까지 계속 흐른다
- 시작 시각(`Date.now()`) 기반으로 경과 시간을 계산한다 (틱 카운트 아님 — EC-30)

`tests/unit/notify.test.ts` — FR-6.14, EC-24
- 소리·진동·화면 점멸 3수단이 각각 시도된다
- 한 수단 실패해도 나머지가 전달된다

**컴포넌트 마운트 테스트는 하지 않는다** (NFR-14). 이번 범위의 UI 상호작용은 스토어·훅 함수 단위로
검증한다. Playwright / vitest-browser 같은 도구를 도입하지 않는다.

### Phase 5 (배포) 에서의 신규 테스트

`tests/deploy/` — cube-study `tests/deploy/` 준용. 홈서버·ssh·네트워크 없이 검증:
- `test-resolve-commit.sh` — annotated 태그에서 커밋 SHA 를 정확히 뽑는가 (cube-study v0.1.0 함정)
- `test-git-sync.sh` — 옮겨간 태그를 서버가 따라가는가 (cube-study v0.2.0 함정)
- `test-release-guards.sh` — CHANGELOG 항목 부재·main 아님·워킹트리 지저분·이미 있는 태그를 거른다

### 승계된 5항 동작 보존 사양

0.1.0 GLOBAL.md 의 「동작 보존 사양 5항목」은 Phase 2 완료 시점(474개 통과)에 자동 유지된다. Phase 3
FR-12 는 accessories 판정을 다루지 않으므로 5항목에 영향 없음. Phase 3 FR-13 은 승급·유지 판정에
개입하되 앵커가 없으면 기존 동작을 그대로 유지한다 (`adjustmentAnchor ?? 0`).

---

## Edge Case ↔ Phase 매핑 (24 / 24)

| EC | 상황 | Phase | 위치 |
|---|---|---|---|
| EC-1 | JSON 파싱 실패 | 4 | `tests/unit/storage.test.ts` |
| EC-2 | 필드 누락·타입 불일치 | 4 | `tests/unit/storage.test.ts` |
| EC-3 | 미래 버전 | 4 | `tests/unit/storage.test.ts` |
| EC-4 | 쓰기 실패 | 4 | `tests/unit/storage.test.ts` |
| EC-5 | 읽기 실패 (사생활 모드) | 4 | `tests/unit/storage.test.ts` |
| EC-6 | 자정 넘김 (세션 없음) | 4 | `tests/unit/today.test.ts` |
| EC-7 | 자정 넘김 (세션 있음) | 4 | `tests/unit/inprogress.test.ts` |
| EC-7a | 어제 시작 세션 복원 | 4 | `tests/unit/inprogress.test.ts` |
| EC-8 | 여러 탭 동시 사용 | 4 | (테스트 없음 — 정책이 "감지하지 않는다") · GLOBAL 에서 명시 |
| EC-9 | 미선택 부팅 | 4 | `tests/unit/boot.test.ts` |
| EC-10 | 선택일이 휴식일 | (도메인 승계) | 기존 `program.test.ts` EC-2 |
| EC-11 | 오늘이 휴식일 | 4 (UI 검증) | 라우팅 분기 (컴포넌트 스모크 없음, DayAgenda.rest 로 분기하는 로직만 함수 단위) |
| EC-12 | 1단계에서 '불가능' | (도메인 승계) | 기존 `session.test.ts` EC-9 |
| EC-13 | 잠긴 종목 | (도메인 승계) | 기존 · `steps.test.ts` (FR-13.2 조정 거부) |
| EC-14 | seconds 단계 입력 | 4 | `tests/unit/timer.test.ts` |
| EC-15 | perSide 단계 | (도메인 승계) — sideNote 는 도메인이 준다 | 기존 |
| EC-16 | 같은 종목 두 번 | (도메인 승계) | 기존 `session.test.ts` EC-4 |
| EC-17 | 세션 도중 종료·재실행 | 4 | `tests/unit/inprogress.test.ts` |
| EC-18 | 미결 제안 상태에서 수동 전환 | (도메인 승계) | 기존 `proposal.test.ts` W-3 |
| EC-19 | 부팅마다 여러 번 호출 | 4 | `tests/unit/boot.test.ts` |
| EC-20 | 이관 커밋에서 도메인 테스트 깨짐 | 1·2 (프로세스) | Phase 1·2 완료 검사 |
| EC-21 | svelte-check 신규 오류 | 2 | Phase 2 완료 검사 |
| EC-22 | 앱 번들에 `node:fs` | 2 | `pnpm build` 이후 산출 grep (Phase 2 검증) |
| EC-23 | 100회 이상 세트 | 4 | 입력 컴포넌트 상한 없음이 코드에서 확인 (단위 테스트 없이 SPEC 준수) |
| EC-24 | 소리·진동 막힘 | 4 | `tests/unit/notify.test.ts` |
| EC-25 | 세트마다 다른 RPE | 4 | `tests/unit/inprogress.test.ts` (완료 시 최댓값 확인) |
| EC-26 | 조정 직후 전환 제안 | 3 | `tests/unit/steps.test.ts` |
| EC-27 | 잠긴 종목 조정 시도 | 3 | `tests/unit/steps.test.ts` |
| EC-28 | 목표 시간 초과 지속 | 4 | `tests/unit/timer.test.ts` |
| EC-29 | 목표 시간 전 정지 | 4 | `tests/unit/timer.test.ts` |
| EC-30 | 타이머 켠 채 화면 이탈 | 4 | `tests/unit/timer.test.ts` |

---

## Risk Mitigation

### Risk 1: Phase 1 커밋이 rename 으로 인식되지 않아 diff 가 폭발
**Impact**: High (리뷰 불가, "이동만" 이 성립하지 않음)
**Mitigation**:
- Phase 1 은 `git mv` 로 실행하고, 내용을 한 바이트도 바꾸지 않는다. import 경로도 이 커밋에서
  건드리지 않는다 — 옮긴 파일 안의 상대 경로는 옛 위치를 가리키게 된 상태로 커밋한다 (그래야
  다음 커밋의 diff 가 "import 경로 갱신" 만으로 남는다).
- 커밋 직후 `git log --stat -M -C -1` 으로 rename 인식을 확인한다.
- Phase 2 첫 커밋에서 import 경로를 새 위치로 일괄 갱신한다.

### Risk 2: `node:test` / `node:assert` 이관에서 API 불일치
**Impact**: Medium
**Mitigation**:
- `node:test` 의 `describe`/`it`/`test`/`beforeEach`/`afterEach` 는 vitest 에서 동일 이름·시그니처로
  동작한다.
- `assert` 를 `vitest` 의 `expect` 로 재작성하지 않는다 — `import assert from 'node:assert/strict'`
  를 그대로 유지하면 이관 diff 가 최소화된다. 스타일 변경은 이관과 섞지 않는다 (FR-0.8).
- `t.diagnostic()` 등 vitest 에 없는 API 사용을 grep 으로 사전 확인 (없음을 이미 확인).

### Risk 3: `svelte-check` 가 도메인 코드에서 새 오류를 뿜는다
**Impact**: Medium (EC-21 이 예상되는 상황이라고 명시)
**Mitigation**:
- 이관 커밋(Phase 2 툴체인)에서는 **타입 표기만** 고친다. 동작 변경이 필요하면 별도 커밋으로
  분리한다 (EC-21).
- `applySession` 이 `stints` / `proposals` / `adjustedAtSessionIndex` 를 모두 스프레드로
  전파한다는 것을 컴파일러가 검사하도록, `AppState` 를 `readonly` 로 두지 않고 필드 하나도
  빠짐없이 반환값의 리터럴에 등장하는지 확인한다 (C-2 재발 방지, ADR-10).

### Risk 4: `loadCatalog` 격리 실패로 앱 번들에 `node:fs` 가 딸려 들어감 (EC-22)
**Impact**: High (빌드 실패 또는 런타임 크래시)
**Mitigation**:
- Phase 2 에서 `src/lib/domain/catalog.ts` 의 `loadCatalog` 함수를 **삭제**한다 (`fromJSON` 만 남긴다).
  기존 사용처 3곳:
  - `src/lib/domain/index.ts` 재export — Phase 2 에서 export 목록에서 제거
  - `test/helpers.ts` (→ `tests/unit/helpers.ts`) — 새 로더 사용
  - `test/tz-probe.ts` — 삭제 또는 `tools/` 로 이동
- 새 로더 `src/lib/data/catalog.ts` 는 `import raw from './progressions.json'` 을 쓴다. vite 가
  static import 로 인식해 번들 자체에 데이터를 심는다.
- Phase 2 완료 시점에 `pnpm build` 산출물에 `node:fs` 문자열이 있는지 grep 으로 확인.

### Risk 5: FR-13.3 앵커가 세션 기록에서 소실 (C-2 유형 재발)
**Impact**: High (조정 앵커가 사라지면 조정 전 세션이 다시 세어져 잘못된 전환 제안이 뜬다)
**Mitigation**:
- ADR-10 에 따라 신규 필드 `adjustedAtSessionIndex` 는 optional 이지만, `applySession` /
  `abandonChallenge` / `recordSession` / `recordConsolidation` / `selectProgram` / `switchProgram`
  / `acceptProposal` 이 전부 `{ ...state, ...변경 }` 스프레드로 상태를 반환하는지 Phase 3B 코드
  리뷰에 명시 항목으로 둔다.
- Phase 3B 테스트에 "각 전이 함수 뒤 `adjustedAtSessionIndex` 가 원본과 값·구조 동일" 을 필수로
  둔다 (474개 통과 이관 시점의 C-2 케이스에 대응하는 새 필드 버전).
- `svelte-check` 로 `AppState` 반환 시 필드 누락이 컴파일 시점에 잡히도록 명시적 타입 표기를 유지한다.

### Risk 6: `todayClock` 자정 재계산이 브라우저 절전·백그라운드 탭에서 지연
**Impact**: Medium (EC-6 자정 넘김을 UI 가 반영하지 못함)
**Mitigation**:
- `setTimeout` 만으로는 브라우저가 백그라운드에서 timer 를 느슨하게 잡는다. `visibilitychange`
  이벤트에서 `today = computeIso()` 를 재계산해 화면 복귀 시 즉시 반영.
- 이 방어는 `tests/unit/today.test.ts` 에는 잡히지 않는 통합 사안이므로 코드 리뷰 항목으로 둔다.

### Risk 7: 프리캐시 목록의 404 로 오프라인 붕괴 (cube-study 배포 실전 사례)
**Impact**: High (nginx 캐시 정책 잘못이거나 서비스워커 매니페스트에 존재하지 않는 파일이 들어가면
Workbox 가 설치를 롤백 → 오프라인 죽음, 화면은 멀쩡)
**Mitigation**:
- Phase 5 `deploy.sh` 가 배포 직후 프리캐시 전수 대조를 실행한다 (cube-study 준용).
- Phase 5 `site-check.yml` 이 매일 인증서·프리캐시·기본 응답을 점검한다.
- Phase 5 nginx vhost 의 `location = /sw.js` 는 `no-store` 로, `/manifest.webmanifest` 는 `no-cache`
  로, `/_app/immutable/` 는 1년+immutable 로 배치 (이미 `deploy/nginx/bigsix.conf` 에 반영됨).

### Risk 8: 홈서버 인증서 조용한 만료 (cube-study 6개월 사례)
**Impact**: High
**Mitigation**:
- Phase 5 `site-check.yml` 이 매일 인증서 만료일을 확인하고 `MIN_CERT_DAYS < 14` 면 GitHub
  Actions 실패로 알림.
- 홈서버 구성은 이미 완료됨 (사용자 확인). 이번 작업 범위는 워크플로 파일만 추가.

### Risk 9: 태그 SHA vs 커밋 SHA 어긋남 (cube-study v0.1.0 사례)
**Impact**: Medium (배포는 성공했는데 검증이 실패로 판정)
**Mitigation**:
- `deploy/lib.sh` 의 `resolve_commit` 을 cube-study 그대로 이식 (`git rev-parse --verify --quiet
  "$1^{commit}"`).
- `tests/deploy/test-resolve-commit.sh` 로 검증.

### Risk 10: 옮겨간 태그를 서버가 따라가지 못함 (cube-study v0.2.0 사례)
**Impact**: Medium (롤백 후 재배포 시 옛 커밋이 배포됨)
**Mitigation**:
- `deploy/remote.sh` 의 `git fetch --all --prune --tags --force -q` 옵션을 cube-study 그대로 이식.
- `tests/deploy/test-git-sync.sh` 로 검증.

---

## Completion Criteria

전체 기능은 다음이 모두 참일 때 완료된다.

- [ ] Phase 1 ~ 5 전부 완료
- [ ] FR-0 ~ FR-15 전 항목 충족
- [ ] NFR-1 (사실 표시) — 화면과 반환 문자열에 백분율·격려·게이미피케이션 표현 없음
- [ ] NFR-3 — `src/lib/domain/` 안에 프레임워크·브라우저·Node API import 0회 (grep 확인)
- [ ] NFR-4 — 의존성 방향 단방향 (UI → 도메인). 역방향 import 0
- [ ] NFR-5a — `src/lib/domain/` 안에 `new Date()` / `Date.now()` 검색 결과 0건
- [ ] NFR-12 — 테스트 러너는 vitest 하나. `package.json` 스크립트에 `node --test` 없음
- [ ] NFR-13 — UI 신규 코드 커버리지 ≥ 70%, 도메인 커버리지 line 100% 유지
- [ ] NFR-16 — 이관된 도메인 테스트 (FR-12 조정 후) 전부 통과
- [ ] NFR-17 — `svelte-check` 오류 0 · 경고 0
- [ ] EC-1 ~ EC-30 이 각각 매핑된 테스트 케이스 또는 정책 문서로 존재 (위 매핑 표)
- [ ] Phase 5 `deploy.sh feature/ui` 로 홈서버에 임시 배포 성공
- [ ] Phase 5 배포 검증 (프리캐시 전수 · 기본 응답 · 커밋 SHA 대조) 통과
- [ ] PR 은 열어 두고 **병합하지 않는다** (사용자 결정)

---

## SPEC 과의 불일치

SPEC 을 읽고 설계하는 과정에서 발견한 것들이다. **임의 해결하지 않고 여기 남긴다.** 사용자 판단이
필요하다.

### 1. FR-11.4 (PWA 에셋 생성) 의 커밋 소속

**상황**
FR-11.4 는 「FR-11: PWA」 절에 있고, UI 구현 커밋의 일부로 읽힌다. 그런데 SPEC Notes 「커밋 분리
지침」(5) 가 "PWA 에셋 (FR-11.4 / FR-14)" 을 배포 커밋에 명시적으로 배정한다.

**본 설계의 해석**
Notes 커밋 지침이 더 구체적이므로 그것을 따른다. FR-11.1~11.3, FR-11.5 (manifest, service worker
등록, adapter-static, `lang: ko`)는 Phase 4 에서, **아이콘 PNG 파일 3장은 Phase 5 에서** 생성·커밋.

**필요한 결정**
이 배치로 사용자 의도가 맞는지 확인. 아니라면 Phase 4 로 아이콘도 앞당긴다 (Phase 4 완료 시점의
`pnpm build` 산출물이 실제 아이콘을 심을 수 있게 된다).

### 2. FR-0.5 "474개 전부 통과" 의 검증 시점

**상황**
FR-0.5 는 "이관 과정에서 삭제·스킵되는 케이스가 없어야 하며, 이관 후에도 전부 통과" 를 요구.
"이관 후" 가 Phase 1 끝인지 Phase 2 끝인지 명시하지 않았다.

**본 설계의 해석**
Phase 1 이 순수 이동이라 그 커밋 시점에는 vitest 도 svelte-check 도 아직 없다 — 테스트가 실행되지
않는다. FR-0.5 의 "이관 후" 는 **툴체인이 갖춰진 뒤**, 즉 Phase 2 끝을 뜻하는 것으로 해석한다.
EC-20 이 "이관 커밋" 을 단수로 부르지만 커밋 분리 지침이 (1) 과 (2) 를 명시적으로 나눈 상황이라
"이관" 은 (1)+(2) 두 커밋의 논리 단위를 가리키는 것으로 본다.

**필요한 결정**
이 해석이 사용자 의도와 맞는지 확인. 다르다면 Phase 1 안에 최소한의 vitest·경로 갱신을 함께
넣어야 한다 (하지만 그러면 rename 인식이 깨진다 — 그래서 이 해석을 채택했다).

### 3. FR-0.4 vitest 이관에서 단언 API 유지 여부

**상황**
FR-0.4 는 "단언 API 가 거의 같으므로 **기계적 이관**" 이라고만 명시. `node:assert` 를 그대로 유지할지
`expect` 로 재작성할지 정하지 않았다.

**본 설계의 해석**
`node:assert/strict` 를 그대로 유지한다. vitest 는 `node:assert` 를 문제없이 실행하며, `expect` 로
재작성하면 이관 diff 가 폭발하고 FR-0.8 ("이동은 이동만 한다") 을 위반한다. 스타일 통일이 필요하면
Phase 3 이후 별도 리팩터링 작업으로 다룰 수 있다.

### 4. FR-13.3 불변식의 저장 위치가 `AppState` 인지 UI 인지

**상황**
FR-13.3 은 불변식만 명시하고 저장 위치를 지정하지 않는다 — "구현 수단을 설계 단계에서 정한다" 로
명시적으로 위임.

**본 설계의 결정 (ADR-10)**
`AppState.adjustedAtSessionIndex` 로 도메인 상태에 둔다. 승급·유지 판정이 도메인 관심사이므로
UI 로 밀면 도메인이 다시 UI 를 참조해야 한다 (NFR-4 위반). 이 판단이 사용자 의도와 맞는지 확인이
필요하다. 대안(옵션 2/3/4)의 폐기 근거는 ADR-10 에 있다.

### 5. Playwright / e2e 테스트를 이번 범위에 포함할지

**상황**
SPEC 은 vitest 단위 테스트만 요구 (NFR-13, NFR-14). 그러나 cube-study 참조 구현은 Playwright 로
e2e 를 갖고 있고, `deploy.sh` 가 검증하는 프리캐시·SW 흐름은 실제로 브라우저 테스트가 필요한 영역이
있다.

**본 설계의 해석**
Playwright 도입은 이번 범위 밖으로 둔다. NFR-14 가 "화면 없이 단위 테스트 가능해야 한다" 고 명시했고,
컴포넌트 마운트 테스트를 요구하지 않는다. 배포 검증(프리캐시 200, 인증서 만료)은 `deploy.sh` +
`site-check.yml` 로 커버.

**필요한 결정**
UI 회귀를 자동으로 잡고 싶으면 별도 작업 (Playwright + `test:e2e` + CI 확장) 을 열어야 한다.

---

## Next Steps

1. Phase 1 — 파일 이동만 (git rename)
2. Phase 2 — 툴체인 (SvelteKit + vitest + svelte-check + `loadCatalog` 격리). **474 테스트 통과가
   이 시점에 요구된다**
3. Phase 3 — 도메인 변경. 커밋 3개 (FR-12 → FR-13 → FR-15). 테스트 수가 줄어들 것 (변경 사유 보고)
4. Phase 4 — UI 구현. 저장·부팅·화면 3개·타이머·PWA 골격
5. Phase 5 — 배포. `deploy/` + CI + PWA 아이콘 + **`deploy.sh feature/ui` 로 임시 배포**. PR 은 열되
   병합하지 않는다

---

## 불일치 5건에 대한 합의 (2026-09-04, 오케스트레이터 판단)

사용자가 부재중이라 사전 합의 규칙("SPEC 을 SOT 로, designer/validator 의 합의를 구해
진행하고 합의 내용을 최종 보고에 남긴다")에 따라 처리한다. **전부 Designer 안을 수용**한다.
근거를 남기니 이견이 있으면 뒤집으면 된다.

| # | 항목 | 판단 | 근거 |
|---|---|---|---|
| 1 | PWA 아이콘을 Phase 5 에 배치 | 수용 | SPEC Notes 커밋 지침 (5)가 명시적으로 배포 커밋에 배정했다. 사이트가 실제로 뜨는 것은 Phase 5 뒤라 Phase 4 산출물에 아이콘이 없어도 손해가 없다 |
| 2 | FR-0.5 "474개 통과" = Phase 2 끝 | 수용 | Phase 1 은 러너가 없어 테스트가 실행 자체를 못 한다. Phase 1 에 툴체인을 끌어들이면 rename 인식이 깨져 FR-0.8 의 목적(리뷰 가능성)이 무너진다 |
| 3 | `node:assert` 유지 | 수용 | `expect` 재작성은 이관 diff 를 폭발시킨다. FR-0.4 가 "기계적 이관" 이라 못 박은 것과 정면으로 맞는다 |
| 4 | FR-13.3 을 `AppState` 필드로 | 수용 | 승급·유지 판정은 도메인 관심사다. UI 에 두면 도메인이 UI 를 되참조해야 해서 NFR-4 를 깬다. 다만 **저장 스키마가 바뀌므로** FR-1 의 `schemaVersion` 을 올리고, 이전 스키마에 이 필드가 없을 때의 기본값(= 앵커 없음)을 Phase 3B 가 테스트로 고정한다 |
| 5 | Playwright/e2e 범위 밖 | 수용 | NFR-14 가 단위 테스트만 요구한다. 배포 검증은 `deploy.sh` 의 프리캐시 전수 대조 + `site-check.yml` 이 덮는다. 0.2.0 이 뜬 뒤 필요가 확인되면 별도 작업으로 넣는다 |

4번에 딸린 조건 하나를 추가한다. **`schemaVersion` 을 올리는 것은 Phase 3B 의 일이 아니라
Phase 4 저장 계층의 일이다.** Phase 3B 는 도메인 타입만 바꾸고, 그 타입을 직렬화하는 쪽이
버전을 책임진다. 두 페이즈의 경계에 이 항목이 끼지 않게 PHASE_4_PLAN 에서 확인할 것.
