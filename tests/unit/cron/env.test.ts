// `cron/env.ts` 단위 테스트 (SPEC FR-35.7).

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { readEnv } from '../../../cron/env.ts';

describe('cron/env readEnv', () => {
  it('PUSH_RELAY_API 가 없으면 변수 이름을 포함한 설명 있는 오류를 throw 한다', () => {
    assert.throws(
      () => readEnv({ PUSH_RELAY_KEY: 'prk_abc' } as NodeJS.ProcessEnv),
      /PUSH_RELAY_API/,
    );
  });

  it('PUSH_RELAY_KEY 가 없으면 변수 이름을 포함한 설명 있는 오류를 throw 한다', () => {
    assert.throws(
      () => readEnv({ PUSH_RELAY_API: 'http://127.0.0.1:8793' } as NodeJS.ProcessEnv),
      /PUSH_RELAY_KEY/,
    );
  });

  it('둘 다 비어 있으면 PUSH_RELAY_API 를 먼저 보고한다 (설정 순서 안내)', () => {
    assert.throws(
      () => readEnv({} as NodeJS.ProcessEnv),
      /PUSH_RELAY_API/,
    );
  });

  it('둘 다 있으면 그대로 돌려준다', () => {
    const env = readEnv({
      PUSH_RELAY_API: 'http://127.0.0.1:8793',
      PUSH_RELAY_KEY: 'prk_test_abc',
    } as NodeJS.ProcessEnv);
    assert.equal(env.relayApi, 'http://127.0.0.1:8793');
    assert.equal(env.relayKey, 'prk_test_abc');
  });
});
