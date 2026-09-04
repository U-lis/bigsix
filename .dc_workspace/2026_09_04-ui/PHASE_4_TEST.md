# Phase 4 검증

**목적**: UI 코드가 SPEC 이 요구하는 저장·부팅·화면 동작·타이머·PWA 골격을 만족하는지, 그리고
도메인 관성(NFR-1~5a, NFR-13~15)이 UI 를 얹은 뒤에도 유지되는지 확인한다.

**대전제**: 컴포넌트 마운트 테스트는 하지 않는다 (NFR-14). 스토어·헬퍼·부팅 순서·타이머·저장은 함수
단위로 검증. UI 자체는 코드 리뷰와 수동 검증.

---

## 커밋 1 이후 (인프라)

### 저장 계층 (FR-1, EC-1~5)

`tests/unit/storage.test.ts`:
- [ ] **빈 저장**: `readAppState()` → `{ status: 'empty' }`
- [ ] **정상 라운드트립**: 임의 `AppState` → write → read → 값 동일 (`toEqual`)
- [ ] **JSON 파싱 실패**: `localStorage.setItem('bigsix.state', '{not json')` → `readAppState()` →
      `{ status: 'corrupt', raw }`. `raw` 는 그대로 남는다
- [ ] **필수 필드 누락**: `{"schemaVersion":1,"appState":{}}` → `{ status: 'corrupt', ... }` (steps
      부재)
- [ ] **미래 버전**: `{"schemaVersion":999,"appState":{...}}` → `{ status: 'future-version', version:
      999 }`. `writeAppState` 를 호출해도 원본이 유지되어야 함 → 이후 다시 read → 여전히 미래 버전
      데이터 (덮어쓰기 금지 FR-1.5, EC-3)
- [ ] **쓰기 실패**: `Storage.setItem` 을 throw 로 목킹 → `writeAppState` 가 예외를 위로 전달 (호출
      측이 배너로 노출)
- [ ] **읽기 실패 (`localStorage` 자체 접근 차단)**: `Object.defineProperty(window, 'localStorage', {
      get() { throw new Error('blocked'); } })` → `readAppState()` → `{ status: 'read-blocked', error }`
- [ ] **`AppState` 무오염**: 저장된 봉투를 파싱한 뒤 `appState` 필드가 `AppState` 타입 규격 그대로
      (버전 필드 섞이지 않음 FR-1.2)
- [ ] **진행 중 세션 별도 키**: `readAppState` 가 `bigsix.session.inprogress` 를 건드리지 않음. 그 반대도

### 부팅 시퀀스 (FR-3)

`tests/unit/boot.test.ts`:
- [ ] **순서 강제**: `readAppState` → `todayClock.today` → `advanceProposals` → `planOn` →
      `readInProgress` 순으로 호출됨 (스파이/mock 사용)
- [ ] **저장 트리거**: `advanceProposals` 가 상태를 바꿨으면 `writeAppState` 정확히 1회 호출 (FR-3.4)
- [ ] **상태 무변경 시**: `advanceProposals` 가 인자 그대로 반환하면 `writeAppState` 호출 없음
- [ ] **no-program**: 저장 데이터가 없고 사용자 시작 단계 선택 전 → `initialState()` 로 시작 →
      `agenda.kind === 'no-program'`
- [ ] **FR-3.5 첫 실행 감지**: `stored.status === 'empty'` 이면 `BootResult.needsFirstRun === true`
      (또는 유사한 신호)
- [ ] **EC-19 부팅당 1회**: `boot()` 두 번 호출해도 각각 자기 `advanceProposals` 를 부르며 (호출
      시점 사이에 요일 조건이 유지되어도) 부팅 회차마다 pending 중복 생성 없음 (도메인이 이미 보장)

### 날짜 (FR-4, EC-6)

`tests/unit/today.test.ts`:
- [ ] **로컬 자정 기준 IsoDate 산출**: `todayClock` 의 계산 함수에 `new Date(2026, 8, 5, 23, 59)` 를
      주입 → `'2026-09-05'` (로컬 자정 안)
- [ ] `new Date(2026, 8, 6, 0, 0, 1)` → `'2026-09-06'`
- [ ] **UTC 기준을 쓰지 않는다**: `Date.UTC` 로 계산한 값과 다르면 로컬 산출인 것 (KST 자정 = UTC 15
      시라 하루 차이 검증)
- [ ] **재계산 훅**: `todayClock.recompute()` 호출 → 값 갱신. `visibilitychange` 시뮬레이션에서도
      동일

### svelte-check · NFR-3 · NFR-5a 재검증

