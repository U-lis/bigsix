# Phase 5 — TEST (FR-16 / FR-19)

## 테스트 러너

- `pnpm test`
- 브라우저 API 를 쓰는 신규 UI 모듈은 `// @vitest-environment happy-dom` (NFR-21)
- About 다이얼로그는 컴포넌트 마운트 없이 로직 헬퍼 단위 테스트 (NFR-14)

---

## Commit 1 — wakelock · theme · install 이식

### `tests/unit/wakelock.test.ts` (신규)

첫 줄: `// @vitest-environment happy-dom`

- [ ] "`navigator.wakeLock` 없으면 supported === false" (**EC-33**)
- [ ] "supported === true 일 때 toggle() 이 enabled 를 반전"
- [ ] "enabled=true 시 request() 시도"
- [ ] "request() 가 reject 되면 held === false, enabled === true 유지" (**EC-34**)
- [ ] "visibilitychange 로 다시 잡음 — hidden → visible 시 재요청" (**EC-35**)
- [ ] "localStorage 접근이 throw 해도 크래시 안 함" (**EC-36 · FR-16.8**)
- [ ] "저장된 값이 있으면 부팅 시 자동 요청 (enabled 복원)"
- [ ] "재초기화 후 상태 복원"

### `tests/unit/theme.test.ts` (신규)

첫 줄: `// @vitest-environment happy-dom`

- [ ] "초기 = 'system' 이면 documentElement.dataset.theme 없음"
- [ ] "cycle() 순환: system → light → dark → system"
- [ ] "'light' 설정 시 dataset.theme === 'light'"
- [ ] "'dark' 설정 시 dataset.theme === 'dark'"
- [ ] "'system' 설정 시 dataset.theme 삭제"
- [ ] "localStorage 저장 실패해도 세션에는 적용" (**EC-36 · FR-16.8**)
- [ ] "저장된 값 복원 — 새 세션 시작 시 dataset.theme 복원"

### `tests/unit/install.test.ts` (신규)

첫 줄: `// @vitest-environment happy-dom`

- [ ] "beforeinstallprompt 이벤트 없으면 available === false" (**EC-31**)
- [ ] "beforeinstallprompt 이벤트 수신 → 저장 → available === true"
- [ ] "prompt() 호출 → deferred 이벤트의 prompt() 실행 · 보관분 비움" (**EC-32**)
- [ ] "prompt() 재호출 no-op" (EC-32 심화)
- [ ] "appinstalled 이벤트 → 보관분 파기"

---

## Commit 2 — About + 초기화 이관

### `tests/unit/aboutState.test.ts` (신규) — 또는 관련 유틸 파일 안

- [ ] "초기 상태 === 'idle'"
- [ ] "'idle' 에서 click → 'confirming'"
- [ ] "'confirming' 에서 click → isResetReady === true (실행 위임)"
- [ ] "'confirming' 에서 closeModal → 'idle'" (**EC-47**)
- [ ] "'idle' 에서 closeModal → 'idle' (no-op)"
- [ ] "isResetReady(idle) === false"
- [ ] "isResetReady(confirming) === false — 한 번 더 클릭해야 ready"
  - 위 정의를 다시: isResetReady 는 "두 번째 click 시점의 반환" 이 true 여야 함. 정확한 API 를 설계 단계에서 확정
  - 대안 API: `handleClick(state): { next: ResetState, execute: boolean }` — `confirming → click` 이면 `{ next: 'idle', execute: true }`

### `tests/unit/inprogress.test.ts` 확장

- [ ] "resetToInitial + clearInProgress 동시 호출 시 두 봉투 모두 초기 상태"

### 자동 테스트 없음 (수동)

- [ ] About `<dialog>` 열림/닫힘
- [ ] 업데이트 확인 버튼 → sw.checkNow 호출 결과 문구
- [ ] +layout 옛 Confirm 삭제 확인

---

## Commit 3 — 상단 바 배치 + CSS

### 자동 테스트

- [ ] 기존 테스트 회귀만 확인 (`pnpm test` 전부 통과)
- [ ] CSS 는 단위 테스트 안 함

