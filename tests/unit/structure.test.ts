/**
 * 코드 배치 규약 재발 방지 검사 (FR-29.4 / ADR-27).
 *
 * src/ 트리를 파일 시스템으로 순회하며 정적으로 검사한다. 브라우저 환경 불필요.
 *
 * 검사 대상:
 *   (a) UI · 라우트에서 `$lib/domain/(index|types)` 이외의 domain 참조 0건.
 *   (b) `src/` 안에서 `.ts` 확장자 import 0건 — `src/lib/domain/**` 은 반대로
 *       상대 import 가 전부 `.ts` 이고 `$lib` 참조 0건.
 *   (c) 층을 넘는 상대 경로(`../` 로 층 경계를 넘음) 0건.
 *   (d) `src/lib/ui/` 직속에 파일 0건. 하위는 정확히
 *       `{shell, state, common, today, session}` (history 는 Phase 4 에서 추가).
 *
 * `tests/` 는 SPEC 명시로 검사 대상 밖이므로 이 파일 자체는 규칙을 만족할 필요가 없다.
 * 그러나 이 파일은 참고로 규칙을 지키고 있다.
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SRC = join(REPO_ROOT, 'src');

/**
 * 층(layer) 목록. 각 항목은 `src/` 기준 상대 경로.
 * 하나의 층 안에서는 상대 경로가 허용되며, 층을 넘으면 `$lib/...` 별칭을 써야 한다 (ADR-27).
 */
const LAYER_ROOTS = [
  'lib/domain',
  'lib/data',
  'lib/ui/shell',
  'lib/ui/state',
  'lib/ui/common',
  'lib/ui/today',
  'lib/ui/session',
  'lib/ui/history',
  'routes',
] as const;

const UI_UNDER = new Set(['shell', 'state', 'common', 'today', 'session']);

// ── 파일 순회 ────────────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** src/ 아래의 코드 파일 (`.ts`, `.svelte`, `.svelte.ts`). d.ts 제외. */
function srcFiles(): string[] {
  return walk(SRC).filter((p) => {
    if (p.endsWith('.d.ts')) return false;
    return p.endsWith('.ts') || p.endsWith('.svelte');
  });
}

// ── import 문 추출 ────────────────────────────────────────────────────────────

/**
 * 한 파일의 import specifier 목록을 뽑는다.
 *
 * - `.ts` / `.svelte.ts`: `<script>` 태그 없음. 파일 전체를 훑는다.
 * - `.svelte`: `<script>` 블록만 훑는다.
 *
 * 정규식으로 잡는다 — 프로젝트 안 import 문은 모두 정적이고 한 줄이거나 여러 줄에 걸친
 * 표준 형식이라 tokenizer 없이도 안전하게 잡힌다.
 */
function importsOf(file: string): string[] {
  const raw = readFileSync(file, 'utf8');
  const body = file.endsWith('.svelte') ? extractScript(raw) : raw;
  const out: string[] = [];
  // `import ... from 'X'` 또는 `import 'X'` 또는 `await import('X')` 형태.
  const re = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.push(m[1]);
  return out;
}

function extractScript(svelte: string): string {
  // 여러 <script> 블록도 잡힘 (module + instance).
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(svelte)) !== null) out += m[1] + '\n';
  return out;
}

// ── 층 계산 ──────────────────────────────────────────────────────────────────

/** 파일 경로가 속한 층을 돌려준다. 어디에도 속하지 않으면 null. */
function layerOf(fileAbs: string): typeof LAYER_ROOTS[number] | null {
  const rel = relative(SRC, fileAbs).replace(/\\/g, '/');
  for (const root of LAYER_ROOTS) {
    if (rel === root || rel.startsWith(root + '/')) return root;
  }
  return null;
}

/**
 * 상대 import specifier 를 절대 경로로 정규화하고 그 파일이 속한 층을 계산한다.
 * 확장자 유무는 무관 — 층 경계 검사에만 쓰는 결과이므로 실제 파일이 존재하지 않아도 된다.
 */
function resolveRelativeLayer(fromFile: string, spec: string): typeof LAYER_ROOTS[number] | null {
  const absDir = dirname(fromFile);
  const abs = resolve(absDir, spec);
  return layerOf(abs);
}

// ── 검사 ─────────────────────────────────────────────────────────────────────

