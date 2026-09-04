# Phase 2 검증

**목적**: 툴체인이 새 경로에서 정확히 도는 것을 증명한다. 이 시점에 **474개 테스트가 vitest 로 전부
통과**해야 하고 (FR-0.5 / NFR-16), **`svelte-check` 오류·경고 0** 이어야 한다 (FR-0.6 / NFR-17).
도메인 로직은 여전히 무변경 (FR-0.8).

---

## 설치 · 골격 검증

- [ ] `pnpm install --frozen-lockfile` 성공
- [ ] `pnpm-lock.yaml` 이 커밋되어 있다
- [ ] `svelte.config.js`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `src/app.html`,
      `src/routes/+layout.ts`, `src/routes/+page.svelte`, `src/routes/programs/+page.svelte`,
      `src/routes/steps/+page.svelte` 존재
- [ ] `pnpm exec svelte-kit sync` 성공. `.svelte-kit/tsconfig.json` 생성

## `loadCatalog` 격리 검증 (FR-0.7 / EC-22)

- [ ] `grep -n "node:fs\|readFileSync" src/lib/domain/` 이 출력을 내지 않는다
- [ ] `grep -n "loadCatalog" src/lib/domain/index.ts` 이 출력을 내지 않는다 (export 제거됨)
- [ ] `src/lib/data/catalog.ts` 가 존재하고 `import raw from './progressions.json'` 를 사용
- [ ] `tests/unit/helpers.ts` 가 `import { loadCatalog } from '$lib/data/catalog.js'` 를 사용

## 러너·타입 검사

- [ ] `pnpm test` 실행. **결과: 474 passed** (0 failed, 0 skipped, 0 todo)
  - 이 수치가 SPEC 이관 시점 기준이다 (FR-0.5). 이 페이즈에서 이 수를 어긋나면 이관 오류다 (EC-20)
- [ ] `pnpm run check` (svelte-check) 실행. **결과: 0 errors, 0 warnings** (NFR-17)
  - 새 오류가 발견되면 (EC-21 예상) 페이즈 계획대로 분리 처리

## NFR 검증 (grep)

- [ ] `grep -rn "new Date()" src/lib/domain/` 이 출력을 내지 않는다 (NFR-5a)
- [ ] `grep -rn "Date.now()" src/lib/domain/` 이 출력을 내지 않는다 (NFR-5a)
- [ ] `grep -rn "from 'svelte" src/lib/domain/` 이 출력을 내지 않는다 (NFR-3)
- [ ] `grep -rn "\\$app\\|\\$env\\|\\$lib" src/lib/domain/` 이 출력을 내지 않는다 (NFR-3)
- [ ] `grep -rn "from 'node:" src/lib/domain/` 이 출력을 내지 않는다 (NFR-3)
- [ ] `grep -rn "window\\|document\\|localStorage" src/lib/domain/` 이 출력을 내지 않는다 (NFR-3)

## 빌드 산출물 검증 (EC-22)

- [ ] `pnpm build` 성공. `build/` 생성
- [ ] `grep -rE "node:fs|require.*(['\"])fs\\1|readFileSync" build/` 이 출력을 내지 않는다
- [ ] `build/index.html` 이 존재하고, adapter-static 이 정적 파일을 만들었다 (`ls build/` 로 확인)

## 도메인 무변경 검증 (FR-0.8)

- [ ] `git log --oneline HEAD~5..HEAD` 로 최근 커밋을 확인. Phase 1 (파일 이동) 과 Phase 2 (툴체인)
      만 있고, 각 커밋 메시지가 이관 성격을 명시한다
- [ ] `git diff HEAD~2 HEAD -- 'src/lib/domain/*.ts' | grep -vE "^(---|\\+\\+\\+|diff|index)"` 로
      도메인 파일의 변경 라인만 추출:
  - `src/lib/domain/catalog.ts` — `loadCatalog` / `node:fs` import 삭제만
  - `src/lib/domain/index.ts` — `loadCatalog` export 삭제만
  - **나머지 12개 도메인 파일**: 변경 없어야 한다 (import 경로 갱신도 이 파일들 안에는 없다 — `.ts`
    상대 import 는 그대로)

## 테스트 파일 이관 검증

- [ ] 각 `tests/unit/*.test.ts` 의 상단부에서:
  - `from '../src/…'` 형태가 없다 → 새 경로로 갱신됨
  - `from '$lib/domain/…'` 또는 `from '../../src/lib/domain/…'` 형태로 갱신됨
  - `import { describe, it, test } from 'vitest'` (또는 vitest 전역 상정)
  - `import assert from 'node:assert/strict'` 그대로 유지

## Out of Scope (이 페이즈에서 확인하지 않는 것)

- 화면 렌더링 — Phase 4
- 배포 — Phase 5
- CI 워크플로 — Phase 5
- FR-12/13/15 반영 — Phase 3

---

## 실패 시 대처

- 474 개 미만 (테스트 파일 못 찾음): `vitest.config.ts` 의 `include` 확인, glob 경로 확인
- 474 개 미만 (파일은 찾았는데 스킵됨): `describe`/`it` import 누락, vitest 버전 불일치
- 474 개 초과: 신규 테스트가 실수로 들어감 → 이 페이즈에서는 없어야 한다
- svelte-check 실패: EC-21 대응. 타입 표기만 정정하면 이 페이즈. 동작 변경 필요하면 별도 커밋
- 빌드 안에 `node:fs` 발견: `loadCatalog` 격리가 완전하지 않음. `src/lib/domain/index.ts` re-export
  잔재, 또는 `src/routes/*` 에서 잘못 import
