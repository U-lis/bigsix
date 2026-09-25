# Phase 1: 파일 이동만 (git rename)

**목적**: 저장소 구조를 SvelteKit 앱 배치로 옮긴다. **내용은 한 바이트도 바꾸지 않는다.**
Git 이 rename 으로 인식해야 한다 (Risk 1 방지).

**SPEC 커밋 경계**: (1) 파일 이동만 (Notes 「커밋 분리 지침」)
**커밋 수**: 1
**병렬**: 없음
**Dependencies**: 없음 (첫 페이즈)

---

## 완료 정의

- [ ] `src/*.ts` 14개가 `src/lib/domain/*.ts` 로 이동 (FR-0.2)
- [ ] `data/progressions.json` 이 `src/lib/data/progressions.json` 로 이동 (FR-0.3)
- [ ] `test/*.test.ts` 12개 + `test/helpers.ts` + `test/tz-probe.ts` = 14개가 `tests/unit/` 로 이동 (FR-0.4 위치 부분)
- [ ] `git log --stat -M -C -1` 이 위 파일들을 전부 **rename** 으로 표시 (Risk 1)
- [ ] **파일 내용은 어느 파일도 바뀌지 않았다** — `git show HEAD --stat` 의 "insertions/deletions" 가 0
- [ ] 옛 위치 (`src/`, `data/`, `test/`) 는 남지 않는다 (빈 디렉터리 포함)

**이 커밋 시점에 `npm test` / `pnpm test` 는 실행되지 않는다** — 도구가 아직 새 경로를 모른다.
이는 정상이며 Phase 2 가 해결한다 (GLOBAL.md 「기존 테스트 474개 처리 방침」 참조).

---

## 사전 조건 확인

- [ ] 현재 브랜치가 `feature/ui` 다 (`git branch --show-current`)
- [ ] `feature/ui` 는 `main` (`832424a`) 에서 갈라졌다 (`git merge-base feature/ui main`)
- [ ] 워킹트리에 커밋되지 않은 변경이 없다 (`git status --porcelain` 의 출력 중 `deploy/nginx/bigsix.conf`
      제외한 것이 비어 있다 — 이 파일은 이미 커밋 대기 상태로 인정. Phase 5 에서 다룬다)
- [ ] `.dc_workspace/` 는 이번 페이즈에서 손대지 않는다 (문서 디렉터리)

---

## 파일 이동 체크리스트 (FR-0.2, FR-0.3, FR-0.4)

### 도메인 소스 이동 (14 파일)

- [ ] `mkdir -p src/lib/domain`
- [ ] `git mv src/calendar.ts src/lib/domain/calendar.ts`
- [ ] `git mv src/catalog.ts src/lib/domain/catalog.ts`
- [ ] `git mv src/date.ts src/lib/domain/date.ts`
- [ ] `git mv src/evaluate.ts src/lib/domain/evaluate.ts`
- [ ] `git mv src/gate.ts src/lib/domain/gate.ts`
- [ ] `git mv src/history.ts src/lib/domain/history.ts`
- [ ] `git mv src/index.ts src/lib/domain/index.ts`
- [ ] `git mv src/plan.ts src/lib/domain/plan.ts`
- [ ] `git mv src/program.ts src/lib/domain/program.ts`
- [ ] `git mv src/proposal.ts src/lib/domain/proposal.ts`
- [ ] `git mv src/rules.ts src/lib/domain/rules.ts`
- [ ] `git mv src/schedule.ts src/lib/domain/schedule.ts`
- [ ] `git mv src/session.ts src/lib/domain/session.ts`
- [ ] `git mv src/types.ts src/lib/domain/types.ts`

### 데이터 이동 (1 파일)

- [ ] `mkdir -p src/lib/data`
- [ ] `git mv data/progressions.json src/lib/data/progressions.json`

### 테스트 이동 (14 파일)

