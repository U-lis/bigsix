# Phase 5 — 상단 바 (FR-16) + About (FR-19)

**목표**: CubeStudy 의 검증된 상단 바 3종(설치·테마·화면 유지)과 About 모달을 이식한다. 복사가 아니라 이식 — bigsix 에 없는 설정 항목까지 끌어오지 않는다 (FR-16.9). 초기화 확인 다이얼로그를 About 로 이관 (FR-19.4). CSS 는 `prefers-color-scheme` 위에 `[data-theme]` 이 덮는 이중 정의 (FR-16.4).

**Dependencies**: Phase 4 완료
**커밋 수**: 3
**예상 테스트 변화**: 570~585 → 약 600~625 (신규 UI 유틸 · About 로직)
**스키마**: 변경 없음

**참조 구현**:
- `~/Documents/cube-study/src/lib/ui/wakelock.svelte.ts`
- `~/Documents/cube-study/src/lib/ui/settings.svelte.ts` (`theme`, `cycleTheme` 부분)
- `~/Documents/cube-study/src/routes/+layout.svelte` (`installPrompt`, `install`)
- `~/Documents/cube-study/src/lib/ui/About.svelte`

---

## Commit 1 — wakelock · theme · install 이식 (FR-16.2 / FR-16.3 / FR-16.5~8 / EC-31~36)

### `src/lib/ui/wakelock.svelte.ts` (신규, 이식)

- [ ] CubeStudy 의 `wakelock.svelte.ts` 를 그대로 이식. 다음 요건 확인:
  - `supported`: `'wakeLock' in navigator`
  - `enabled`: 사용자가 켜달라고 한 상태 (localStorage 저장). "실제로 잡혀 있는가" 와 구분 (FR-16.7)
  - `held`: 실제로 lock 이 잡혀 있는 상태 (내부 상태)
  - `toggle()`: enabled 반전 → 저장 · 잠금 요청/해제
  - `visibilitychange` 리스너: 백그라운드 → 잠금 놓아짐 → 복귀 시 다시 잡음 (FR-16.6 / EC-35)
  - lock 요청 거부(절전 등, EC-34) 시 enabled 는 켜진 채로 두고 다음 기회에 재시도
  - localStorage 접근을 try/catch 로 감싼다 (FR-16.8 / EC-36)
- [ ] JSDoc 에 CubeStudy 참조 명시

### `src/lib/ui/theme.svelte.ts` (신규, 이식)

- [ ] CubeStudy 의 `settings.svelte.ts` 에서 theme 부분만 발췌 이식:
  - `theme.value: 'system' | 'light' | 'dark'`
  - `theme.cycle()`: system → light → dark → system 순환
  - `system` 이면 `documentElement.dataset.theme` 삭제 (FR-16.3)
  - 그 외에는 `documentElement.dataset.theme = value` 설정
  - localStorage 저장 (`try/catch`, FR-16.8)
- [ ] bigsix 에 없는 다른 설정(음성 안내 등) 은 끌어오지 않는다 (FR-16.9)

### `src/lib/ui/install.svelte.ts` (신규, 이식)

- [ ] CubeStudy 의 `+layout.svelte` 에서 `installPrompt` / `install()` 로직 발췌 · 별도 파일로 분리:
  - `available`: `beforeinstallprompt` 이벤트를 받아 저장했는가
  - `prompt()`: 저장된 이벤트로 `prompt()` 호출, 즉시 보관분 비움 (FR-16.2)
  - `appinstalled` 리스너: 보관분 파기
  - iOS Safari · 이미 설치됨 · 조건 미달 → 이벤트 안 옴 → `available` false 유지 (EC-31)
  - 사용자가 프롬프트 취소 → 재발동 안 함 (EC-32) — `prompt()` 는 이벤트당 1회

### 테스트

- [ ] `tests/unit/wakelock.test.ts` (신규, `// @vitest-environment happy-dom`)
  - **EC-33**: `navigator.wakeLock` 없으면 `supported === false`
  - **EC-34**: `request()` 가 reject 되면 `held === false` 이나 `enabled === true` 유지
  - **EC-35**: `visibilitychange` 로 다시 잡기
  - localStorage 저장 · 복원
- [ ] `tests/unit/theme.test.ts` (신규, happy-dom)
  - 초기 = 'system' 이면 `dataset.theme` 없음
  - cycle → 'light' → `dataset.theme === 'light'`
  - cycle → 'dark'
  - cycle → 'system' → 삭제
  - **EC-36**: localStorage 저장 실패해도 세션에는 적용 (try/catch)
- [ ] `tests/unit/install.test.ts` (신규, happy-dom)
  - **EC-31**: 이벤트 없으면 `available === false`
  - `beforeinstallprompt` 오면 `available === true`
  - **EC-32**: `prompt()` 호출 즉시 보관분 비움 (재호출은 no-op)
  - `appinstalled` 시 보관분 파기

### 검사

- [ ] `pnpm test` 통과 (신규 케이스 반영)
- [ ] `pnpm run check` 0/0
- [ ] 참조 구현과의 diff 를 커밋 메시지에 요약 (뭘 뺐는지 명시)