- [ ] `pnpm run check` 오류 · 경고 0
- [ ] `grep -rn "\\$state\\|\\$derived\\|\\$effect\\|from 'svelte" src/lib/domain/` 이 출력 없음
- [ ] `grep -rn "new Date()\\|Date.now()" src/lib/domain/` 이 출력 없음

---

## 커밋 2 이후 (진행 중 세션 · 타이머 · 알림)

### 진행 중 세션 (FR-2, FR-6.7)

`tests/unit/inprogress.test.ts`:
- [ ] **세트마다 저장 (FR-2.3)**: `pushWorkSet` 3회 호출 → `writeInProgress` 3회 호출됨 (스파이)
- [ ] **부팅 복원 (FR-2.4)**: `writeInProgress(sample)` → `readInProgress()` → 동일 값
- [ ] **완료 시 진행 데이터 제거 (FR-2.5)**: `finalize(catalog)` 호출 → `readInProgress()` → null,
      `state.history` 에 새 SessionRecord 반영
- [ ] **시작 날짜 유지 (FR-2.8, D-7)**: 진행 중 세션의 `startedAt` == '2026-09-05' 상태에서 오늘이
      '2026-09-06' 이 된 뒤 `finalize` → 저장된 `SessionRecord.date` === '2026-09-05'
- [ ] **완료 시 최댓값 RPE (FR-6.7a)**: 세트별 RPE = [7, 9, 8] → `SessionRecord.rpe === 9`
- [ ] **RPE 미입력 시 필드 없음**: 세트 RPE 전무 → `SessionRecord.rpe` 필드 자체 없음 (0 대체 안 됨)
- [ ] **세트별 RPE 는 저장되지만 완료 시 소실 (FR-6.7b, L-8)**: `InProgressSession.workSets[*].rpe`
      는 유지, `finalize` 후 최댓값 하나만 SessionRecord 에 남음
- [ ] **EC-7 자정 넘긴 세션도 시작 날짜로 기록**: 위 시나리오와 동일
- [ ] **EC-17 재실행 복원**: writeInProgress → 새 store 인스턴스 → init(readInProgress()) → 값 유지

### 타이머 (FR-6.12~6.17, EC-28~30)

`tests/unit/timer.test.ts` — `vi.useFakeTimers()` 필요:
- [ ] **준비 5초 (FR-6.12)**: `start(120)` → 5초 전까지 `phase === 'ready'`, `elapsedMs === 0`
- [ ] **카운트업 시작**: 5.1초 지나면 `phase === 'running'`, `elapsedMs > 0`
- [ ] **목표에서 멈추지 않는다 (FR-6.13, EC-28)**: `start(120)` 후 130 초 지남 → `elapsedMs`
      대략 130 000 ms
- [ ] **알림 (FR-6.14)**: 목표 도달 시 `onAlert` 1회 호출. 그 뒤 알림이 반복되지 않는다
- [ ] **알림 5초 후 자동 종료**: `notify.alert()` 안에서 setTimeout 으로 종료 (`notify.test.ts` 에서
      검증)
- [ ] **정지 (FR-6.15, 6.16)**: `stop()` 호출 시점 `elapsedMs` → 세트 기록. `phase === 'stopped'`
- [ ] **정지 이전 종료 (EC-29)**: 목표 시간 전 stop → 그 시점 값이 기록됨 (UI 가 미달을 막지 않음)
- [ ] **EC-30 timestamp 기반**: `Date.now` 를 목킹해 시작·현재 시각 차이를 조작 → `elapsedMs` 가
      틱 카운트가 아니라 (`now - startAt`) 로 계산됨을 검증. 화면 이탈 시뮬레이션 후 재활성화에서도
      값이 정확
- [ ] **수정 수단 (FR-6.17)**: `stop()` 반환값을 사용자가 갈아쓸 수 있는 API 가 스토어에 존재

### 알림 (FR-6.14, EC-24)

`tests/unit/notify.test.ts`:
- [ ] **3수단 동시 시도**: `alert()` 호출 시 소리 (`Audio`), 진동 (`navigator.vibrate`), 화면 점멸
      (DOM 변경) 3가지가 각각 호출됨
- [ ] **소리 막힘**: `Audio.play` 가 reject → 진동·점멸은 그대로 실행됨
- [ ] **진동 미지원**: `navigator.vibrate === undefined` → 나머지 정상
- [ ] **5초 후 자동 종료**: `alert(5000)` → 5초 지나면 화면 점멸이 원상복구, 소리 정지

---

## 커밋 3 이후 (화면 1)

### 코드 리뷰 항목

