# Phase 2 — TEST 체크리스트

## FR-23.1

- [ ] `tests/unit/nav.test.ts` — `tabsFor('/')` 결과 4개, 마지막이 `{ href: '/history', label: '기록', active: false }`.
- [ ] `tests/unit/nav.test.ts` — `tabsFor('/history')` 결과에서 기록 탭만 `active: true`.
- [ ] `tests/unit/nav.test.ts` — 순서가 오늘 · 프로그램 · 단계 · 기록.

## /history 라우트

- [ ] `src/routes/history/+page.svelte` 파일 존재, `export const prerender = true` 지정.
- [ ] 실행: `/history` 이동 시 `<h1>기록</h1>` 과 "준비 중" 안내 표시.

## 문서 문구

- [ ] `src/lib/ui/shell/nav.ts` 주석의 「3개 고정」 문구 없음.

## UI-8 (수동)

- [ ] 360px 폭 (Chrome DevTools iPhone SE) 에서 하단 네비 4탭 라벨이 잘리지 않음.
- [ ] 터치 타깃 52px (`+layout.svelte` `<nav>` 스타일 유지).

## NFR-25

- [ ] `pnpm check` 0/0.
- [ ] `pnpm test` 전부 통과, 테스트 수는 이전 페이즈 종료 시점 이상.
