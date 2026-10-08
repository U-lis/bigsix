# bigsix

폴 웨이드 『죄수 운동법』 빅6 6종 × 10단계 진행 앱. SvelteKit 2 + Svelte 5(룬) +
adapter-static. **서버가 없다** — 전부 프리렌더한 정적 파일이다.

도메인 엔진은 시스템 시각을 읽지 않는다 — 날짜는 항상 인자로 받는다.
`src/lib/domain/**` 은 UI 를 모른다 (역참조 금지).

## 문서 지도

| 문서 | 무엇 |
|---|---|
| `README.md` | 도메인 사용 예, 규칙 요약, 데이터 출처 |
| `.dc_workspace/2026_09_05-ui-2/SPEC.md` | UI 2차 개정 (SPEC2) — 이력 |
| `.dc_workspace/2026_09_05-ui-2/GLOBAL.md` | UI 2차 개정 (SPEC2) ADR — 이력 |
| `.dc_workspace/2026_09_18-history-export/SPEC.md` | SPEC3 요구·수용 기준 — 이력 |
| `.dc_workspace/2026_09_18-history-export/GLOBAL.md` | SPEC3 ADR·데이터 모델·페이즈 — 이력 |
| `.dc_workspace/2026_09_25-push-notification/SPEC.md` | SPEC4 푸시 알림 요구·ADR — 이력 |
| `.dc_workspace/2026_09_25-push-notification/GLOBAL.md` | SPEC4 ADR·데이터 모델·페이즈 — 이력 |
| `.dc_workspace/2026_10_08-session-flow/SPEC.md` | **이번 개정 (SPEC5)** 세션 흐름 요구·수용 기준 |
| `.dc_workspace/2026_10_08-session-flow/GLOBAL.md` | **이번 개정 (SPEC5)** ADR·데이터 모델·페이즈 |
| `docs/PROGRESSIONS.md` | 기준 수치표와 진급 판정 규칙 |
| `docs/LOGIC.md` | 조정 가능한 상수 |

참조 구현: `~/Documents/cube-study` — 앱 껍데기(상단 바·테마·wake lock·About·토스트)와
`data-*` 훅 규약의 원본. 로직이 아니라 **표현 계층 규약**을 여기서 가져온다.

## 화면을 만들거나 고칠 때

- 색은 `src/lib/styles/app.css` 토큰으로만 쓴다. 컴포넌트에 hex 를 적지 않는다.
  예외는 브라우저 API 가 리터럴을 요구하는 자리뿐(`<meta name="theme-color">`)
- 색만으로 알리지 않는다 — 같은 자리에 문구가 함께 선다
- 아이콘만 있는 버튼을 만들지 않는다. 상태는 색이, 정체는 글자가 맡는다.
  좁은 화면에서 접을 때에도 라벨은 최대한 남긴다 (`+layout.svelte` 상단 바 참고)
- 터치 타깃 44px 이상. 하단 네비만 52px. 하단 네비는 **4탭** (오늘 · 프로그램 · 단계 · 기록)
- 접기는 CSS 로 한다. `{#if}` 로 DOM 에서 빼지 않는다 — 자리를 지켜야 하이드레이션과
  포커스가 흔들리지 않는다. 잠금은 색 하나가 아니라 투명도 + 커서 + `disabled` 로 표시
