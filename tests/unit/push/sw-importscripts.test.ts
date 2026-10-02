// 빌드 산출물 검증 — Phase 3 sw-importscripts (SPEC4 FR-32.1·2, GLOBAL ADR-31·32).
//
// `pnpm build` 결과 `build/sw.js` 에
//   (1) `importScripts(` 호출이 정확히 한 번,
//   (2) 그 호출이 `try { ... } catch {}` 로 감싸져 있고,
//   (3) 운영 릴레이 URL `https://push.siot-ieung.duckdns.org/sw.js` 가 인라인된다
// 를 확인한다.
//
// `.env.production` 이 커밋되어 있으므로 `vite build` 는 운영 URL 을 인라인한다 (ADR-31).
// `src/pwa-sw.ts` 에서 `$env/static/public` 으로 import 한 상수가 빌드 시 치환돼
// 산출 `sw.js` 에는 `import` 문이 남지 않는다 (OQ-20 해소, SPEC § References · IR-4 참고).
//
// 테스트 패턴: `tests/unit/precache-parity.test.ts` 와 동일하게
// `spawnSync('pnpm', ['exec', 'vite', 'build', '--outDir', <tmp>])` 로 빌드하고
// adapter-static 이 떨어뜨린 `build/sw.js` 를 문자열로 읽는다.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

// 이 파일은 `tests/unit/push/` 아래라 precache-parity.test.ts 보다 한 단계 더 깊다 — dirname 4회.
const REPO_ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

/** 격리 out 디렉터리로 `pnpm build` 를 한 번 돌린다. */
function buildTo(out: string): void {
  const result = spawnSync('pnpm', ['exec', 'vite', 'build', '--outDir', out], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `vite build 실패 (status=${result.status})\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }
}

describe('빌드 산출물: sw.js importScripts (Phase 3 / FR-32.1·2)', { timeout: 60_000 }, () => {
  it(
    'build/sw.js 에 importScripts 가 try/catch 로 감싸진 채 정확히 한 번, 운영 URL 인라인으로 들어간다',
    () => {
      // precache-parity 와 같은 전략: build/ 가 이미 있으면 그대로 쓰고, 없으면 임시 out 으로 빌드.
      // adapter-static 은 vite 의 --outDir 와 무관하게 `build/` 로 사이트를 쓴다.
      const buildDir = join(REPO_ROOT, 'build');
      let cleanupOut: string | null = null;
      let swPath = join(buildDir, 'sw.js');

      if (!existsSync(swPath)) {
        cleanupOut = mkdtempSync(join(tmpdir(), 'bigsix-swimport-'));
        buildTo(cleanupOut);
        swPath = join(buildDir, 'sw.js');
      }

      assert.ok(existsSync(swPath), `build/sw.js 가 없음: ${swPath}`);
      const sw = readFileSync(swPath, 'utf8');

      // (1) importScripts 호출 1회.
      const importScriptsMatches = sw.match(/importScripts\s*\(/g) ?? [];
      assert.equal(
        importScriptsMatches.length,
        1,
        `importScripts 호출 횟수 예상 1, 실제 ${importScriptsMatches.length}`,
      );

      // (3) 운영 URL 이 인라인됨. 압축 결과 상수는 지역 변수에 캐시되고 `+'/sw.js'` 가 뒤에 붙어
      //     전체 리터럴이 그대로 한 조각으로 남지 않을 수 있다 — 베이스 URL 과 `/sw.js` 끝자리 둘 다 확인.
      const PROD_URL = 'https://push.siot-ieung.duckdns.org';
      assert.ok(
        sw.includes(PROD_URL),
        `운영 릴레이 베이스 URL(${PROD_URL}) 이 sw.js 에 인라인되지 않음`,
      );
      // importScripts 호출 자리 주변 50자 안에 `/sw.js` 가 있어야 한다.
      const near = /importScripts\s*\([^)]{0,80}\/sw\.js/.test(sw);
      assert.ok(near, 'importScripts 호출 안에 `/sw.js` 경로가 보이지 않는다');

      // dev URL 은 들어가면 안 된다.
      assert.ok(
        !sw.includes('push-dev.siot-ieung.duckdns.org'),
        'dev 릴레이 URL 이 운영 산출물에 섞여 들어갔다',
      );

      // (2) try/catch 로 감싸져 있다. 코드 압축 후에도 `try{...importScripts(...)...}catch` 꼴은 유지된다.
      //     공백·개행에 관대하게 매칭. (중괄호 중첩 없음 — try 블록은 importScripts 한 줄뿐)
      const guarded = /try\s*\{[^{}]*importScripts\s*\([^)]*\)[^{}]*\}\s*catch\b/.test(sw);
      assert.ok(
        guarded,
        'importScripts 호출이 try { ... } catch 로 감싸져 있지 않다 (ADR-32)',
      );

      // 보너스: 빌드 산출물에 `$env/static/public` import 문이 남지 않아야 한다 (OQ-20 해소 확인).
      assert.ok(
        !/\$env\/static\/public/.test(sw),
        '`$env/static/public` 식별자가 산출 sw.js 에 그대로 남았다 — 빌드 시 치환 실패',
      );

      if (cleanupOut !== null) {
        try {
          rmSync(cleanupOut, { recursive: true, force: true });
        } catch {
          // 정리 실패는 테스트 결과에 영향 없음.
        }
      }
    },
  );
});
