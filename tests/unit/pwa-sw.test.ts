// 서비스워커의 순수 헬퍼 유닛 테스트 (FR-38.1 · FR-38.2).
//
// `src/pwa-sw.ts` 하단의 `self.addEventListener(...)` 시퀀스는 SW 전역이 있어야
// 로드된다. 순수 로직은 `src/lib/pwa/push-handlers.ts` 로 분리해두었기 때문에
// 여기서 직접 import 해 검증한다.

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { buildNotification, pickTargetClient } from '../../src/lib/pwa/push-handlers.ts';

describe('buildNotification (FR-38.1)', () => {
  it('title/body 를 그대로 옮기고 icon 기본값은 `/icon-192.png` 다', () => {
    const out = buildNotification({ title: '빅6', body: '모범수 · 푸시업, 레그 레이즈' });
    assert.equal(out.title, '빅6');
    assert.equal(out.options.body, '모범수 · 푸시업, 레그 레이즈');
    assert.equal(out.options.icon, '/icon-192.png');
  });

  it('페이로드의 icon 이 있으면 그 값을 쓴다 (오버라이드)', () => {
    const out = buildNotification({
      title: '알림',
      body: '본문',
      icon: '/x.png',
    });
    assert.equal(out.options.icon, '/x.png');
  });
});

describe('pickTargetClient (FR-35 · FR-38.2)', () => {
  it('빈 클라이언트 목록이면 `null` — 호출자가 새 창을 연다', () => {
    assert.equal(pickTargetClient([], 'https://example.com'), null);
  });

  it('앱 origin 을 가진 창이 있으면 그 client 를 돌려준다 (FR-35.1)', () => {
    const client = { url: 'https://example.com/history' };
    assert.equal(pickTargetClient([client], 'https://example.com'), client);
  });

  it('열린 창이 다른 origin 뿐이면 `null` — 새 창을 연다 (FR-35.2)', () => {
    assert.equal(
      pickTargetClient([{ url: 'https://other.com/' }], 'https://example.com'),
      null,
    );
  });

  it('여러 창 중 origin 일치하는 첫 번째를 고른다', () => {
    const wrong = { url: 'https://other.com/' };
    const right = { url: 'https://example.com/programs' };
    assert.equal(pickTargetClient([wrong, right], 'https://example.com'), right);
  });
});