- [ ] `mkdir -p tests/unit`
- [ ] `git mv test/calendar.test.ts tests/unit/calendar.test.ts`
- [ ] `git mv test/consistency.test.ts tests/unit/consistency.test.ts`
- [ ] `git mv test/data.test.ts tests/unit/data.test.ts`
- [ ] `git mv test/date.test.ts tests/unit/date.test.ts`
- [ ] `git mv test/evaluate.test.ts tests/unit/evaluate.test.ts`
- [ ] `git mv test/gate.test.ts tests/unit/gate.test.ts`
- [ ] `git mv test/helpers.ts tests/unit/helpers.ts`
- [ ] `git mv test/integration.test.ts tests/unit/integration.test.ts`
- [ ] `git mv test/plan.test.ts tests/unit/plan.test.ts`
- [ ] `git mv test/program.test.ts tests/unit/program.test.ts`
- [ ] `git mv test/proposal.test.ts tests/unit/proposal.test.ts`
- [ ] `git mv test/schedule.test.ts tests/unit/schedule.test.ts`
- [ ] `git mv test/session.test.ts tests/unit/session.test.ts`
- [ ] `git mv test/tz-probe.ts tests/unit/tz-probe.ts` — Phase 2 에서 정리 (검사 스크립트라 옮겨두고 판정은 다음 페이즈)

**주의**: `git mv` 대상 파일의 **내용을 편집하지 않는다.** import 경로도 이 커밋에서 갱신하지 않는다.
- 이동한 `src/lib/domain/*.ts` 안의 `import './types.ts'` 등은 옛 위치를 가리키게 된 상태로 커밋된다.
- 이동한 `tests/unit/*.test.ts` 안의 `import '../src/…'` 도 옛 경로 그대로.
- 이유: 이 커밋에서 내용을 함께 바꾸면 git 이 rename 이 아니라 delete+add 로 인식할 확률이 오르고,
  diff 크기가 커져 리뷰 불가능해진다. **import 경로 갱신은 Phase 2 의 별도 커밋이다.**

---

## 정리 (옛 디렉터리 삭제)

- [ ] `rmdir src` 는 실행하지 않는다 — `src/lib/{domain,data}` 를 이미 만들었으므로 `src/` 자체는
      남아야 하고, `src` 아래에 옛 위치 파일이 없음을 `find src -maxdepth 1 -type f` 로 확인 (출력 없음)
- [ ] `rmdir data` — `data/` 가 이제 비었으면 삭제
- [ ] `rmdir test` — `test/` 가 이제 비었으면 삭제

---

## 커밋

- [ ] `git status` 로 rename 인식 확인 (`renamed:` 표기가 목록에 있어야 한다)
- [ ] `git diff --cached --stat` 로 `insertions/deletions` 가 0 임을 확인
- [ ] 커밋 메시지:
  ```
  refactor(structure): src → src/lib/domain, data → src/lib/data, test → tests/unit

  파일 이동만. 내용은 한 바이트도 바뀌지 않는다.
  이 커밋 시점에는 테스트 러너가 새 경로를 모르기 때문에 npm test 가 돌지 않는다.
  다음 커밋(Phase 2 툴체인)이 pnpm/vitest/svelte-check 와 import 경로를 세팅한다.

  FR-0.2, FR-0.3, FR-0.4 (이동 부분).
  ```
- [ ] `git log --stat -M -C -1` 으로 rename 인식 최종 확인

---

## 검증

`PHASE_1_TEST.md` 의 항목을 순서대로 수행.

---

## Out of Scope (이 페이즈 안에서 하지 않는 것)

- 파일 내용 변경 (import 경로, 스타일, 로직) — 전부 Phase 2 이후
- `package.json` 수정 — Phase 2
- 새 파일 생성 (`svelte.config.js`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`) — Phase 2
- `loadCatalog` 격리 (FR-0.7) — Phase 2
- 도메인 로직 변경 (FR-12, FR-13, FR-15) — Phase 3
- UI 코드 — Phase 4
- `deploy/nginx/bigsix.conf` — Phase 5 (이미 워킹트리에 있으나 이 페이즈는 손대지 않는다)
