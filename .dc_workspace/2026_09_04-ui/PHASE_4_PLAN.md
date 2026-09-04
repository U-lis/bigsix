# Phase 4: UI 구현 (저장 · 부팅 · 화면 3개 · 타이머 · PWA 골격)

**목적**: 도메인 위에 실제 화면과 저장 계층을 얹는다. **계산 로직은 새로 만들지 않는다** — 도메인
함수를 호출할 뿐이다 (NFR-5).

**SPEC 커밋 경계**: (4) UI 구현 (Notes 「커밋 분리 지침」)
**커밋 수**: 4~6 (아래 세부 커밋 목록)
**병렬**: 없음 (화면 3개가 공통 store 를 소비 — GLOBAL ADR-14)
**Dependencies**: Phase 3

---

## 커밋 순서 (권장)

1. **인프라** — 저장 계층 · 부팅 시퀀스 · `todayClock` · 카탈로그 로더 로직 정합성 · AppState 스토어
2. **진행 중 세션 · 타이머 · 알림**
3. **화면 1 (오늘 세션 + 세트 입력)**
4. **화면 2 (프로그램 선택)** + **화면 3 (단계 현황 + 첫 실행)**
5. **PWA 골격** — manifest, service worker 등록, adapter-static 확정, 저장 실패 배너, 레이아웃 네비

각 커밋 단위에서 `pnpm test` · `pnpm run check` 통과 유지.

---

## 완료 정의 (Phase 전체)

### FR-1 저장 계층
- [ ] `src/lib/ui/storage.ts` 신규. `readAppState` / `writeAppState` / `clearAppState` /
      `readInProgress` / `writeInProgress` / `clearInProgress`
- [ ] `AppStateEnvelope`, `InProgressEnvelope` 스키마. `schemaVersion: 1`
- [ ] 봉투 안에 버전 필드, `AppState` 는 오염되지 않는다 (FR-1.2, FR-1.9)
- [ ] 손상 감지 시 원본 보존, 화면이 "초기 상태로 시작" 을 사용자에게 요구 (FR-1.7, EC-1, EC-2)
- [ ] 미래 버전 만나면 덮어쓰지 않는다 (FR-1.5, EC-3)
- [ ] 저장 실패 감지 → 화면 배너 (FR-1.8, EC-4)
- [ ] 진행 중 세션은 별도 키 (FR-2.6)

### FR-2 진행 중 세션
- [ ] `src/lib/ui/session.svelte.ts` — `InProgressSession` 스키마, `inProgressStore` 클래스
- [ ] 세트 입력마다 저장 (FR-2.3, D-3)
- [ ] 부팅 시 복원 (FR-2.4)
- [ ] 완료 시 `recordSession` / `recordConsolidation` 호출 후 진행 중 데이터 제거 (FR-2.5)
- [ ] 시작 날짜 유지 (FR-2.8, D-7, EC-7)
- [ ] 시작 날짜가 오늘이 아닐 때 화면 표시 (FR-2.9, EC-7a)
- [ ] 세션 봉투도 `schemaVersion: 1`

### FR-3 부팅 시퀀스
- [ ] `src/lib/ui/boot.ts` — `boot(): BootResult`
- [ ] 순서: readAppState → today → advanceProposals → planOn → inProgress (FR-3.1)
- [ ] `advanceProposals` 부팅당 1회 (FR-3.2, EC-19)
- [ ] `{ kind: 'no-program' }` → 프로그램 선택 화면으로 (FR-3.3)
- [ ] 상태 변경 시 저장 (FR-3.4)
- [ ] 첫 실행 시 시작 단계 선택 화면 (FR-3.5) — `setStep` API 재사용 (FR-3.6)
- [ ] 잠긴 종목은 첫 실행에서도 조정 불가 (FR-3.7)

