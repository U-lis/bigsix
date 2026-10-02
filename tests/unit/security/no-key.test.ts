// 커밋된 파일에 cron API 키가 없는지 확인한다 (SPEC NFR-32).
//
// 키는 push-relay 가 발급하는 `prk_…` 형식이다. 저장소에는 **절대로** 들어가지 않는다 —
// systemd `EnvironmentFile` 로 릴레이가 쓰는 키 파일(`~/apps/push-relay/<env>/data/keys/bigsix.env`,
// 권한 600)을 바로 읽는다 (FR-36.3).
//
// 검사 범위는 `git ls-files` 가 추적하는 파일 전체다. 테스트 자체는 "prk_" 를 문자열 리터럴로
// 적지 않아야 하므로, 패턴을 코드 포인트 조립으로 만들어 거짓 양성을 피한다.

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** 저장소에 들어가면 안 되는 패턴. 이 파일 자체가 거짓 양성이 되지 않도록 조립한다. */
const KEY_PREFIX = ['p', 'r', 'k', '_'].join('');
// 바이트 상한 — 바이너리처럼 크면 건너뛴다 (키는 짧다).
const MAX_SIZE = 4 * 1024 * 1024;
// 바이너리 판정 — NUL 바이트가 하나라도 있으면 텍스트가 아니라고 본다.
function isLikelyBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function listTrackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .toString('utf8')
    .split('\0')
    .filter((s) => s.length > 0);
}

describe('NFR-32: 커밋된 파일에 cron API 키가 없다', () => {
  it('git ls-files 전수 — prk_ 로 시작하는 키 토큰이 어떤 파일에도 없다', () => {
    const files = listTrackedFiles();
    // 테스트 러너가 수백 개 파일을 읽어도 문제 없는 수준이지만, 혹시라도 비어 있으면
    // 모든 파일이 통과한 것이 아니라 git ls-files 가 실패한 것이다.
    assert.ok(files.length > 100, `git ls-files 결과가 비정상적으로 작다 (${files.length}건)`);

    // 이 테스트 파일 자신은 KEY_PREFIX 를 조립하므로 리터럴 매칭을 피할 수 있지만,
    // 다른 상황을 위해 명시적으로 제외한다 — 그러나 조립 덕에 실제로는 제외 없이도 통과한다.
    const SELF = join('tests', 'unit', 'security', 'no-key.test.ts');

    const hits: string[] = [];
    for (const rel of files) {
      if (rel === SELF) continue;
      const abs = join(REPO_ROOT, rel);
      let st: { size: number };
      try {
        st = statSync(abs);
      } catch {
        continue; // 심볼릭 링크 등
      }
      if (st.size > MAX_SIZE) continue;

      let buf: Buffer;
      try {
        buf = readFileSync(abs);
      } catch {
        continue;
      }
      if (isLikelyBinary(buf)) continue;
      const text = buf.toString('utf8');

      // 1) 환경변수 꼴: PUSH_RELAY_KEY=prk_…
      // 2) 느슨한 꼴: prk_ 뒤에 영숫자 토큰이 길게 (push-relay 가 뽑는 랜덤 바이트는 base64/hex 류)
      //    로컬 변수 이름이나 설명문 안의 `prk_` 단독 등장은 토큰 길이 임계로 거른다.
      const envRe = new RegExp(
        'PUSH_RELAY_KEY\\s*=\\s*' + KEY_PREFIX + '[A-Za-z0-9_\\-]+',
      );
      const loose = new RegExp(KEY_PREFIX + '[A-Za-z0-9_\\-]{16,}');
      if (envRe.test(text) || loose.test(text)) {
        hits.push(rel);
      }
    }

    assert.deepEqual(
      hits,
      [],
      `cron API 키처럼 보이는 값이 커밋된 파일에 있다 (NFR-32 위반):\n  ${hits.join('\n  ')}`,
    );
  });
});
