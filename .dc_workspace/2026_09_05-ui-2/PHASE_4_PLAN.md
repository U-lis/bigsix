# Phase 4 — 오늘 화면 4상태 (FR-17) + `nextDoableTrainingDay`

**목표**: 오늘 화면이 「미선택 / 휴식일 / 할 게 없음 / 운동일」 네 상태를 모두 말하게 한다. no-program 리다이렉트를 제거하고 그 자리에 안내를 둔다. 잠긴 종목만 배정된 날을 "할 게 없는 날" 로 구분해 표시한다. `firstTrainingDay` 는 그대로 두고, 활성 구간의 잠금을 아는 `nextDoableTrainingDay` 를 신규 추가한다 (ADR-19).

**Dependencies**: Phase 3 완료
**커밋 수**: 2
**예상 테스트 변화**: 555~575 → 약 570~585 (program.test + todayScreen 헬퍼 신규)
**스키마**: 변경 없음

---

## Commit 1 — `nextDoableTrainingDay` 신규 (FR-17.4 / FR-17.4a / EC-38 / EC-43 / ADR-19)

### program.ts

- [ ] 신규 함수:
  ```ts
  /**
   * 활성 구간에서 실제로 수행할 종목이 있는 다음 날짜 (FR-17.4 / EC-43 / ADR-19).
   *
   * 기존 `firstTrainingDay(catalog, programId, from)` 는 요일표만 보므로
   * 잠긴 종목만 있는 날을 "다음 운동일" 로 가리킬 수 있다. 이 함수는 그 오류를
   * 피하기 위해 `state` 를 받아 실제로 수행할 종목이 있는지 확인한다.
   *
   * `from` 자신도 후보다. 활성 구간이 없으면 null. 7일 안에 못 찾으면 null.
   *
   * `planDay` 는 잠긴 종목을 `exercises` 가 아니라 `locked` 에 넣으므로,
   * `exercises.length === 0` 인 날은 실제로 수행할 것이 없는 날이다.
   *
   * **기존 `firstTrainingDay` 는 건드리지 않는다** — 프로그램 선택 화면의
   * "다음 첫 운동일이 1일차" 안내는 아직 선택 안 한 프로그램에 대한 것이므로
   * 잠금과 무관하다 (ADR-19).
   */
  export function nextDoableTrainingDay(
    state: AppState, catalog: Catalog, from: IsoDate,
  ): IsoDate | null {
    const stint = currentStint(state);
    if (stint === null) return null;
    for (let i = 0; i < WEEKDAYS.length; i += 1) {
      const date = addDays(from, i);
      const plan = planDay(state, catalog, stint.programId, weekdayOf(date));
      if (plan.exercises.length > 0) return date;
    }
    return null;   // FR-17.4a / EC-43
  }
  ```
- [ ] import 확장: `planDay` 를 `schedule.ts` 에서 가져오기 (기존은 이미 `getProgram`, `LABEL_TO_ID` 등 import 중)
- [ ] index.ts 에 `nextDoableTrainingDay` export 추가

### 테스트

- [ ] `tests/unit/program.test.ts` 확장:
  - "활성 구간 없으면 null" (프로그램 미선택)
  - "오늘 자체가 수행 가능한 날이면 오늘 반환"
  - "오늘 휴식일 다음 첫 수행 가능한 날 반환" (FR-17.4)
  - **EC-38**: "잠긴 종목만 배정된 날을 건너뛴다"
    - state: `steps: { pushup: 2, squat: 2, pullup: 2, legraise: 2, bridge: 2, hspu: 2 }` (bridge/hspu 잠김)
    - program: `veterano` (화·수가 bridge / hspu 단독)
    - from: 화요일 → 반환은 목요일 또는 첫 수행 가능한 다음 요일
  - **EC-43 / FR-17.4a**: "7일 안에 수행할 것이 있는 날 없으면 null 반환 (예외 아님)"
  - "잠긴 종목이 활성 구간 프로그램의 모든 운동일 종목이면 null"

### 검사