### FR-4 날짜
- [ ] `src/lib/ui/today.svelte.ts` — `todayClock.today: $state<IsoDate>`
- [ ] 로컬 자정 기준 (FR-4.2)
- [ ] `IsoDate` 문자열만 도메인에 넘김 (FR-4.3)
- [ ] 컴포넌트 안에 `new Date()` 0회 (FR-4.4) — grep 검증
- [ ] 자정 넘김 시 재계산 (EC-6) — `setTimeout` + `visibilitychange`

### FR-5 화면 1 오늘 세션
- [ ] `src/routes/+page.svelte`
- [ ] `DayAgenda` 그대로 표시. `reason` / `sideNote` 가공 없이 노출 (FR-5.3, NFR-2)
- [ ] `rest === true` 인 날 표시 (FR-5.4)
- [ ] `locked` 종목 잠김 사유 표시 (FR-5.5)
- [ ] 보조 운동 표시하지 않는다 (FR-5.6) — 자동, 도메인 필드가 이미 없다 (Phase 3 FR-12)
- [ ] `proposal !== null` 이면 승인/거절 UI (FR-5.7) — `acceptProposal` / `declineProposal` 호출
- [ ] `paired` 동반 단계도 함께 표시 (FR-5.8)

### FR-6 세트 입력
- [ ] 세트 입력마다 진행 중 세션 저장 (FR-6.1)
- [ ] `unit: 'reps'` — `<input type="number" inputmode="numeric">`, 초기값 = 목표 (FR-6.2, 6.2a)
- [ ] 음수 · 비정수 거부. 상한 없음 (FR-6.2b, EC-23)
- [ ] `unit: 'seconds'` — 타이머 UI (FR-6.3, FR-6.12~6.17)
- [ ] `perSide` — 값 하나만 입력, `sideNote` 반드시 표시 (FR-6.4, 6.5, EC-15)
- [ ] `mode: 'max'` vs `'fixed'` 구분 표시 (FR-6.6). `max` 는 하한임을 명시 (FR-15.2)
- [ ] RPE 세트마다 선택 입력 (FR-6.7)
- [ ] 세션 완료 시 세트 RPE 중 최댓값을 세션 RPE 로 (FR-6.7a). 하나도 없으면 필드 자체 없음
- [ ] 세트별 RPE 는 진행 중 세션에 보존, 완료 후 소실 (FR-6.7b, L-8)
- [ ] '불가능' 버튼 (FR-6.8) — `abandonChallenge` 호출
- [ ] `canConsolidate === true` 확인 → 다지기 승인 (FR-6.9)
- [ ] `canConsolidate === false` (1단계) → 현 단계 유지 표시 (FR-6.10, EC-12)
- [ ] 같은 종목 두 번 기록 허용 (FR-6.11, EC-16)

### FR-6.12~6.17 타이머
- [ ] `src/lib/ui/timer.svelte.ts` — 카운트업 클래스
- [ ] 준비 5초 카운트다운 후 카운트업 시작 (FR-6.12)
- [ ] 목표 시간 지나도 계속 흐름 (FR-6.13)
- [ ] 목표 도달 시 5초간 알림 (`notify.alert()`) 후 자동 조용 (FR-6.14, EC-28)
- [ ] 정지 버튼 전까지 계속 흐름 (FR-6.15)
- [ ] 정지 시각 == 그 세트 기록 (FR-6.16, EC-29)
- [ ] 수정 수단 제공 (FR-6.17)
- [ ] `Date.now()` 기준 계산, 틱 카운트 아님 (EC-30)

### FR-6.14 알림
- [ ] `src/lib/ui/notify.ts` — 소리 · 진동 · 화면 점멸 3수단 동시 시도
- [ ] 하나라도 살아 있으면 통과 (EC-24)