---

## Commit 2 — About 컴포넌트 + 초기화 이관 (FR-19.1~5 / EC-47)

### `src/lib/ui/About.svelte` (신규, 이식)

- [ ] CubeStudy 의 `About.svelte` 를 이식하되 bigsix 에 맞게 조정:
  - **모달**: `<dialog>` 사용 — ESC 닫기 · 포커스 트랩 브라우저에 위임 (FR-19.1)
  - **표시 항목** (FR-19.2):
    - 이름: "bigsix"
    - 제작자: "familygameguild"
    - 버전: `__APP_VERSION__` (vite.config.ts 가 이미 정의)
    - 커밋: `__COMMIT_HASH__`
  - **업데이트 확인** 버튼 (FR-19.3):
    - `sw.svelte.ts` 의 `checkNow()` 호출 (1차에서 이미 이식됨)
    - 결과 문구: "최신입니다" / "새 버전 발견 — 새로고침하세요"
  - **전체 데이터 초기화** (FR-19.4):
    - 2단계 확인: `idle` → 첫 클릭 → `confirming` → 두 번째 클릭 → 실행
    - 모달을 닫으면 `idle` 로 되돌린다 (EC-47)
    - 실행 시: `appState.resetToInitial()` · `clearInProgress()` · `goto('/steps')`
- [ ] 로직 헬퍼는 별도 함수로 뽑아 단위 테스트:
  ```ts
  // About.ts 또는 lib/ui/aboutState.ts
  export type ResetState = 'idle' | 'confirming';
  export function nextResetState(current: ResetState, event: 'click' | 'closeModal'): ResetState;
  export function isResetReady(state: ResetState): boolean;
  ```

### +layout.svelte 초기화 이관 (FR-19.4)

- [ ] `+layout.svelte` 의 기존 `Confirm` 다이얼로그 (line 111~119) **삭제** — About 안으로 이관
- [ ] `showResetConfirm` 상태와 `resetInitial` 함수 삭제 — About 이 소유
- [ ] "손상 배너의 「초기 상태로 시작」 버튼" (line 76) 은 유지 — 이 경로는 About 밖에서도 필요. 하지만 실행 로직은 공통 헬퍼로:
  ```ts
  // src/lib/ui/reset.ts
  export function performReset(): void {
    appState.resetToInitial();
    clearInProgress();
    // 라우팅은 호출부가 담당
  }
  ```
  About 과 손상 배너 모두 이 헬퍼를 부른다.

### 테스트

- [ ] `tests/unit/aboutState.test.ts` (신규 또는 UI 유틸 테스트)
  - **EC-47**: 첫 클릭 → `confirming` → 모달 닫음 → `idle`
  - `confirming` 상태에서 두 번째 클릭 → `isResetReady === true` (실행 호출은 호출자 책임)
  - `idle` 에서 두 번째 클릭 없음 → 실행 안 됨

### 검사

- [ ] `pnpm test` 통과
- [ ] `pnpm run check` 0/0
- [ ] 수동:
  - About 모달 열고 초기화 버튼 두 번 클릭 → 초기화 실행
  - 첫 클릭 후 모달 닫기 → 다시 열면 idle 상태
  - +layout.svelte 의 옛 Confirm 다이얼로그가 없어졌는지 확인

---

## Commit 3 — 상단 바 배치 + CSS 이중 정의 (FR-16.1 / FR-16.4 / FR-19)

### +layout.svelte 상단 바 배치 (FR-16.1)

- [ ] `+layout.svelte` 재편:
  - **하단 탭 유지** (오늘 / 프로그램 / 단계) — FR-16.1 명시
  - **상단 바 신규**: 오른쪽 정렬로 다음 4개 컨트롤
    1. 설치 버튼 (`install.available` 이 true 일 때만 렌더, EC-31)
    2. 테마 토글 (아이콘 · `theme.cycle()`)
    3. 화면 유지 토글 (`wakeLock.supported` 이 true 일 때만 렌더, EC-33)
    4. About 진입 (FR-19.1)
  - 왼쪽에는 앱 제목 "bigsix" (선택)
  - `beforeinstallprompt` / `appinstalled` 이벤트 리스너를 `install.svelte.ts` 로 이전. layout 은 이벤트 바인딩만 위임.
- [ ] `theme` / `wakeLock` / `install` 임포트 후 컴포넌트에서 소비
- [ ] `todayClock.start()` · `boot()` 호출부는 기존 유지

### CSS 이중 정의 (FR-16.4)

- [ ] `src/app.css` (신규) 또는 `+layout.svelte` `<style global>`:
  ```css
  /* 1. 기본 = 라이트 팔레트 */
  :root {
    --bg: #fafafa;
    --fg: #111113;
    --muted: #666;
    --card-bg: #fff;
    --card-border: #ddd;
    /* ... */
  }

  /* 2. 시스템 다크 모드 */
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #111113;
      --fg: #eee;
      --muted: #999;
      --card-bg: #1a1a1a;
      --card-border: #333;
    }
  }

  /* 3. 강제 다크 (테마 토글 이김) */
  :root[data-theme="dark"] {
    --bg: #111113;
    --fg: #eee;
    /* ... */
  }

  /* 4. 강제 라이트 (테마 토글이 시스템 다크 모드를 이김) */
  :root[data-theme="light"] {
    --bg: #fafafa;
    --fg: #111113;
    /* ... */
  }

  body { background: var(--bg); color: var(--fg); }
  ```