- 상태와 정체는 `data-*` 훅으로 낸다. 테스트와 CSS 가 같은 신호를 본다.
  같은 규약(`data-{역할}`)으로 늘린다.
  **앱 껍데기·오늘 화면**: `data-install`, `data-wake-lock`, `data-theme-toggle`,
  `data-about-open`, `data-about-close`, `data-check-update`, `data-update-message`,
  `data-reset`, `data-info`, `data-toast`.
  **동작 설명 (Phase 2.5)**: `data-howto`, `data-howto-toggle`, `data-howto-step`(값: 단계 번호),
  `data-howto-video`(값: 단계 번호, 시범 영상 외부 링크 — `ui/session/videos.ts`).
  **하단 네비**: `data-nav`, `data-nav-tab`.
  **기록 탭 (Phase 4~7)**:
  `data-history-view`(값: `'day'|'progression'`, HistoryView 루트),
  `data-history-loading`(로딩 중 안내),
  `data-history-empty`(기록 없음 안내 영역),
  `data-history-toggle`(날짜별/종목별 SegToggle 그룹),
  `data-day-row`(값: `YYYY-MM-DD`),
  `data-day-status`(값: `'rest'|'done'|'partial'|'missed'`),
  `data-day-status-label`(값: 같음, 색이 아니라 글자로 서는 상태 문구),
  `data-day-note`(값: `'stint-started'|'proposal-accepted'`, 루틴 갈아탄 날),
  `data-day-planned`(그날 계획 목록),
  `data-day-session`(값: `id:{index}`),
  `data-day-sets`(세트 값 목록), `data-day-target`(저장된 목표), `data-day-rpe`(세션 RPE),
  `data-day-promoted`(승급 표기), `data-day-blocked`(승급 보류 사유),
  `data-day-more`(이전 30일 더 보기 버튼),
  `data-history-progression`(값: `ProgressionId`, 종목 선택 ChipGroup),
  `data-prog-row`(값: `YYYY-MM-DD:{idx}`),
  `data-prog-meets`(값: `'yes'|'no'|''`),
  `data-prog-boundary`(값: 단계 번호, 단계 경계 행),
  `data-prog-empty`(종목 기록 없음 안내),
  `data-prog-legend`(단계명 범례),
  **내보내기·가져오기 (Phase 6~7)**:
  `data-export-bar`(내보내기·가져오기 영역),
  `data-export-json`, `data-export-csv`, `data-import`(버튼),
  `data-export-status`(값: `'downloaded'|'shared'|'unavailable'`),
  `data-import-dialog`(확인 다이얼로그 루트),
  `data-import-error`(값: `'not-json'|'shape'|'future-version'|'schema-missing'`),
  `data-import-block`(값: `'inprogress'`)
  **설정 화면 (Phase 4)**:
  `data-settings-open`(상단 바 설정 링크),
  `data-push-state`(값: `'loading'|'unsupported'|'denied'|'off'|'on'`),
  `data-push-enable`, `data-push-disable`, `data-push-time`,
  `data-push-error`(값: 오류 code), `data-push-need-program`,
  `data-push-test`(dev 빌드 전용 테스트 발송 버튼).
  **오늘 화면 카드 (기존)**:
  `data-today`(값: `'plan'|'no-program'`, 오늘 화면 루트),
  `data-goto-programs`(프로그램 선택 링크),
  `data-progression`(값: 종목 ID, 운동 카드 루트), `data-step`(값: 단계 번호),
  `data-kind`(값: `'work'|'consolidation'|'free'`, 칸 종류),
  `data-active`(값: `'true'|'false'`, 진행 중 칸 여부),
  `data-locked`(값: `'true'`, 잠긴 종목 카드), `data-lock-reason`(잠김 사유 — FreeExerciseForm · 단계 화면).
  **공통 확인 다이얼로그 (Confirm)**:
  `data-confirm`(다이얼로그 루트), `data-confirm-cancel`(취소), `data-confirm-yes`(확인).
  **횟수 입력 (RepsInput)**:
  `data-reps-input`(입력 루트), `data-reps-value`(숫자 입력), `data-reps-submit`(확정),
  `data-reps-error`(오류 메시지).
  **자유 운동 폼 (FreeExerciseForm)**:
  `data-free-open`(폼 열기 버튼), `data-free-form`(폼 루트),
  `data-free-progression`(종목 선택), `data-free-step`(단계 선택),
  `data-free-error`(오류), `data-free-cancel`(취소), `data-free-save`(저장).
  **오늘 화면 세션 흐름 (SPEC5)**:
  `data-finish`(「오늘 운동 마치기」 버튼),
  `data-finish-bar`(FinishBar 루트),
  `data-finish-dialog`(기록 확인 다이얼로그 루트),
  `data-finish-row`(값: 칸 키, 다이얼로그 행),
  `data-finish-result`(기록 결과 안내),
  `data-finish-fail`(값: 칸 키, 기록 실패 안내),
  `data-finish-cancel`(다이얼로그 취소),
  `data-finish-confirm`(다이얼로그 확인),
  `data-set-row`(값: 세트 1-based 번호), `data-set-short`(미달 세트), `data-set-extra`(추가 세트),
  `data-set-edit`, `data-set-delete`,
  `data-abandon-mark`(값: `'on'|'off'`), `data-abandoned`(중단 표시된 카드),
  `data-draft-blocked`(값: `'true'`, 날짜 지난 칸으로 인한 입력 차단),
  `data-draft-blocked-reason`(차단 사유 문구),
  `data-stale-banner`(StaleBanner 루트),
  `data-stale-drafts`(값: `YYYY-MM-DD`, 날짜별 미완료 블록),
  `data-stale-record`(그 날짜로 기록 버튼), `data-stale-discard`(버리기 버튼),
  `data-stale-discard-confirm`(버리기 2단 확인), `data-stale-discard-cancel`(버리기 2단 취소),
  `data-stale-result`(값: `YYYY-MM-DD`, 기록 결과 안내),
  `data-stale-fail`(값: 칸 키, 기록 실패 안내).
- UI 문구는 사실만 적는다. 백분율·격려·게이미피케이션 금지
- 문자열은 도메인이 준 것을 가공 없이 노출한다 (NFR-2). 시스템 시각을 UI 에서 부르지
  않는다 — 오늘 날짜는 `todayClock.today` 하나가 근원 (FR-4.4)

## 코드

- **룬만 쓴다.** `export let` · `$:` · `on:click` · `<slot>` · `svelte/store` 금지.
  파생은 `$derived`, 외부 세계와 맞물릴 때만 `$effect`