### FR-7 화면 2 프로그램 선택
- [ ] `src/routes/programs/+page.svelte`
- [ ] `describePrograms(catalog)` 5종 표시 (FR-7.1)
- [ ] 각 프로그램의 name/frequency/trainingDays/restDays/progressionIds/note 표시. 보조 운동 표시 안함 (FR-7.2 / D-17)
- [ ] 미선택이면 `selectProgram`, 진행 중이면 `switchProgram` (FR-7.3, 7.4)
- [ ] 오늘 날짜 주입. 휴식일이면 "다음 첫 운동일이 1일차" 안내 (FR-7.5, EC-10)
- [ ] 현재 프로그램 구별 표시 (FR-7.6)
- [ ] 전환은 steps / history 를 바꾸지 않음 안내 (FR-7.7) — 확인 단계
- [ ] 전환 직후 저장 + 오늘 세션 화면으로 (FR-7.8)

### FR-8 화면 3 단계 현황
- [ ] `src/routes/steps/+page.svelte`
- [ ] 빅6 각 종목 현재 단계 + stepName 표시 (FR-8.1)
- [ ] 잠긴 종목 `unlockedProgressions` / `checkGate` 로 잠금 사유와 함께 표시 (FR-8.2)
- [ ] 현재 단계의 기준 수치(초/중/상) 표시 (FR-8.3)
- [ ] 단위 (`reps`/`seconds`), `perSide` 표시 (FR-8.4)
- [ ] 종목별 수동 조정 UI (FR-8.5) — `setStep` 호출
- [ ] 되돌릴 수 없음 + FR-13.3 리셋 안내 확인 단계 (FR-8.6, NFR-10)
- [ ] 잠긴 종목 조정 불가 (FR-8.7, EC-27) — 도메인이 이미 예외를 던진다

### FR-3.5 첫 실행 화면
- [ ] 부팅 시 저장 데이터 전무하면 시작 단계 선택 화면 (FR-3.5)
- [ ] 기본값 = 전 종목 2단계 (그대로 넘기면 `initialState()` 와 동일)
- [ ] `setStep` API 사용 (FR-3.6)
- [ ] 잠긴 종목은 조정 불가 (FR-3.7)

### FR-9 화면 간 이동
- [ ] `src/routes/+layout.svelte` 하단 네비 3탭 (FR-9.1) — cube-study 스타일
- [ ] 미선택이면 프로그램 선택 화면이 진입점 (FR-9.2)
- [ ] 진행 중 세션이 화면 이동으로 사라지지 않음 (FR-9.3) — 스토어 소유이므로 자동

### FR-10 카탈로그 적재
- [ ] `src/lib/data/catalog.ts` 의 `loadCatalog()` 단일 사용 (Phase 2 에서 완비됨)
- [ ] 컴포넌트가 각자 JSON import 하지 않는다 (FR-10.2) — grep 검증
- [ ] localStorage 에 저장하지 않는다 (FR-10.3) — storage.ts 는 AppState / InProgress 만
- [ ] 테스트도 같은 로더 (FR-10.4) — Phase 2 에서 완비

### FR-11.1~11.3, 11.5 PWA 골격
- [ ] `vite.config.ts` 에 `SvelteKitPWA` 플러그인 확장 (manifest, workbox globPatterns)
- [ ] manifest — `name: 'bigsix'`, `short_name: 'bigsix'`, `lang: 'ko'`, `display: 'standalone'`,
      `start_url: '/'`, background/theme color 임시값 (아이콘은 Phase 5)
- [ ] `+layout.svelte` 에서 service worker 등록 (cube-study 참조)
- [ ] `registerType: 'autoUpdate'`, `skipWaiting` + `clientsClaim`
- [ ] `navigateFallback: '/'`
- [ ] `ignoreURLParametersMatching: [/.*/]` (cube-study 함정 대비)
- [ ] `adapter-static` `strict: true` 로 정적 빌드 성공 (FR-11.2)
- [ ] 서비스 워커가 앱 셸 + 카탈로그 캐시. 오프라인 동작 (FR-11.3, NFR-6)