- [ ] 기존 `+layout.svelte` 의 `:global(html, body) { background: #111113; ... }` 하드코딩 색 (line 127~134) 을 CSS 변수로 대체
- [ ] 다른 컴포넌트의 하드코딩 색 (`.card.locked { background: #1a1a1a; ... }` 등) 도 변수화 (선택, 완성도)

### 저장 배너 · 초기화 배너 위치

- [ ] 상단 바가 생기므로 저장 실패·손상·미래 버전 배너 위치가 상단 바 바로 아래로 이동 (레이아웃만 조정, 로직 무변경)

### 테스트

- [ ] 통합 회귀: 기존 `boot.test.ts` / `storage.test.ts` 가 상단 바 도입으로 깨지지 않아야 함
- [ ] CSS 이중 정의는 단위 테스트 안 함 (수동 확인)

### 검사

- [ ] `pnpm test` 전부 통과 (예상 600~625개)
- [ ] `pnpm run check` 0/0
- [ ] 수동 확인 시나리오 (여러 조합):
  - **iOS Safari**: 설치 버튼 안 보임, 화면 유지 토글 안 보임 (미지원)
  - **Chrome 데스크톱**: 설치 버튼·화면 유지 토글 표시
  - **시스템 다크**: 다크 팔레트로 표시, 테마 = system
  - **테마 → 라이트**: 시스템이 다크여도 라이트 팔레트로 (FR-16.4)
  - **테마 → 다크**: 시스템이 라이트여도 다크 팔레트로
  - **테마 → 시스템**: `data-theme` 삭제, 미디어 쿼리 결과 따름
  - **화면 유지 켜기 → 백그라운드 → 복귀**: 잠금 재획득 (FR-16.6 / EC-35)
  - **화면 유지 켜기 → 절전 모드**: 토글 켜진 채, 잠금 미획득 상태 (EC-34) — UI 로 두 상태 구분 표시
  - **About 열기 → 초기화 두 번 클릭**: 상태 초기화
  - **About 열기 → 초기화 한 번 → 닫기 → 다시 열기**: idle (EC-47)
  - **업데이트 확인**: sw.checkNow 결과 문구 노출

---

## Phase 5 완료 후

- [ ] `git push` — 원격 `feature/ui` 브랜치 갱신 (PR 이 이 브랜치에 있으면 자동으로 갱신됨)
- [ ] **PR 을 병합하지 않는다** (ADR-21 / 사용자 결정)
- [ ] **이번 작업에서 배포하지 않는다** (ADR-21). Phase 5 의 산출은 배포 명령을 포함하지 않는다.
- [ ] 마지막 커밋 이후 `pnpm test` · `pnpm run check` 최종 확인
- [ ] SPEC2 EC-31~55 25건 모두 매핑된 테스트/수동 확인 경로 존재 확인 (GLOBAL 매핑 표 재검)

---

## Out of Scope (이 페이즈)

- 배포 실행 (`deploy.sh`) — ADR-21
- PR 병합 — 사용자 결정
- 아이콘 재제작 (1차 산출 그대로 유지)

## Traceability

| SPEC 항목 | 처리 |
|---|---|
| FR-16.1 | Commit 3 (상단 바 배치, 하단 탭 유지) |
| FR-16.2 | Commit 1 (install.svelte.ts) · Commit 3 (배치) |
| FR-16.3 | Commit 1 (theme.svelte.ts) · Commit 3 (배치) |
| FR-16.4 | Commit 3 (CSS 이중 정의) |
| FR-16.5 | Commit 1 (wakelock.svelte.ts) · Commit 3 (배치) |
| FR-16.6 | Commit 1 (visibilitychange 리스너) |
| FR-16.7 | Commit 1 (enabled/held 분리) |
| FR-16.8 | Commit 1 (try/catch localStorage) |
| FR-16.9 | Commit 1 (이식 · 복사 아님, 커밋 메시지에 무엇을 뺐는지 명시) |
| FR-19.1 | Commit 2 (`<dialog>` 모달) |
| FR-19.2 | Commit 2 (표시 항목 4가지) |
| FR-19.3 | Commit 2 (업데이트 확인 버튼 · sw.checkNow) |
| FR-19.4 | Commit 2 (2단계 확인, +layout 이관) |
| FR-19.5 | Commit 2 (CubeStudy About.svelte 이식) |
| EC-31~36 | Commit 1 신규 테스트 |
| EC-47 | Commit 2 aboutState.test 신규 |
| NFR-21 | 신규 UI 모듈 `// @vitest-environment happy-dom` |
| NFR-22 | Commit 1 (`supported` / `available` false 면 안 그림) · Commit 3 (렌더 분기) |