- **SvelteKit 서버 기능은 없다. 홈서버 cron(`cron/`) 하나가 있다.** `+page.server` · `+server` · form actions · 서버 훅 · 비공개 환경변수는 없다. 클라이언트 데이터는 정적 JSON 과 `localStorage` 뿐. `cron/` 는 서버에서 Node 로 직접 실행하는 스크립트로, SvelteKit 과 무관하다
- **도메인 계층 불가침.** `src/lib/domain/**` 은 이번 UI 작업에서 손대지 않는다.
  UI 는 도메인이 노출한 순수 함수를 부를 뿐이다
- **도메인 참조는 `$lib/domain`(값) · `$lib/domain/types`(타입) 로만.**
  `$lib/domain/schedule` · `../domain/date` 식으로 내부 파일을 직접 부르지 않는다.
  필요한 함수가 index 에 없으면 index 에 export 를 더한다 (FR-29.1 / ADR-21)
- **`src/` 안 import 표기.** 층을 넘으면 `$lib/...` 별칭, 같은 층은 상대 경로.
  확장자 표기 금지 (`state.svelte.ts` 는 `state.svelte` 로 — 컴포넌트 `.svelte` 는 해석에
  필요하므로 유지). 예외 — `src/lib/domain/**` 은 상대 경로 + `.ts` 확장자를 유지하고
  `$lib` 를 쓰지 않는다 (plain Node 로도 돈다 — `tests/unit/tz-probe` · `runUnderTZ`
  가 그렇게 도메인을 직접 띄운다) (FR-29.2 / ADR-27)
- **`src/lib/ui/` 는 역할별 하위 폴더로 나눈다.** 직속에 파일을 두지 않는다.
  현재 폴더: `shell` (앱 껍데기 — 상단 바 · About · sw), `state` (storage · state ·
  boot · today · reset), `common` (재사용 폼), `today` (오늘 화면 파생),
  `session` (진행 중 세션 · 타이머 · 알림 · 세션 컴포넌트), `history`
  (기록 탭, Phase 4 에서 추가), 그리고 `push`
  (알림 켜기·끄기·자동 동기화, SPEC4 에서 추가) (FR-29.3 / ADR-26, ADR-30)
- 순수 로직은 룬을 쓰지 않는 순수 함수로 뺀다 (`ui/shell/nav.ts`, `ui/today/todayScreen.ts`).
  `localStorage` 나 브라우저 상태에 닿지 않으므로 SSR/하이드레이션이 어긋나지 않는다
- `{화면}/+page.svelte` 는 `padding: 1rem 0` 만. 좌우 padding · `max-width` · `margin`
  · `padding-bottom: 5rem` 을 다시 주지 않는다 — `.shell` 과 `main` 이 이미 준다
- 하단 네비는 sticky 다 (`position: fixed` 아님). `padding-bottom` 으로 자리를
  비워두지 않는다

## 규약을 어긴 실제 사례

- 색 하드코딩 227건 (0.1.0) → 라이트 테마 토글이 상단 바에만 먹었다. 커밋 `f6e6c11`
  에서 토큰화. 재발 방지는 이 문서와 `pnpm test` 후 hex grep
- 상단 바의 wake lock · 테마 버튼이 초기에 아이콘만이었다 → "무슨 버튼인지 모르겠다"
  지적을 받고 라벨을 붙였다. 이 문서 "화면" 절의 아이콘 규칙이 그 결과
- 도메인 내부 파일 직접 참조 6곳 · `.ts` 확장자 흔적 · `src/lib/ui/` 평평함 —
  2026-09-18 SPEC3 진입 전 구조 점검에서 발견. FR-29 (Phase 1) 로 정정.
  재발 방지는 `tests/unit/structure.test.ts` (ADR-27 네 규칙을 정적으로 못박음)
- `PushRelay.state()` 를 동기로 타입한 버그 (0.3.0-dev) — 실제 `client.js` 의 `state` · `enable` · `disable` 는 `async function` 이다. `relay.ts` 에서 동기 반환 타입으로 선언해, `await` 없이 Promise 를 비교하면 항상 `!== 'on'` 이 참. 영향: 알림 켜기 버튼 항상 비활성, 자동 동기화 항상 early return, teardown 미작동. 원인: 단위 테스트가 동기 mock 을 써서 이 불일치를 숨겼다. 재발 방지: 외부 비동기 API 를 타이핑할 때 실제 반환 타입(`Promise<…>`)을 확인한다. 동기 편의 래퍼가 없다면 mock 도 async 로 맞춘다

## 명령

```bash
pnpm dev            # 개발 서버 (PWA · 서비스 워커는 여기서 확인 안 된다)
pnpm check          # 타입 (svelte-check)
pnpm test           # 단위 (Vitest)
pnpm build          # 정적 빌드
pnpm preview        # 빌드 후 서빙. PWA 확인은 여기서만

grep -rnE '#[0-9a-fA-F]{3,6}\b' src --include='*.svelte'
# → `+layout.svelte:79` 의 `<meta name="theme-color">` 한 줄만 남아야 한다
```

푸시와 배포는 사용자의 명시적 지시가 있을 때만.