### 표시 원칙 (NFR-1, NFR-2)
- [ ] 화면 어디에도 백분율 · 격려 · 게이미피케이션 표현 없음 (NFR-1)
- [ ] 도메인 `reason` / `sideNote` / 잠금 사유는 그대로 노출 (NFR-2)

### 접근성 (NFR-8~11)
- [ ] 주요 터치 타깃 44×44 CSS px 이상 (NFR-8)
- [ ] 정밀 조작 불필요 (NFR-9)
- [ ] '불가능' / 프로그램 전환 / 초기화 확인 단계 (NFR-10)
- [ ] 360px 폭에서 가로 스크롤 없음 (NFR-11)

### 테스트 (NFR-13~15)
- [ ] UI 신규 코드 커버리지 ≥ 70%
- [ ] 도메인 커버리지 line 100% 유지
- [ ] 저장 · 부팅 · 진행 중 세션 · 날짜 · 타이머는 컴포넌트 마운트 없이 단위 테스트 (NFR-14)
- [ ] EC-1~EC-30 이 각각 테스트 케이스 또는 명시 정책으로 존재 (NFR-15)

### 성능 (NFR-18)
- [ ] `advanceProposals` / `planOn` 은 부팅 계산 1회만. 매 렌더 재계산 금지 — `$state` 로 결과를
      보관하고 이벤트 시에만 재계산

---

## 커밋 1: 인프라

**파일**:
- `src/lib/ui/storage.ts` (신규)
- `src/lib/ui/state.svelte.ts` (신규) — AppState 룬 스토어. 세팅자마다 `writeAppState` 트리거
- `src/lib/ui/today.svelte.ts` (신규) — GLOBAL ADR-12 코드
- `src/lib/ui/boot.ts` (신규) — GLOBAL ADR-13 코드

**테스트**:
- `tests/unit/storage.test.ts` (신규) — EC-1~5 커버
- `tests/unit/today.test.ts` (신규) — 로컬 자정 산출
- `tests/unit/boot.test.ts` (신규) — 순서 · 저장 트리거 · no-program 분기

**요점**:
- `storage.ts` 의 read 는 try/catch 로 감싸 예외를 안 던지고 `ReadResult` 판별 유니온을 돌려준다
- `writeAppState` 실패는 `state.svelte.ts` 의 `saveStatus` 필드로 노출 → 레이아웃 배너에서 소비
- 여러 탭 감지 없음 (D-9)
- `todayClock` 은 `visibilitychange` 도 감시

## 커밋 2: 진행 중 세션 · 타이머 · 알림

**파일**:
- `src/lib/ui/session.svelte.ts` (신규)
- `src/lib/ui/timer.svelte.ts` (신규)
- `src/lib/ui/notify.ts` (신규)

**테스트**:
- `tests/unit/inprogress.test.ts` (신규) — FR-2.3~2.9, FR-6.7a/7b, EC-7/7a/17/25
- `tests/unit/timer.test.ts` (신규) — FR-6.12~6.17, EC-28/29/30, fake timers
- `tests/unit/notify.test.ts` (신규) — EC-24, 3수단 병렬 시도

**요점**:
- `InProgressSession.workSets[i].timerStartedAt` = `Date.now()` — 화면 이탈 후 재진입해도 그
  timestamp 로부터 경과 시간 계산 (EC-30)
- 완료 시 `finalize()` 가 세트 RPE 중 최댓값을 계산하고 `applySession` (또는 `recordConsolidation`)
  호출 → 결과 상태를 스토어에 저장하고 진행 중 데이터 clear
- `notify.alert(durationMs = 5000)` — 3수단 병렬 시도, `setTimeout` 으로 자동 종료

## 커밋 3: 화면 1 (오늘 세션 + 세트 입력)

**파일**:
- `src/routes/+page.svelte` — 실화면으로 교체
- `src/lib/ui/session/` — 세트 입력용 컴포넌트 (`SetInput.svelte`, `WorkSetInput.svelte`,
  `TimerInput.svelte`, `RpeInput.svelte`, `ProposalBanner.svelte`, `ExerciseCard.svelte` 등)
