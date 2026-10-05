// @vitest-environment happy-dom
//
// 푸시 레코드 localStorage 저장 계층 테스트 (SPEC4 FR-33.9 / ADR-29).
//
// 저장 키는 `bigsix.push`, 값은 `PushRecord`. 「켜짐 여부」 는 로컬에 저장하지 않는다 —
// 정본은 `PushRelay.state()` 다. 로컬에는 사용자 설정 시각(`notifyAt`)과
// 마지막으로 릴레이에 보낸 meta 의 직렬화(`sentMeta`)만 둔다.
//
// 읽기는 어떤 상황에서도 throw 하지 않는다 — 손상된 JSON · getItem throw 모두
// 기본값으로 복구한다. 쓰기·삭제도 try/catch 로 삼킨다.

import { afterEach, beforeEach, describe, it } from 'vitest';
import assert from 'node:assert/strict';

import {
  PUSH_KEY,
  readPushRecord,
  writePushRecord,
  deletePushRecord,
} from '../../../src/lib/ui/push/storage';
import type { PushRecord } from '../../../src/lib/ui/push/types';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('push storage (FR-33.9 / ADR-29)', () => {
  it('writePushRecord → readPushRecord 왕복에서 데이터가 보존된다', () => {
    const r: PushRecord = { v: 1, notifyAt: '07:30', sentMeta: '{"v":1}' };
    writePushRecord(r);
    assert.deepEqual(readPushRecord(), r);
  });

  it('손상된 JSON 이 있으면 기본값을 반환한다 — throw 하지 않는다', () => {
    window.localStorage.setItem(PUSH_KEY, '{not valid json');
    const r = readPushRecord();
    assert.deepEqual(r, { v: 1, notifyAt: '19:00', sentMeta: null });
  });

  it('키가 비어 있으면 기본값을 반환한다', () => {
    const r = readPushRecord();
    assert.deepEqual(r, { v: 1, notifyAt: '19:00', sentMeta: null });
  });

  it('localStorage.getItem 이 throw 해도 기본값을 반환한다', () => {
    const original = window.localStorage.getItem;
    window.localStorage.getItem = () => {
      throw new Error('access blocked');
    };
    try {
      const r = readPushRecord();
      assert.deepEqual(r, { v: 1, notifyAt: '19:00', sentMeta: null });
    } finally {
      window.localStorage.getItem = original;
    }
  });

  it('저장 키는 "bigsix.push" 다', () => {
    assert.equal(PUSH_KEY, 'bigsix.push');
    const r: PushRecord = { v: 1, notifyAt: '09:00', sentMeta: null };
    writePushRecord(r);
    const raw = window.localStorage.getItem('bigsix.push');
    assert.ok(raw !== null, 'bigsix.push 에 값이 기록되어야 한다');
    assert.deepEqual(JSON.parse(raw!), r);
  });

  it('writePushRecord 는 setItem 이 throw 해도 조용히 넘긴다', () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error('quota exceeded');
    };
    try {
      writePushRecord({ v: 1, notifyAt: '19:00', sentMeta: null });
    } finally {
      window.localStorage.setItem = original;
    }
  });

  it('deletePushRecord 는 키를 지우고 다음 읽기에 기본값을 돌려준다', () => {
    writePushRecord({ v: 1, notifyAt: '20:00', sentMeta: 'x' });
    deletePushRecord();
    assert.equal(window.localStorage.getItem(PUSH_KEY), null);
    assert.deepEqual(readPushRecord(), { v: 1, notifyAt: '19:00', sentMeta: null });
  });

  it('deletePushRecord 는 removeItem 이 throw 해도 조용히 넘긴다', () => {
    const original = window.localStorage.removeItem;
    window.localStorage.removeItem = () => {
      throw new Error('blocked');
    };
    try {
      deletePushRecord();
    } finally {
      window.localStorage.removeItem = original;
    }
  });
});