describe('구조 규약 재발 방지 (FR-29.4)', () => {
  const files = srcFiles();

  it('(0) LAYER_ROOTS 자체 자체 검사: 정확히 9개, 각 항목이 src/ 안 실제 경로 접두사', () => {
    assert.equal(LAYER_ROOTS.length, 9);
    // history 는 미래 추가 예정이지만 나머지 8개는 지금 존재해야 한다.
    for (const root of LAYER_ROOTS) {
      if (root === 'lib/ui/history') continue;
      const abs = join(SRC, root);
      assert.ok(statSync(abs).isDirectory(), `${root} 은 디렉터리로 존재해야 한다`);
    }
  });

  it('(a) UI · 라우트에서 $lib/domain 참조는 index 또는 types 뿐이다', () => {
    const violations: string[] = [];
    for (const file of files) {
      const layer = layerOf(file);
      if (layer === null) continue;
      if (layer === 'lib/domain') continue; // 도메인 자신은 검사 대상 밖.
      for (const spec of importsOf(file)) {
        // $lib/domain 그대로 또는 $lib/domain/types 만 허용.
        if (spec === '$lib/domain' || spec === '$lib/domain/types') continue;
        if (spec.startsWith('$lib/domain/')) {
          violations.push(`${relative(REPO_ROOT, file)} → ${spec}`);
        }
      }
    }
    assert.deepEqual(violations, [], `$lib/domain/(index|types) 외 참조 금지:\n${violations.join('\n')}`);
  });

  it('(a) UI · 라우트에서 상대 경로로 domain/ 을 부르지 않는다', () => {
    const violations: string[] = [];
    for (const file of files) {
      const layer = layerOf(file);
      if (layer === null) continue;
      if (layer === 'lib/domain') continue;
      for (const spec of importsOf(file)) {
        if (!spec.startsWith('.')) continue;
        // 상대 경로가 도메인 층에 들어가는지 계산.
        const target = resolveRelativeLayer(file, spec);
        if (target === 'lib/domain') {
          violations.push(`${relative(REPO_ROOT, file)} → ${spec}`);
        }
      }
    }
    assert.deepEqual(violations, [], `UI · 라우트에서 도메인은 \$lib/domain 로만 부른다:\n${violations.join('\n')}`);
  });

  it('(b) src/ 에서 .ts 확장자 import 는 도메인 층 안에서만 나타난다', () => {
    const nonDomainViolations: string[] = [];
    for (const file of files) {
      const layer = layerOf(file);
      if (layer === 'lib/domain') continue;
      for (const spec of importsOf(file)) {
        if (/\.ts(['"]|$)/.test(spec)) {
          nonDomainViolations.push(`${relative(REPO_ROOT, file)} → ${spec}`);
        }
      }
    }
    assert.deepEqual(nonDomainViolations, [], `도메인 밖에서 .ts 확장자 import 금지:\n${nonDomainViolations.join('\n')}`);
  });

  it('(b) src/lib/domain/ 안 상대 import 는 전부 .ts 확장자를 붙이고 $lib 를 쓰지 않는다', () => {
    const missingExt: string[] = [];
    const usedAlias: string[] = [];
    for (const file of files) {
      const layer = layerOf(file);
      if (layer !== 'lib/domain') continue;
      for (const spec of importsOf(file)) {
        if (spec.startsWith('$lib')) {
          usedAlias.push(`${relative(REPO_ROOT, file)} → ${spec}`);
          continue;
        }
        if (spec.startsWith('.')) {
          // JSON 은 예외 — Node 도 확장자를 인식한다.
          if (spec.endsWith('.json')) continue;
          if (!spec.endsWith('.ts')) missingExt.push(`${relative(REPO_ROOT, file)} → ${spec}`);
        }
      }
    }
    assert.deepEqual(usedAlias, [], `도메인 내부에서 \$lib 사용 금지 (plain Node 실행 보장):\n${usedAlias.join('\n')}`);
    assert.deepEqual(missingExt, [], `도메인 내부 상대 import 는 .ts 확장자 유지:\n${missingExt.join('\n')}`);
  });

  it('(c) 층을 넘는 상대 경로가 없다 (같은 층 안 상대 경로만 허용)', () => {
    const violations: string[] = [];
    for (const file of files) {
      const from = layerOf(file);
      if (from === null) continue;
      for (const spec of importsOf(file)) {
        if (!spec.startsWith('.')) continue;
        const to = resolveRelativeLayer(file, spec);
        if (to === null) continue; // 정적 asset 등 층 밖 대상.
        if (to !== from) violations.push(`${relative(REPO_ROOT, file)} (${from}) → ${spec} (${to})`);
      }
    }
    assert.deepEqual(violations, [], `층 넘는 상대 경로 금지 — \$lib/... 별칭으로:\n${violations.join('\n')}`);
  });

  it('(d) src/lib/ui/ 직속에 파일이 없고 하위 폴더만 있다', () => {
    const uiRoot = join(SRC, 'lib/ui');
    const entries = readdirSync(uiRoot);
    const filesHere: string[] = [];
    const dirs: string[] = [];
    for (const e of entries) {
      const s = statSync(join(uiRoot, e));
      if (s.isDirectory()) dirs.push(e);
      else filesHere.push(e);
    }
    assert.deepEqual(filesHere, [], `src/lib/ui/ 직속 파일 금지: ${filesHere.join(', ')}`);
    for (const d of dirs) {
      assert.ok(
        UI_UNDER.has(d) || d === 'history',
        `src/lib/ui/${d} — 허용된 하위 폴더가 아니다 (허용: ${[...UI_UNDER, 'history'].join(', ')})`,
      );
    }
  });
});