- `src/lib/ui/session/labels.ts` — 표시 문구 헬퍼 (도메인 문자열을 있는 그대로 통과시키는 통로 —
  가공은 안 하지만 배치·헤더 문구 정도만)

**컴포넌트 마운트 테스트는 하지 않는다** (NFR-14). 스토어 · 헬퍼 함수 단위로 테스트.

## 커밋 4: 화면 2 프로그램 선택 + 화면 3 단계 현황 + 첫 실행

**파일**:
- `src/routes/programs/+page.svelte` — 실화면
- `src/routes/steps/+page.svelte` — 실화면
- `src/routes/first-run/+page.svelte` (선택) 또는 `src/routes/steps/+page.svelte` 안에서 첫 실행
  플로우 분기 — FR-3.6 "별도 경로를 만들지 않는다" 를 존중해 `steps/+page.svelte` 안에서 처리
- 확인 다이얼로그 컴포넌트 재사용 (`Confirm.svelte`)

**테스트**: 위 인프라·스토어 테스트로 대부분 커버. UI 자체 마운트 테스트 없음.

## 커밋 5: PWA 골격 + 레이아웃 · 배너

**파일**:
- `src/routes/+layout.svelte` — 하단 네비 (FR-9), 저장 실패 배너 (FR-1.8), 저장 데이터 손상 시 "초기
  상태로 시작" 선택 UI (FR-1.7)
- `src/lib/ui/sw.svelte.ts` (선택, cube-study 참조) — SW 등록·갱신 관리
- `vite.config.ts` 에 `SvelteKitPWA` 확장
- `static/robots.txt` (선택)

**PWA 아이콘 (`static/icon-*.png`) 은 Phase 5** (SPEC Notes 커밋 지침 (5))

---

## 상세 스토어 구조

```ts
// src/lib/ui/state.svelte.ts
class AppStateStore {
  #state = $state<AppState>(initialState());
  #saveStatus = $state<'ok' | 'write-blocked'>('ok');
  #storageStatus = $state<StorageStatus>('ok');
  get value(): AppState { return this.#state; }
  get saveStatus() { return this.#saveStatus; }
  get storageStatus() { return this.#storageStatus; }

  init(booted: BootResult): void {
    this.#state = booted.state;
    this.#storageStatus = booted.storageStatus;
  }

  /**
   * 도메인 함수의 결과를 스토어에 반영하고 즉시 저장 (FR-1.6).
   * 예: apply(recordSession(this.value, catalog, input).state)
   */
  apply(next: AppState): void {
    this.#state = next;
    try { writeAppState(next); this.#saveStatus = 'ok'; }
    catch { this.#saveStatus = 'write-blocked'; }
  }
}
export const appState = new AppStateStore();
```

