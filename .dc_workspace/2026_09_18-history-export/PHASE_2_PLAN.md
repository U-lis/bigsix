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