- [ ] `pnpm test` 통과
- [ ] `pnpm run check` 0/0
- [ ] `firstTrainingDay` 시그니처가 변경되지 않았는지 확인 — 기존 호출부(programs/+page.svelte:46) 무결

---

## Commit 2 — 오늘 화면 4상태 분기 + 리다이렉트 제거 (FR-17.1 / FR-17.2 / FR-17.5 / FR-17.7)

### 파생 함수

- [ ] `src/lib/ui/today.svelte.ts` 또는 `src/lib/ui/todayScreen.ts` 신규 파일에 순수 함수:
  ```ts
  /**
   * 오늘 화면의 4상태 파생 (FR-17.2 / ADR-19).
   *
   * `rest` 의 도메인 정의는 건드리지 않고 (FR-17.5), 화면 층에서 조합해 만든다.
   * - no-program: 프로그램 미선택
   * - rest: 프로그램이 쉬라고 정한 날 (요일표 비어 있음)
   * - no-doable: rest === false 이나 exercises 가 빔 (잠긴 종목만 배정)
   * - training: exercises 가 있음
   */
  export type TodayScreenState =
    | { kind: 'no-program' }
    | { kind: 'rest'; nextTrainingDate: IsoDate | null }
    | { kind: 'no-doable'; locked: Locked[]; nextTrainingDate: IsoDate | null }
    | { kind: 'training'; agenda: PlanAgenda };

  export function deriveTodayScreen(
    state: AppState, catalog: Catalog, today: IsoDate,
  ): TodayScreenState;
  ```
- [ ] 구현 요건:
  - `agenda = planOn(state, catalog, today)` 로 시작
  - `agenda.kind === 'no-program'` → `{ kind: 'no-program' }`
  - `agenda.rest === true` → `{ kind: 'rest', nextTrainingDate: nextDoableTrainingDay(state, catalog, addDays(today, 1)) }`
  - `agenda.exercises.length === 0` → `{ kind: 'no-doable', locked: agenda.locked, nextTrainingDate: nextDoableTrainingDay(state, catalog, addDays(today, 1)) }`
  - 그 외 → `{ kind: 'training', agenda }`
- [ ] 순수 함수. `AppState` 를 변형하지 않는다.

### +layout.svelte 리다이렉트 제거 (FR-17.1)

- [ ] `src/routes/+layout.svelte` line 43~46 의 `no-program` 리다이렉트 삭제:
  ```svelte
  // 삭제
  } else if (result.agenda.kind === 'no-program' && !result.needsFirstRun && page.url.pathname === '/') {
    goto('/programs');
  }
  ```
- [ ] `needsFirstRun` 분기(line 41~42)는 유지 — 첫 실행 단계 선택은 별개 (FR-3.5)

### +page.svelte 4상태 분기 (FR-17.2 / FR-17.7)

- [ ] `src/routes/+page.svelte` 재편:
  - `onMount` 의 `goto('/programs')` 리다이렉트 제거 (line 71~75)
  - 기존 `agenda` derived 대신 `screen = $derived(deriveTodayScreen(appState.value, catalog, todayClock.today))` 로 대체
  - 4상태 분기:
    ```svelte
    {#if screen.kind === 'no-program'}
      <p>선택한 프로그램이 없습니다.</p>
      <a href="/programs" class="btn">프로그램 선택하기</a>
    {:else if screen.kind === 'rest'}
      <p class="rest">
        오늘은 휴식일입니다.
        {#if screen.nextTrainingDate}
          다음 루틴은 {formatKoDate(screen.nextTrainingDate)}({weekdayKoOf(screen.nextTrainingDate)}요일)에 시작됩니다.
        {:else}
          당분간 수행할 종목이 없습니다.
        {/if}
      </p>
    {:else if screen.kind === 'no-doable'}
      <div class="no-doable">
        {#each screen.locked as l (l.progressionId)}
          <p class="locked-reason">{progressionName(catalog, l.progressionId)}: {l.reason}</p>
        {/each}
        <p class="rest">
          오늘 계획된 종목이 모두 잠겨 있습니다.
          {#if screen.nextTrainingDate}
            다음 루틴은 {formatKoDate(screen.nextTrainingDate)}({weekdayKoOf(screen.nextTrainingDate)}요일)에 시작됩니다.
          {:else}
            당분간 수행할 종목이 없습니다.
          {/if}
        </p>
      </div>
    {:else}
      <!-- 기존 training 분기: header + proposal + exercises -->
    {/if}
    ```
  - **문구는 사실만** (FR-17.7 / NFR-2): "푹 쉬세요" 같은 격려·게이미피케이션 표현 넣지 않음
  - "프로그램 선택하기" 버튼은 최소 44×44 CSS px (NFR-8 승계)
  - `formatKoDate(iso)` / `weekdayKoOf(iso)` 는 `labels.ts` 헬퍼로:
    ```ts
    export function formatKoDate(iso: IsoDate): string { /* '9월 8일' */ }
    export function weekdayKoOf(iso: IsoDate): string { /* '월' */ }
    ```