```ts
// src/lib/ui/session.svelte.ts
class InProgressStore {
  #session = $state<InProgressSession | null>(null);
  get value() { return this.#session; }

  init(loaded: InProgressSession | null): void { this.#session = loaded; }

  begin(startedAt: IsoDate, plan: PlannedExercise): void {
    this.#session = {
      startedAt, progressionId: plan.progressionId,
      step: plan.step, performedStep: plan.performedStep, kind: plan.kind,
      warmupSets: [], workSets: [],
    };
    this.persist();
  }

  pushWorkSet(entry: SetEntry): void {
    if (this.#session === null) return;
    this.#session = { ...this.#session, workSets: [...this.#session.workSets, entry] };
    this.persist();      // FR-2.3
  }

  updateWorkSet(index: number, entry: SetEntry): void { /* ... */ this.persist(); }
  pushWarmupSet(entry: SetEntry): void { /* ... */ this.persist(); }

  finalize(catalog: Catalog): { record: SessionRecord; nextState: AppState } {
    if (this.#session === null) throw new Error('진행 중 세션이 없다');
    // FR-6.7a — 세트 RPE 중 최댓값. 하나도 없으면 필드 자체 없음.
    const rpes = this.#session.workSets.map((s) => s.rpe).filter((r): r is number => r !== undefined);
    const sessionRpe = rpes.length > 0 ? Math.max(...rpes) : undefined;
    const values = this.#session.workSets.map((s) => s.value);
    const input: SessionInput = {
      date: this.#session.startedAt,   // FR-2.8, D-7
      progressionId: this.#session.progressionId,
      step: this.#session.step,
      performedStep: this.#session.performedStep,
      sets: values,
      kind: this.#session.kind,
    };
    if (sessionRpe !== undefined) input.rpe = sessionRpe;
    const applied = applySession(appState.value, catalog, input);
    this.#session = null;
    clearInProgress();
    return { record: applied.record, nextState: applied.state };
  }

  abandon(catalog: Catalog): AbandonResult {
    if (this.#session === null) throw new Error('진행 중 세션이 없다');
    const rpes = this.#session.workSets.map((s) => s.rpe).filter((r): r is number => r !== undefined);
    const sessionRpe = rpes.length > 0 ? Math.max(...rpes) : undefined;
    const result = abandonChallenge(
      appState.value, catalog, this.#session.progressionId,
      this.#session.startedAt, this.#session.workSets.map((s) => s.value), sessionRpe,
    );
    this.#session = null;
    clearInProgress();
    return result;
  }

  private persist(): void {
    if (this.#session === null) return;
    try { writeInProgress(this.#session); } catch { /* 배너 처리 */ }
  }
}
export const inProgress = new InProgressStore();
```

```ts
// src/lib/ui/timer.svelte.ts (스케치)
class Timer {
  elapsedMs = $state(0);
  phase = $state<'idle' | 'ready' | 'running' | 'stopped'>('idle');
  targetSec: number;

  start(targetSec: number, onAlert: () => void): void {
    this.targetSec = targetSec;
    this.phase = 'ready';
    const startAt = Date.now() + 5_000;   // 준비 5초 (FR-6.12)
    const tick = () => {
      const now = Date.now();
      if (now < startAt) { this.elapsedMs = 0; requestAnimationFrame(tick); return; }
      this.phase = 'running';
      this.elapsedMs = now - startAt;
      if (this.elapsedMs >= targetSec * 1000 && !this.#alerted) {
        this.#alerted = true;
        onAlert();     // FR-6.14 — 5초 알림 (안에서 자동 종료)
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop(): { seconds: number } {   // FR-6.16
    this.phase = 'stopped';
    return { seconds: Math.round(this.elapsedMs / 1000) };
  }
}
```

**주**: `requestAnimationFrame` 은 백그라운드 탭에서 멈춘다. 그래도 `elapsedMs = now - startAt` 이므로
재활성화 시 정확한 값이 즉시 계산된다 (EC-30) — 카운트 값이 아니라 timestamp 로부터 파생하기 때문이다.
테스트는 `Date.now` 를 목킹해 검증.

---

## Out of Scope

- 수행 기록 목록 화면 (D-5) — 다음 작업
- 캘린더 뷰 (이슈 #1)
- 심박수 입력
- 커스텀 루틴
- 데이터 내보내기 / 가져오기 (D-8)
- 다국어
- Playwright / e2e (GLOBAL 「SPEC 과의 불일치」5)
- **PWA 아이콘 3장** (`icon-192.png` / `icon-512.png` / `icon-maskable.png`) — Phase 5. 이 페이즈는
  manifest 에 경로만 적어두고 파일은 만들지 않는다. 이 상태에서 `pnpm build` 는 성공하나
  manifest 검증(브라우저)에서 경고가 나올 수 있다 — 정상. Phase 5 가 실 파일을 만든다
- 배포 자체 — Phase 5

---

## 검증

`PHASE_4_TEST.md` 의 항목을 순서대로 수행 — 각 커밋 완료 시점마다.