- [ ] `src/routes/+page.svelte` 안에 `new Date()` / `Date.now()` 0회 — `todayClock.today` 사용
- [ ] `DayAgenda` 의 `reason`, `sideNote`, 잠금 사유 문자열이 그대로 표시된다 (가공하지 않음
      NFR-2, FR-5.3)
- [ ] `perSide === true` 인 단계에서 `sideNote` 표시가 접히지 않는다 (FR-6.5, EC-15)
- [ ] `paired` 가 있는 계획에서 동반 단계가 함께 그려진다 (FR-5.8)
- [ ] '불가능' 버튼 → 확인 → `abandonChallenge` (FR-6.8, NFR-10). `canConsolidate === false` 이면
      "1단계라 다지기 없음" 표시 (FR-6.10, EC-12)
- [ ] `canConsolidate === true` 이면 사용자 확인 후 승인 → `recordConsolidation` 호출 (FR-6.9)
- [ ] `mode: 'max'` 세트는 "이 수치 이상으로 최대한" 문구, `mode: 'fixed'` 는 "이 수치만큼" 문구
      (FR-6.6, FR-15.2). 상한 UI 를 두지 않음
- [ ] 세트 입력은 `<input type="number" inputmode="numeric" min="1" step="1">`. `max` 속성 없음 (EC-23)
- [ ] 초기값 = 목표 (`target`) 확인 (FR-6.2a)
- [ ] 세트 입력마다 `inProgress.pushWorkSet` 이 호출됨 → 저장 이벤트 발생
- [ ] `rest === true` 인 날 세트 입력 UI 안 뜸 (FR-5.4, EC-11)
- [ ] `locked` 종목은 카드에 잠금 사유가 함께 표시됨 (FR-5.5, EC-13)
- [ ] `agenda.proposal !== null` 시 승인/거절 배너 (FR-5.7)
- [ ] EC-7a 시작 날짜가 오늘이 아니면 화면 상단에 "이 세션은 YYYY-MM-DD 세션입니다" 문구 (FR-2.9)

### 정합성

- [ ] `pnpm test` 통과 (기존 도메인 + 인프라 테스트 유지)
- [ ] `pnpm run check` 오류 · 경고 0
- [ ] `pnpm build` 성공

---

## 커밋 4 이후 (화면 2 · 3 · 첫 실행)

### 화면 2 (프로그램 선택, FR-7)

- [ ] `describePrograms(catalog)` 결과 5종 카드 표시
- [ ] 각 카드: name.ko / frequency / trainingDays / restDays / progressionIds / note (있으면). 보조
      운동 필드가 없음 — 도메인이 이미 뺐다
- [ ] 미선택이면 `selectProgram`, 진행 중이면 `switchProgram` 사용
- [ ] 오늘 날짜 주입 (`todayClock.today`). 그날이 새 루틴의 휴식일이면 "다음 첫 운동일이 1일차 …"
      안내 (FR-7.5, EC-10)
- [ ] 현재 수행 중인 프로그램 카드에 시각적 구별 (border/label)
- [ ] 전환 확인 다이얼로그에서 "steps / history 는 바뀌지 않는다" · "며칠차는 1부터 다시 센다" 문구
      (FR-7.7)
- [ ] 확정 후 저장 → 홈으로 (FR-7.8)

### 화면 3 (단계 현황, FR-8)

- [ ] 빅6 6종 각각 카드
- [ ] 현재 단계 `state.steps[id]` + stepName.ko 표시 (FR-8.1)
- [ ] 잠긴 종목은 `unlockedProgressions` / `checkGate` 로 판정, 잠금 사유 함께 (FR-8.2)
- [ ] 각 카드에 초/중/상 기준 수치 표시 (FR-8.3) — 도메인의 `getStep(catalog, id, n)` 사용
- [ ] `unit` / `perSide` 표시 (FR-8.4)
- [ ] "단계 조정" 버튼 → dropdown 1~10 → 확인 다이얼로그:
  - "되돌릴 수 없다" 문구
  - "조정 시점부터 유지 횟수가 다시 세어진다" 문구 (FR-13.3, FR-8.6)
  - 확정 시 `setStep(state, catalog, id, step)` 호출
- [ ] 잠긴 종목 카드는 "조정 불가" 로 표시 (FR-8.7). 강제 시도해도 도메인이 예외를 던져 UI 가 실패
      배너 노출 (EC-27)

### 첫 실행 (FR-3.5~3.7)

- [ ] `boot()` 이 `needsFirstRun === true` 를 돌려주면 자동으로 첫 실행 화면 라우팅
- [ ] 시작 단계 선택 화면 = `steps/+page.svelte` 의 특수 모드 또는 별도 페이지. **`setStep` API 를
      그대로 사용** (FR-3.6 — 별도 경로 만들지 않음)
