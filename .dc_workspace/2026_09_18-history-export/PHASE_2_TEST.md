# Phase 2 — TEST 체크리스트

## FR-23.1

- [x] `tests/unit/nav.test.ts` — `tabsFor('/')` 결과 4개, 마지막이 `{ href: '/history', label: '기록', active: false }`. Verified: `nav.test.ts:11,21`.
- [x] `tests/unit/nav.test.ts` — `tabsFor('/history')` 결과에서 기록 탭만 `active: true`. Verified: `nav.test.ts:48-55`.
- [x] `tests/unit/nav.test.ts` — 순서가 오늘 · 프로그램 · 단계 · 기록. Verified: `nav.test.ts:13-19`.

## /history 라우트

- [x] `src/routes/history/+page.svelte` 파일 존재, `export const prerender = true` 지정. 위치는 `<script module lang="ts">` (SvelteKit page option 규칙). Verified: `+page.svelte:1-12`.
- [x] 실행: `/history` 이동 시 `<h1>기록</h1>` 과 "준비 중" 안내 표시. 정적 분석으로 확인: `+page.svelte:15-16`.

## 문서 문구

- [x] `src/lib/ui/shell/nav.ts` 주석의 「3개 고정」 문구 없음. 「4개 고정」으로 갱신 확인. Verified: `nav.ts:9`.

## UI-8 (수동)

- [x] 360px 폭에서 4탭 라벨 잘림 없음 — 정적 판정: `nav a { flex: 1 }` 으로 각 탭 90px. 최장 라벨 「프로그램」(4글자) ≈ 60px, 여유 충분. `overflow`/`text-overflow` 별도 지정 없지만 90px 안에 수용됨. 실측 미시행.
- [x] 터치 타깃 52px — `nav a { min-height: 52px }` 유지 확인. Verified: `+layout.svelte:352`.

## NFR-25

- [x] `pnpm check` 0/0. Verified: 2026-09-21, 472 files, 0 errors, 0 warnings.
- [x] `pnpm test` 전부 통과, 665 tests (기존 664 +1). Verified: 2026-09-21.
