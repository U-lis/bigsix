# Phase 2: 툴체인 (SvelteKit + vitest + svelte-check + loadCatalog 격리)

**목적**: Phase 1 이 옮겨 놓은 파일들이 새 위치에서 돌 수 있도록 도구를 세팅한다. **이 페이즈 끝
시점에 474개 테스트가 vitest 로 전부 통과해야 한다** (FR-0.5). 도메인 로직은 이 페이즈에서도 여전히
바뀌지 않는다 (FR-0.8).

**SPEC 커밋 경계**: (2) 툴체인 (Notes 「커밋 분리 지침」)
**커밋 수**: 1~2
- 권장 커밋 A: 툴체인 세팅 + import 경로 갱신 (테스트 통과 시점까지 한 번에)
- 커밋 B (선택): `svelte-check` 로 드러난 도메인 타입 오류 정정 (EC-21) — **동작 변경이 필요하면
  별도 커밋으로 반드시 분리** (Phase 3 로 밀리는 것이 원칙이나, 이관 자체가 성립하지 않을 정도의
  타입 오류라면 이 페이즈에서 정정 커밋을 따로 만든다)

**병렬**: 없음
**Dependencies**: Phase 1

---

## 완료 정의

- [ ] `package.json` 이 SvelteKit + pnpm 형태로 재작성 — 하나만 존재 (FR-0.1)
- [ ] `svelte.config.js`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json` 존재
- [ ] `pnpm install --frozen-lockfile` 로 lockfile 생성 성공
- [ ] `pnpm run check` (svelte-check) 가 **오류 0 · 경고 0** (NFR-17 / FR-0.6)
- [ ] `pnpm test` (vitest) 가 **474개 통과** (FR-0.5 / NFR-16)
- [ ] `src/lib/domain/catalog.ts` 에 `loadCatalog` 함수가 없거나 격리되어 있고, 앱 진입 경로에서
      `node:fs` 가 import 되지 않음 (FR-0.7 / EC-22)
- [ ] `src/lib/data/catalog.ts` 가 신규 존재하고 vite JSON import 로 카탈로그를 적재
- [ ] `src/lib/domain/index.ts` 가 `loadCatalog` 를 export 하지 않음 (또는 브라우저 안전한 것만
      export)
- [ ] `src/lib/domain/` 안에 프레임워크/브라우저/Node API import 0회 (NFR-3, grep 확인)
- [ ] `src/lib/domain/` 안에 `new Date()` / `Date.now()` 0회 (NFR-5a, grep 확인)
- [ ] `tests/unit/*.test.ts` 의 import 경로가 새 위치를 가리킴
- [ ] 옛 러너 스크립트 (`node --experimental-strip-types --test`) 는 `package.json` 에 없음 (NFR-12)

---

## 사전 조건 확인

- [ ] Phase 1 커밋이 반영되어 있고 rename 이 인식되어 있다
- [ ] `pnpm` 명령이 설치되어 있다 (없으면 `corepack enable`)
- [ ] Node 24 이상 (`node -v` 확인)

---

## 1. `package.json` 재작성

- [ ] `pnpm` 기반으로 재작성. cube-study `package.json` 을 참고 하되 필요한 항목만:

```json
{
  "name": "bigsix",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "packageManager": "pnpm@10.33.4",
  "engines": {
    "node": ">=24",
    "pnpm": ">=10"
  },
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite build && vite preview",
    "preview:only": "vite preview",
    "prepare": "svelte-kit sync || echo ''",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "gen": "python3 tools/gen_movements.py"
  },
  "devDependencies": {
    "@sveltejs/adapter-static": "^3.0.10",
    "@sveltejs/kit": "^2.63.0",
    "@sveltejs/vite-plugin-svelte": "^7.1.2",
    "@types/node": "^26.1.2",
    "@vite-pwa/sveltekit": "^1.1.0",
    "svelte": "^5.56.1",
    "svelte-check": "^4.6.0",
    "typescript": "^6.0.3",
    "vite": "^8.0.16",
    "vitest": "^4.1.10"
  },
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/U-lis/bigsix.git" }
}
```

**주**:
- `version` 은 Phase 5 에서 릴리스 시 `0.2.0` 으로 올린다. 이 페이즈에서는 `0.1.0` 유지.
- `dependencies` 는 비어 있다 — 카탈로그 데이터도 vite JSON import 로 정적 번들되므로 런타임
  의존성이 필요 없다.
- `playwright` 는 이번 범위 밖 (GLOBAL 「SPEC 과의 불일치」5).

- [ ] `pnpm install` 실행. `pnpm-lock.yaml` 생성 확인
- [ ] `.gitignore` 에 `node_modules/`, `.svelte-kit/`, `build/`, `pnpm-store/`, `.pnpm-store/` 확인 · 필요 시 추가

## 2. SvelteKit 골격

- [ ] `svelte.config.js` 생성:

```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ strict: true }),
    alias: { '$lib': 'src/lib' }
  }
};
```

- [ ] `vite.config.ts` 생성 (골격만 — PWA 설정은 Phase 4 에서 확장):

```ts
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

function commitHash(): string {
  try { return execSync('git rev-parse --short=8 HEAD', { encoding: 'utf8' }).trim(); }
  catch { return 'unknown'; }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_HASH__: JSON.stringify(commitHash())
  },
  plugins: [sveltekit()]
});
```

- [ ] `vitest.config.ts` 생성:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts']
  }
});
```

- [ ] `tsconfig.json` 생성 (cube-study 준용):

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "rewriteRelativeImportExtensions": true,
    "allowJs": true,
    "checkJs": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "moduleResolution": "bundler"
  }
}
```

- [ ] `src/app.html` 생성 (SvelteKit 최소):

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

- [ ] `src/routes/+layout.ts` 생성 (adapter-static 을 위한 prerender):

```ts
export const prerender = true;
```

- [ ] `src/routes/+page.svelte` **placeholder** 생성 (Phase 4 에서 실 화면으로 교체):

```svelte
<!-- Phase 4 에서 오늘 세션 화면으로 교체 -->
<p>bigsix — Phase 4 에서 실 화면으로 교체됨</p>
```

- [ ] `pnpm exec svelte-kit sync` 실행 성공 (`.svelte-kit/` 생성)

## 3. `loadCatalog` 격리 (FR-0.7 / EC-22)

- [ ] `src/lib/domain/catalog.ts` 를 축소 — `loadCatalog` 함수와 `readFileSync` / `node:fs` import
      를 삭제. `fromJSON` / `getProgression` / `getStep` / `topStandard` / `topLabel` / `valueOf` 만
      남긴다.

  현재 파일의 처음 두 줄:
  ```ts
  import { readFileSync } from 'node:fs';
  import type { Catalog, Progression, ProgressionId, Standard, Step } from './types.ts';

  export function loadCatalog(path: string): Catalog {
    return fromJSON(JSON.parse(readFileSync(path, 'utf-8')));
  }
  ```
  다음으로 바꾼다:
  ```ts
  import type { Catalog, Progression, ProgressionId, Standard, Step } from './types.ts';
  // loadCatalog(path) 는 Node fs 에 의존해 브라우저에서 동작하지 않는다.
  // 앱은 src/lib/data/catalog.ts 의 loadCatalog() (인자 없음, vite JSON import) 를 쓴다.
  ```

- [ ] `src/lib/domain/index.ts` 의 재export 목록에서 `loadCatalog` 제거:
  ```ts
  // 전
  export { fromJSON, loadCatalog, getProgression, ... } from './catalog.ts';
  // 후
  export { fromJSON, getProgression, ... } from './catalog.ts';
  ```

- [ ] `src/lib/data/catalog.ts` 신규:
  ```ts
  import raw from './progressions.json';
  import { fromJSON } from '$lib/domain/catalog.js';
  import type { Catalog } from '$lib/domain/index.js';

  /**
   * 앱 전용 카탈로그 로더 (FR-10).
   * vite 가 progressions.json 을 정적 번들로 심으므로 fs 접근이 없다.
   * 카탈로그는 앱 버전과 함께 배포되는 정적 데이터다 (FR-10.3).
   */
  let cached: Catalog | null = null;
  export function loadCatalog(): Catalog {
    if (cached === null) cached = fromJSON(raw);
    return cached;
  }
  ```

- [ ] `tests/unit/helpers.ts` 갱신 — 상단부:
  ```ts
  // 전
  import { loadCatalog } from '../src/catalog.ts';
  import { addDays, checkGate, initialState, programProgressions } from '../src/index.ts';
  ...
  export const catalog = loadCatalog(new URL('../data/progressions.json', import.meta.url).pathname);

  // 후
  import { loadCatalog } from '$lib/data/catalog.js';
  import { addDays, checkGate, initialState, programProgressions } from '$lib/domain/index.js';
  ...
  export const catalog = loadCatalog();
  ```
  같은 로더를 앱과 테스트가 공유한다 (FR-10.4).

- [ ] `tests/unit/tz-probe.ts` 는 이 페이즈에서 **삭제** — 검사 스크립트지 테스트가 아니고,
      `node:fs` 를 쓰던 옛 헬퍼에 의존했다. 필요하면 별도 페이즈·별도 작업에서 `tools/` 로 이관.
      **삭제도 이관도 아닌 상태로 남겨두면 vitest 가 이 파일을 스킵하지도 실행하지도 못한다.**

## 4. 테스트 이관 (`node:test` → vitest, import 경로)

- [ ] `tests/unit/*.test.ts` 12개 각각 상단의 import 경로를 새 위치로 갱신:
  - `import '../src/xxx.ts'` → `import '$lib/domain/xxx.js'` (또는 `'../../src/lib/domain/xxx.ts'` —
    `tsconfig` 의 `$lib` alias 가 sveltekit sync 이후에 잡히므로 alias 사용 권장)
  - `import './helpers.ts'` → `import './helpers.js'` (같은 디렉터리 유지되므로 상대 경로만 확장자 정정)

- [ ] `node:test` / `node:assert` API 는 **그대로 유지** (GLOBAL 「SPEC 과의 불일치」3):
  - `import { describe, it, test } from 'node:test'` → 지운다 (vitest 는 자동 전역, 혹은 `import
    { describe, it, test } from 'vitest'` 로 교체)
  - `import assert from 'node:assert/strict'` → **그대로 유지**. vitest 안에서도 `node:assert` 는
    작동한다. 이관 diff 최소화.

- [ ] 각 테스트 파일 첫 줄에 `import { describe, it, test } from 'vitest'` 추가 (node:test 자동 로드
      제거로 인해)
- [ ] `beforeEach` / `afterEach` 사용처가 있으면 마찬가지로 `vitest` 에서 import 추가 (grep 확인)

- [ ] `pnpm test` 실행. **474 개 통과가 이 시점의 검증이다.**
  - 실패 시 발견되는 유형:
    - import 경로 오타 → 수정
    - `node:test` 자동 전역 사라짐으로 `test`/`describe` 미정의 → import 추가
    - `.ts` 확장자 유지 여부 (tsconfig `rewriteRelativeImportExtensions: true` 라면 소스에서 `.ts`
      로 쓰고 컴파일 시 `.js` 로 변환. vitest 는 vite 를 통해 이를 이해한다)

## 5. `svelte-check` 통과 (FR-0.6 / NFR-17)

- [ ] `pnpm run check` 실행. **오류 0 · 경고 0** (NFR-17)
- [ ] 신규 오류가 나오면 (EC-21) 다음을 판단:
  - **타입 표기만 손보면 되는 경우**: 이 페이즈에서 정정
  - **동작 변경이 필요한 경우**: 별도 커밋으로 분리하거나 Phase 3 로 밀되, **미루지 않는다** (D-19 /
    EC-21). 실무에서 `applySession` 이 `stints`/`proposals` 를 스프레드로 안 넘기던 것 같은
    범주의 오류는 이 페이즈에서 잡는 것이 맞다 — 그것이 이 페이즈의 실질적 이득이다 (L-5).

## 6. `node:fs` 앱 번들 격리 검증 (EC-22)

- [ ] `pnpm build` 실행. `build/` 산출물 생성 성공
- [ ] `grep -r "node:fs\|require.*fs" build/ 2>/dev/null` 이 출력을 내지 않는다 (앱 번들에 `node:fs`
      가 없음)
- [ ] `grep -r "readFileSync\b" build/ 2>/dev/null` 이 출력을 내지 않는다
- [ ] 빌드 산출물 크기 확인 (참고용 — 카탈로그 JSON 이 정적 번들로 심어져 몇 KB 증가는 정상)

## 7. `src/routes/programs/` 와 `src/routes/steps/` placeholder

Phase 4 에서 실 화면으로 채우지만, 라우트가 존재해야 `svelte-kit sync` 가 타입을 생성한다.

- [ ] `src/routes/programs/+page.svelte` 신규 (placeholder)
- [ ] `src/routes/steps/+page.svelte` 신규 (placeholder)

---

## 커밋

- [ ] `git add package.json pnpm-lock.yaml svelte.config.js vite.config.ts vitest.config.ts tsconfig.json src/app.html src/routes/ src/lib/domain/catalog.ts src/lib/domain/index.ts src/lib/data/catalog.ts tests/unit/`
- [ ] `git rm tests/unit/tz-probe.ts` (Phase 2 정리 대상)
- [ ] `git status` 로 스테이징 확인
- [ ] 커밋 메시지:
  ```
  chore(toolchain): SvelteKit + vitest + svelte-check + loadCatalog 격리

  - package.json 을 pnpm/SvelteKit 로 재작성. dependencies 는 비어 있고,
    카탈로그는 vite JSON import 로 앱 번들에 심는다.
  - vitest 로 이관. tests/unit/ 안의 474개 테스트가 그대로 통과한다.
    단언 API 는 node:assert/strict 를 유지 — 이관 diff 최소화.
  - svelte-check 도입. 오류·경고 0 (FR-0.6, NFR-17). 이번 이관의 실질적 이득이다.
  - src/lib/domain/catalog.ts 의 loadCatalog(node:fs 의존) 를 제거.
    앱은 src/lib/data/catalog.ts 의 loadCatalog() 를 쓴다 (FR-0.7, EC-22).
  - tests/unit/tz-probe.ts 삭제 (검사 스크립트지 테스트가 아니다).

  FR-0.1, FR-0.4~0.7, FR-0.9. 도메인 로직 무변경 (FR-0.8).
  ```

---

## 검증

`PHASE_2_TEST.md` 의 항목을 순서대로 수행.

---

## Out of Scope

- 도메인 로직 변경 — Phase 3
- UI 코드 (`src/lib/ui/`, 실제 화면) — Phase 4
- PWA 확장 (`vite-plugin-pwa`, manifest, service worker) — Phase 4
- `deploy/` — Phase 5
- `.github/workflows/` — Phase 5
- **CI 에서 `pnpm run check` 와 `pnpm test` 를 돌리는 워크플로** — Phase 5 에서 세팅. 이 페이즈는
  로컬에서 확인한다
