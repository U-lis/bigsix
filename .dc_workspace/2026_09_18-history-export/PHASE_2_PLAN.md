# Phase 2 — 4탭 확장 + /history 라우트 stub

**목표**
하단 네비를 4탭으로 늘리고 `/history` 라우트에 「기록」 stub 화면을 세운다. 실제 내용은 Phase 4~7 이 채운다. 이 페이즈에서 4탭 라벨 · 순서 · 활성 판정이 확정된다.

## SPEC 참조

- FR-23.1: 하단 네비에 「기록」 탭 추가. 순서는 오늘 · 프로그램 · 단계 · 기록.
- UI-8: 4탭이 되어도 360px 폭에서 라벨이 잘리지 않는다.
- Constraints: `+layout.svelte` 에는 탭 추가 외에 아무것도 더하지 않는다.

## 변경 파일

- `src/lib/ui/shell/nav.ts` — `TABS` 에 `{ href: '/history', label: '기록' }` 를 추가. 주석의 「3개 고정」 → 「4개 고정」, 「3탭」 관련 서술 갱신.
- `src/routes/history/+page.svelte` (신규) — `<script>` 에 `export const prerender = true;`. 본문은 `<h1>기록</h1>` 한 줄과 "준비 중" 안내 한 줄. 스타일은 최소.
- `tests/unit/nav.test.ts` — 4탭 반영. `tabsFor('/history')` 활성 판정 케이스 추가.

## 커밋 경계 (1개)

`feat(ui): 하단 네비에 기록 탭 추가 + /history stub`

## 완료 기준

- `pnpm check` 오류/경고 0.
- `pnpm test` — 이전 통과 수 이상 (nav.test 케이스 추가로 +2 정도).
- 실행: 4탭이 뜨고, `/history` 클릭 시 「기록」 stub 화면 표시.
- 360px 폭에서 4탭 라벨 잘림 없음 (수동 확인).

## 임시 배포

이 페이즈에 포함하지 않는다.

## PLAN 정오

- **`<script>` → `<script module lang="ts">`**: SvelteKit 에서 `prerender` 등 page option 은 반드시 module context(`<script module>`) 에서 export 해야 한다. Svelte 5 에서 `<script context="module">` 이 `<script module>` 로 교체됐으므로 코더의 `<script module lang="ts">` 가 올바른 위치다. 원래 PLAN 의 `<script>` 지시는 잘못된 서술이었다.
- **`+layout.ts` 와의 중복**: 루트 `src/routes/+layout.ts` 가 이미 `export const prerender = true` 를 선언하고 있어 `/history/+page.svelte` 의 같은 선언은 중복이다. 그러나 이 화면이 정적 빌드 대상임을 파일 자체에서도 명시한다는 문서화 목적이 있으므로 유지가 타당하다 (파일 주석 참고).

## Completion Checklist

- [x] `src/lib/ui/shell/nav.ts`: `TABS` 에 `{ href: '/history', label: '기록' }` 추가. Verified in `src/lib/ui/shell/nav.ts:39`.
- [x] `src/lib/ui/shell/nav.ts`: 주석 「3개 고정」 → 「4개 고정」, 「3탭」 → 「4탭」 갱신. Verified in `src/lib/ui/shell/nav.ts:9`.
- [x] `src/routes/history/+page.svelte` 신규 생성. `<script module lang="ts">` 에 `export const prerender = true` 지정 (PLAN 정오 참고). `<h1>기록</h1>` + `<p>준비 중입니다.</p>` 본문 포함. Verified in `src/routes/history/+page.svelte`.
- [x] `tests/unit/nav.test.ts`: 4탭 반영 + `tabsFor('/history')` 활성 판정 케이스 추가. Verified in `tests/unit/nav.test.ts:48-55`.
- [x] `pnpm check` 0/0. Verified: svelte-check 472 files, 0 errors, 0 warnings (2026-09-21).
- [x] `pnpm test` 665 (기존 664 +1). FR-23.1 세 항목 모두 어서션으로 커버됨. PLAN 예상 "+2 정도" 대비 +1 이지만, 기존 테스트를 수정해 항목 1·3을 흡수하고 항목 2만 신규 it() 로 추가한 결과다. Verified: 665 tests passed (29 files).
- [x] 완료 기준 전부 충족: `pnpm check` 0/0, `pnpm test` 665.
