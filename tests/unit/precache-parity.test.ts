// 프리캐시 등가성 로컬 대조 (SPEC RISK-1 · NFR-30.a · b · c).
//
// `generateSW → injectManifest` 전환의 최대 회귀 위험은 프리캐시 매니페스트가 소리 없이
// 좁아지는 것이다. 홈서버 배포 후에는 `deploy/deploy.sh` 가 원격 sw.js 의
// `url:"..."` 목록을 뽑아 전수 대조하지만, 여기서 배포 전에도 같은 대조를 한 번 돌린다.
//
// 이 테스트는 별도 out 디렉터리에 `vite build` 를 한 번 돌린다. 시간이 걸리므로
// 파일 첫 줄에 넉넉한 timeout 을 지정한다.

// vitest workspace 는 파일 안에서 timeout 을 지정하는 마커를 지원한다 —
// describe 블록에 옵션 오브젝트로 지정.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** `sw.js` 안의 프리캐시 매니페스트에서 URL 만 뽑는다. */
function extractUrls(sw: string): string[] {
  return [...sw.matchAll(/"url":"([^"]+)"/g)].map((m) => m[1]);
}

/** 격리 out 디렉터리로 `pnpm build` 를 한 번 돌린다. */
function buildTo(out: string): void {
  const result = spawnSync('pnpm', ['exec', 'vite', 'build', '--outDir', out], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      // vite build 는 이 값을 client outDir 로 쓴다.
      // svelte-kit 이 정적 어댑터로 자체 build/ 를 만들 때 kit.outDir 를 참조하지 않도록
      // 프로젝트 기본값 그대로 둔다 (별도 out 은 이 테스트만 본다).
    },
  });
  if (result.status !== 0) {
    throw new Error(
      `vite build 실패 (status=${result.status})\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }
}

/** `build/` 트리에서 파일 존재 여부. adapter-static 은 파일명 그대로 상대경로다. */
function fileExists(buildDir: string, url: string): boolean {
  const path = url === '/' ? join(buildDir, 'index.html') : join(buildDir, url);
  if (existsSync(path)) return true;
  // `history` 같이 확장자가 없는 URL 은 `history.html` 로 프리렌더된다.
  if (existsSync(`${path}.html`)) return true;
  return false;
}

describe('프리캐시 매니페스트 등가성 (RISK-1)', { timeout: 60_000 }, () => {
  it(
    'sw.js 안의 URL 이 build/ 안 실파일로 모두 존재하고 확장자·필수 항목이 유지된다',
    () => {
      // `pnpm build` 는 이미 CI 나 사용자가 이 테스트 직전에 한 번 돌리므로,
      // build/ 가 존재하면 그것으로 검증한다. 없을 때만 임시 out 으로 빌드.
      const buildDir = join(REPO_ROOT, 'build');
      let cleanupOut: string | null = null;
      let effectiveBuildDir = buildDir;
      let swPath = join(buildDir, 'sw.js');

      if (!existsSync(swPath)) {
        cleanupOut = mkdtempSync(join(tmpdir(), 'bigsix-precache-'));
        buildTo(cleanupOut);
        // adapter-static 은 vite 의 --outDir 에 관계없이 `build/` 로 사이트를 쓴다.
        // (svelte.config.js 의 adapter-static 이 그리 설정됨.) 다시 build/ 를 본다.
        effectiveBuildDir = buildDir;
        swPath = join(buildDir, 'sw.js');
      }

      assert.ok(existsSync(swPath), `build/sw.js 가 없음: ${swPath}`);
      const sw = readFileSync(swPath, 'utf8');
      const urls = extractUrls(sw);

      // 최소 20 개 이상 (기준선 39 근처) — 매니페스트가 통째로 비는 회귀를 잡는다.
      assert.ok(urls.length >= 20, `프리캐시 항목이 너무 적음: ${urls.length}`);

      // 매니페스트에 확장자가 없는 URL(예: `steps`, `history`, `/`) 은 adapter-static 이
      // `.html` 로 프리렌더한 것이다. 존재 검증에서 두 경로를 모두 시도.
      const missing = urls.filter((u) => !fileExists(effectiveBuildDir, u));
      assert.deepEqual(missing, [], `build/ 에 없는 프리캐시 URL:\n${missing.join('\n')}`);

      // (NFR-30.a) — globPatterns 등가: 각 확장자가 최소 1건씩 매니페스트에 있어야 한다.
      // json (앱 카탈로그), css, js 는 필수. png / svg 도 아이콘으로 존재.
      const hasExt = (ext: string): boolean =>
        urls.some((u) => u.endsWith(`.${ext}`)) ||
        // 확장자 없는 URL 도 실체는 .html — 그 확장자만 별도 확인.
        (ext === 'html' && urls.some((u) => existsSync(join(effectiveBuildDir, `${u}.html`))));
      for (const ext of ['js', 'css', 'html', 'json', 'svg', 'png']) {
        assert.ok(hasExt(ext), `확장자 ${ext} 가 매니페스트에서 사라짐`);
      }

      // `/sw.js`, `/pwa-sw.ts` 자체는 프리캐시에 들어가지 않아야 한다.
      assert.ok(!urls.includes('sw.js'), '자기 자신(sw.js)이 프리캐시에 들어감');
      assert.ok(!urls.includes('pwa-sw.ts'), 'SW 소스(pwa-sw.ts)가 프리캐시에 들어감');
      assert.ok(!urls.includes('pwa-sw.js'), 'SW 소스(pwa-sw.js)가 프리캐시에 들어감');

      // `manifest.webmanifest` 는 반드시 포함 (기존 generateSW 동작 유지).
      assert.ok(urls.includes('manifest.webmanifest'), 'manifest.webmanifest 가 매니페스트에서 사라짐');

      if (cleanupOut !== null) {
        try {
          rmSync(cleanupOut, { recursive: true, force: true });
        } catch {
          // 정리 실패는 테스트 결과에 영향 없음.
        }
      }
    },
  );

  it('build/ 안 파일 트리가 예상 카테고리를 전부 포함한다 (구조 회귀 감지)', () => {
    const buildDir = join(REPO_ROOT, 'build');
    if (!existsSync(buildDir)) return; // 위 테스트가 빌드를 이미 트리거한다.

    // 최소 다음이 존재:
    const required = [
      'index.html',
      'manifest.webmanifest',
      'sw.js',
      'icon-192.png',
      'icon-512.png',
      'icon-maskable.png',
      'icon.svg',
      '_app/version.json',
    ];
    for (const rel of required) {
      const path = join(buildDir, rel);
      assert.ok(existsSync(path), `build/ 에서 필수 파일 누락: ${rel}`);
      assert.ok(statSync(path).isFile(), `build/${rel} 이 파일이 아님`);
    }

    // `_app/immutable/` 아래 assets/chunks/entry/nodes 하위 폴더가 있어야 한다.
    const imm = join(buildDir, '_app/immutable');
    if (existsSync(imm)) {
      const kids = new Set(readdirSync(imm));
      for (const need of ['assets', 'chunks', 'entry', 'nodes']) {
        assert.ok(kids.has(need), `_app/immutable/ 에 ${need}/ 폴더 누락`);
      }
    }

    // 사용하지 않는 값 경고 억제.
    void relative;
  });
});