### 수동 확인 매트릭스 (여러 브라우저 · 여러 모드)

| 시나리오 | 확인 항목 |
|---|---|
| iOS Safari | 설치 버튼 X, 화면 유지 토글 X, 테마 토글 O, About O |
| Chrome 데스크톱 | 설치 버튼 조건에 따라 O (첫 방문 후), 화면 유지 O, 테마 O, About O |
| Chrome 안드로이드 | 설치 O, 화면 유지 O, 테마 O, About O |
| 시스템 다크 · 테마 = system | 다크 팔레트, `data-theme` 없음 |
| 시스템 다크 · 테마 = light | **라이트 팔레트로 이김** (FR-16.4) |
| 시스템 라이트 · 테마 = dark | **다크 팔레트로 이김** (FR-16.4) |
| 화면 유지 켜기 → 백그라운드 → 복귀 | 잠금 재획득 (EC-35) |
| 화면 유지 켜기 → 절전 모드 | 토글 켜진 채, 실제 잠금 안 잡힘 상태 표시 (EC-34) |
| About → 초기화 두 번 클릭 | 상태 초기화 · /steps 로 |
| About → 초기화 한 번 → 닫기 → 다시 열기 | idle (EC-47) |
| 업데이트 확인 | sw.checkNow 호출 문구 |

---

## 검사 절차

### Commit 1 종료 후

1. `pnpm test` — 신규 UI 테스트 케이스 통과
2. `pnpm run check` 0/0
3. `grep -rn "// @vitest-environment" tests/unit/wakelock.test.ts tests/unit/theme.test.ts tests/unit/install.test.ts` — 각 파일 1건
4. `grep -rn "\.wakeLock\|beforeinstallprompt" src/lib/ui/` — 정의 파일에만 존재

### Commit 2 종료 후

1. `pnpm test` 전부 통과
2. `pnpm run check` 0/0
3. `+layout.svelte` 에서 `Confirm` 관련 코드 삭제 확인 (`grep -n Confirm src/routes/+layout.svelte` — About 진입점 외 없음)
4. EC-47 케이스 존재

### Commit 3 종료 후

1. `pnpm test` 전부 통과 (예상 600~625개)
2. `pnpm run check` 0/0
3. 상단 바 렌더 · 테마 이중 정의 · 배너 위치 등 수동 확인 매트릭스 통과
4. GLOBAL Completion Criteria 재검:
   - [ ] Phase 1~5 전부 완료
   - [ ] SPEC2 FR-16~22 전 항목
   - [ ] SPEC2 NFR-19~22 전 항목
   - [ ] EC-31~55 매핑 완결
   - [ ] `pnpm test` 통과 (예상 600~625)
   - [ ] `pnpm run check` 0/0
   - [ ] `grep -rn "new Date()\|Date.now()" src/lib/domain/` 결과 0건 (NFR-5a)
   - [ ] `grep -rn "import.*svelte\|window\.\|localStorage\|node:" src/lib/domain/` 결과 0건 (NFR-3)

### Phase 5 최종 (push)

- [ ] `git push origin feature/ui` — 원격 브랜치 갱신
- [ ] PR 이 있다면 자동 갱신됨 — **병합하지 않는다** (ADR-21)
- [ ] **배포 명령 실행하지 않는다** (ADR-21)

---

## Edge Case 커버

| EC | 처리 |
|---|---|
| EC-31 | install.test |
| EC-32 | install.test |
| EC-33 | wakelock.test |
| EC-34 | wakelock.test |
| EC-35 | wakelock.test |
| EC-36 | wakelock.test · theme.test |
| EC-47 | aboutState.test |

## 통과 기준

- [ ] `pnpm test` 전부 통과 (약 600~625개)
- [ ] `pnpm run check` 0/0
- [ ] FR-16 · FR-19 전 하위 항목 반영
- [ ] NFR-21 (happy-dom 환경) 신규 UI 파일에 명시
- [ ] NFR-22 (미지원 환경에서 안 그림) 렌더 분기 확인
- [ ] 수동 확인 매트릭스 통과
