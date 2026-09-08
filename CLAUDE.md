# bigsix

폴 웨이드 『죄수 운동법』 빅6 6종 × 10단계 진행 앱. SvelteKit 2 + Svelte 5(룬) +
adapter-static. **서버가 없다** — 전부 프리렌더한 정적 파일이다.

도메인 엔진은 시스템 시각을 읽지 않는다 — 날짜는 항상 인자로 받는다.
`src/lib/domain/**` 은 UI 를 모른다 (역참조 금지).

## 문서 지도

| 문서 | 무엇 |
|---|---|
| `README.md` | 도메인 사용 예, 규칙 요약, 데이터 출처 |
| `.dc_workspace/2026_09_05-ui-2/SPEC.md` | 이번 개정의 요구·수용 기준 |
| `.dc_workspace/2026_09_05-ui-2/GLOBAL.md` | 이번 개정의 ADR·데이터 모델·페이즈 |
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
- 터치 타깃 44px 이상. 하단 네비만 52px
- 접기는 CSS 로 한다. `{#if}` 로 DOM 에서 빼지 않는다 — 자리를 지켜야 하이드레이션과
  포커스가 흔들리지 않는다. 잠금은 색 하나가 아니라 투명도 + 커서 + `disabled` 로 표시
- 상태와 정체는 `data-*` 훅으로 낸다. 테스트와 CSS 가 같은 신호를 본다.
  기존 훅: `data-install`, `data-wake-lock`, `data-theme-toggle`, `data-about-open`,
  `data-about-close`, `data-check-update`, `data-update-message`, `data-reset`,
  `data-info`, `data-toast`. 같은 규약(`data-{역할}`)으로 늘린다
- UI 문구는 사실만 적는다. 백분율·격려·게이미피케이션 금지
- 문자열은 도메인이 준 것을 가공 없이 노출한다 (NFR-2). 시스템 시각을 UI 에서 부르지
  않는다 — 오늘 날짜는 `todayClock.today` 하나가 근원 (FR-4.4)

## 코드

- **룬만 쓴다.** `export let` · `$:` · `on:click` · `<slot>` · `svelte/store` 금지.
  파생은 `$derived`, 외부 세계와 맞물릴 때만 `$effect`
- **서버 기능은 존재하지 않는다.** `+page.server` · `+server` · form actions · 서버 훅 ·
  비공개 환경변수. 데이터는 정적 JSON 과 `localStorage` 뿐
- **도메인 계층 불가침.** `src/lib/domain/**` 은 이번 UI 작업에서 손대지 않는다.
  UI 는 도메인이 노출한 순수 함수를 부를 뿐이다
- 순수 로직은 룬을 쓰지 않는 순수 함수로 뺀다 (`src/lib/ui/nav.ts`, `todayScreen.ts`).
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

## 명령

```bash
pnpm dev            # 개발 서버 (PWA · 서비스 워커는 여기서 확인 안 된다)
pnpm check          # 타입 (svelte-check)
pnpm test           # 단위 (Vitest)
pnpm build          # 정적 빌드
pnpm preview        # 빌드 후 서빙. PWA 확인은 여기서만

grep -rnE '#[0-9a-fA-F]{3,6}\b' src --include='*.svelte'
# → `+layout.svelte:69` 의 `<meta name="theme-color">` 한 줄만 남아야 한다
```

푸시와 배포는 사용자의 명시적 지시가 있을 때만.