- [ ] 자유 운동 진입 버튼(Phase 3 Commit 2) 은 4상태 어디서든 노출 (FR-18.1 언제든)

### L-3 문구 정리 (FR-17.6)

- [ ] `README.md` 또는 관련 문서의 L-3 항목을 다음처럼 정리:
  - "L-3: `planOn().rest` 와 `reviewDay().status === 'rest'` 는 다르다. 전자는 프로그램이 요일표에서 그날을 비웠는가(도메인이 배정을 하지 않았는가), 후자는 결과적으로 판정 대상 종목이 있었는가(잠긴 종목만 배정된 날이면 status='rest')를 답한다. 이 구분은 유지하되 오늘 화면은 두 경우를 다르게 말한다 (FR-17.5)."

### 테스트

- [ ] `tests/unit/todayScreen.test.ts` (신규):
  - `deriveTodayScreen` 4상태 각각 반환 케이스
  - **EC-39**: no-program 상태에서 진입 시 `{ kind: 'no-program' }` 반환 (리다이렉트 아님)
  - **EC-37**: 잠긴 종목만 배정된 날 시나리오 → `{ kind: 'no-doable', locked: [...], nextTrainingDate: ... }`
  - "다음 수행 가능 날짜가 없으면 nextTrainingDate === null" (EC-43 재검증)
  - 순수 함수 검증 (state 변형 없음)

- [ ] 라우팅 리다이렉트 제거 회귀 케이스는 자동 테스트 어려움 (컴포넌트 마운트 안 함, NFR-14) → 육안 확인

### 검사

- [ ] `pnpm test` 전부 통과 (예상 570~585개)
- [ ] `pnpm run check` 0/0
- [ ] 수동: no-program 상태로 앱 부팅 → 오늘 화면에 안내 + 「프로그램 선택하기」 버튼 (리다이렉트 아님)
- [ ] 수동: veterano 프로그램 · 빅4 전부 2단계 상태 → 화요일 화면에 잠긴 종목 안내 + "다음 루틴은 목요일에" 표시
- [ ] 수동: 휴식일 → "다음 루틴은 …" 표시

---

## Out of Scope (이 페이즈)

- FR-16 상단 바 → Phase 5
- FR-19 About → Phase 5

## Traceability

| SPEC 항목 | 처리 |
|---|---|
| FR-17.1 | Commit 2 (+layout.svelte / +page.svelte 리다이렉트 제거) |
| FR-17.2 | Commit 2 (4상태 분기) |
| FR-17.3 | Commit 2 (「프로그램 선택하기」 버튼) |
| FR-17.4 | Commit 1 (`nextDoableTrainingDay` 신규) |
| FR-17.4a | Commit 1 (7일 없으면 null 반환) |
| FR-17.5 | Commit 2 (화면 층에서 파생, `rest` 도메인 정의 불변) |
| FR-17.6 | Commit 2 (문서 L-3 정리) |
| FR-17.7 | Commit 2 (문구 사실만 · NFR-2 준수) |
| EC-37 | Commit 2 todayScreen.test 신규 |
| EC-38 | Commit 1 program.test 신규 |
| EC-39 | Commit 2 todayScreen.test 신규 |
| EC-43 | Commit 1 program.test 신규 · Commit 2 todayScreen.test 재확인 |