- [ ] 기본값 = 전 종목 2단계 (FR-3.5). 그대로 넘기면 `initialState()` 와 동일
- [ ] 잠긴 종목(브리지·핸드스탠드)은 첫 실행 화면에서도 조정 불가 (FR-3.7 / FR-8.7)

### 네비 (FR-9)

- [ ] `+layout.svelte` 하단 탭: 오늘 / 프로그램 / 단계
- [ ] 미선택 상태에서는 자동으로 프로그램 화면이 진입점 (FR-9.2, FR-3.3)
- [ ] 다른 화면으로 이동해도 `inProgress` 스토어가 유지됨 → 오늘 세션으로 돌아가면 입력 상태 그대로
      (FR-9.3, EC-17)

---

## 커밋 5 이후 (PWA 골격)

### 빌드 검증

- [ ] `pnpm build` 성공
- [ ] `build/manifest.webmanifest` 존재. `lang: 'ko'`, `display: 'standalone'` (FR-11.5)
- [ ] `build/sw.js` 존재 (또는 `build/registerSW.js` + workbox precache manifest)
- [ ] `build/_app/immutable/…` 해시 파일 존재
- [ ] `grep -r "node:fs" build/` 출력 없음 (FR-0.7 지속 확인)

### 서비스 워커 정합성

- [ ] `vite.config.ts` 의 `SvelteKitPWA` 옵션에 `registerType: 'autoUpdate'`, `navigateFallback: '/'`,
      `ignoreURLParametersMatching: [/.*/]`, `globPatterns` 에 `json` 포함
- [ ] `+layout.svelte` 가 SW 등록 코드 소유 (cube-study 참조 — dev 에서 등록 안 함)

### 배너 · 확인 · 손상 복구

- [ ] 저장 실패 상태에서 상단 배너 노출 (FR-1.8, EC-4)
- [ ] 저장 데이터 손상 감지 시 (`storageStatus === 'corrupt'`) "초기 상태로 시작" 버튼을 사용자가
      명시적으로 눌러야 진행 (FR-1.7, EC-1, EC-2)
- [ ] 미래 버전 감지 시 (`storageStatus === 'future-version'`) 앱이 앱 상태를 덮어쓰지 않으며 그 사실을
      배너로 표시 (FR-1.5, EC-3)

### 접근성 · 조작 (NFR-8~11)

- [ ] 주요 버튼(세트 확정, 세트 입력, '불가능', 확인 다이얼로그) 44×44 CSS px 이상 (측정 또는
      CSS 검사)
- [ ] 세트 입력이 슬라이더가 아니라 숫자 키패드 (`inputmode="numeric"`) — 이미 FR-6.2 로 반영
- [ ] '불가능' · 프로그램 전환 · "초기 상태로 시작" · 단계 조정에 확인 단계 (NFR-10)
- [ ] 360px 폭에서 가로 스크롤 없음 (Chrome DevTools 확인)

### 표시 원칙 (NFR-1, NFR-2)

- [ ] `grep -rE "streak|배지|축하|잘했|훌륭|almost|거의|%" src/routes/ src/lib/ui/` 로 게이미피케이션
      류 문구가 없는지 확인 (자동 검색 후 각 매칭을 사람이 최종 판단)

---

## Phase 4 전체 마감 확인

- [ ] `pnpm test` 통과 · 커버리지: 도메인 line 100% 유지, UI 신규 코드 ≥ 70% (NFR-13)
- [ ] `pnpm run check` 오류 · 경고 0 (NFR-17)
- [ ] `pnpm build` 성공, `build/` 산출물 준비
- [ ] EC-1~EC-30 이 각각 테스트 파일 또는 정책 문서 참조 (GLOBAL 「Edge Case ↔ Phase 매핑」 표 대조)
- [ ] `git log --oneline HEAD~5..HEAD` — 각 커밋이 단일 관심사

---

## 실패 시 대처

- 부팅 순서 어긋남: `boot()` 안에서 함수 호출 순서 재점검. 테스트에서 spy 사용해 순서 강제
- 저장 손상 처리 시 원본 삭제 발생: `readAppState` 는 corrupt 판정 시 `localStorage.removeItem` 하지
  않는지 확인 (FR-1.7)
- 타이머가 백그라운드에서 시간 어긋남: `requestAnimationFrame` 대신 `elapsedMs = Date.now() -
  startAt` 로 계산되는지, `visibilitychange` 에서 재계산 훅이 있는지 (EC-30)
- 여러 탭 감지 코드 발견: 삭제. D-9 는 감지·경고·잠금을 하지 않는다
