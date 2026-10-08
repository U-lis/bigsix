# Phase 6: docs-and-deploy

## 목표

README · CHANGELOG · CLAUDE.md 를 갱신하고, feature 브랜치를 임시 배포해 14개 체크리스트를 수행한다.

## 선행 조건

Phase 5 완료.

## 지침

### 1. `README.md` 갱신

아래 항목만 수정한다. 기존 구조는 그대로 유지한다.

- 세션 흐름 설명 추가 — 「여러 종목을 번갈아 하더라도 각 종목의 세트는 독립적으로 보관되며, 「오늘 운동 마치기」 하나로 모든 종목을 기록한다」.
- 계획 초과 세트 → 자유 운동 자동 분리 동작 설명.
- 「날을 넘긴 미완료 기록」 처리 방식 설명.

### 2. `CHANGELOG.md` 갱신

`[Unreleased]` 섹션 최상단에 아래 항목을 추가한다 (Keep a Changelog 형식, 영문 내용).

```markdown
## [Unreleased]

### Added
- Multiple in-progress drafts per session: sets for each exercise are kept independently
- FinishBar and FinishDialog: a single "Finish today's workout" button records all drafts at once
- Extra sets beyond the plan are automatically recorded as free exercises
- StaleBanner: prompts to record or discard drafts from a previous day on next entry

### Changed
- "Impossible" button renamed to "Abandon this step" with toggle behavior; recorded at finish time
- Free exercise form opens a draft instead of recording immediately
- Storage schema: in-progress envelope bumped to v5 (app state remains v4; rollback does not affect records)

### Removed
- Per-exercise "Record session" button (data-finalize)
```

### 3. `CLAUDE.md` 갱신

두 곳을 수정한다.

**훅 목록 (`data-*` 절)**:

- **오늘 화면** 섹션에 아래를 추가한다:
  ```
  **오늘 화면 세션 흐름 (SPEC5)**:
  `data-finish`(「오늘 운동 마치기」 버튼),
  `data-finish-dialog`(기록 확인 다이얼로그 루트),
  `data-finish-row`(값: 칸 키, 다이얼로그 행),
  `data-set-row`(값: 세트 1-based 번호), `data-set-short`(미달 세트), `data-set-extra`(추가 세트),
  `data-set-edit`, `data-set-delete`,
  `data-abandon-mark`(값: `'on'|'off'`),
  `data-stale-drafts`(값: `YYYY-MM-DD`), `data-stale-record`, `data-stale-discard`.
  ```
- 기존 `data-finalize` · `data-abandon` · `data-stale` 항목이 있으면 제거한다.

**문서 지도 표** (`## 문서 지도`):

- SPEC4 행을 「SPEC4 푸시 알림 요구·ADR — 이력」으로 바꾼다.
- 아래 두 행을 현행으로 추가한다:
  ```
  | `.dc_workspace/2026_10_08-session-flow/SPEC.md`   | **이번 개정 (SPEC5)** 세션 흐름 요구·수용 기준 |
  | `.dc_workspace/2026_10_08-session-flow/GLOBAL.md` | **이번 개정 (SPEC5)** ADR·데이터 모델·페이즈 |
  ```

### 4. 임시 배포

```bash
./deploy/deploy.sh feature/session-flow
```

배포 후 아래 14개 체크리스트를 실기기(폰)에서 수행한다.

#### 14개 폰 체크리스트

1. 마이그레이션: 배포 전 입력한 진행 중 세트가 배포 후에도 남아 있다.
2. 두 종목을 번갈아 세트를 입력한다 — 양쪽 세트가 모두 남아 있다.
3. 「오늘 운동 마치기」로 두 종목이 모두 기록된다.
4. 계획 세트 수를 넘는 세트를 입력하고 마치면 초과분이 자유 운동으로 기록된다.
5. 미달 세트에 「{값} / 목표 {목표} · 미달」 문구가 표시된다.
6. 「이 단계 중단」 → 다지기 카드 열기 → 마치기 → 중단 + 다지기 기록이 남는다.
7. 중단 취소 시 연결된 다지기 카드 닫기 확인이 뜬다.
8. 자유 운동 흐름 — 폼 → 칸 열기 → 세트 쌓기 → 마치기 기록. 잠긴 종목은 폼에서 선택할 수 없음 (FR-43.2).
9. 날을 넘긴 미완료 칸 — 「그 날짜로 기록」이 그 날짜로 기록한다.
10. 날을 넘긴 미완료 칸 — 「버리기」가 2단 확인 후 삭제한다.
11. 진행 중 칸이 있을 때 가져오기(JSON)가 차단된다.
12. 전체 초기화가 모든 칸을 지운다.
13. 푸시 알림이 여전히 동작한다 (설정 화면 확인).
14. PWA 가 새 버전으로 업데이트된다.

## 완료 체크리스트

- [x] `README.md` 세션 흐름 설명 추가됨
- [x] `CHANGELOG.md` `[Unreleased]` 항목 추가됨
- [x] `CLAUDE.md` 훅 목록에 SPEC5 훅 추가, 기존 삭제된 훅 제거됨
- [x] `CLAUDE.md` 문서 지도 SPEC5 항목 추가됨
- [ ] `./deploy/deploy.sh feature/session-flow` 완료
- [ ] 14개 폰 체크리스트 전부 통과
- [x] `pnpm check` 오류 0
- [x] `pnpm test` 전부 통과 (베이스라인 920)

## 비고

- `deploy.sh` 는 prod 모드로 실행한다. 서비스워커가 업데이트되어야 PWA 갱신이 확인된다(체크리스트 14).
- 푸시 알림 체크리스트(13)는 `/settings` 화면에서 켜짐 상태를 확인하는 것으로 갈음한다.

## 알려진 긴장 (수정 대상 아님)

`src/lib/ui/history/ImportDialog.svelte:95` — 진행 중 기록(`hasInProgress`)이 있을 때 가져오기
`<label>` 을 `{#if}` 로 DOM 에서 제거한다. CLAUDE.md 는 접기를 CSS(`opacity`/`pointer-events`/
`aria-hidden`)로 하고 `{#if}` 로 DOM 에서 빼지 않는다는 규약을 정한다. 이 파일은 이전 커밋
(main 브랜치)에서 이 구조로 만들어졌고, SPEC5 작업 범위가 아니라 그대로 둔다.
후속 작업에서 CSS 접기로 전환할 때 수정한다.
