// 설정 화면 로직 순수 함수 테스트 (SPEC4 FR-33 · GLOBAL ADR-33 · PHASE_4_PLAN).
//
// 설정 화면(`src/routes/settings/+page.svelte`) 은 DOM 테스트 인프라 없음 —
// 룬·릴레이에 묶이지 않는 판정 로직을 순수 함수로 뺀다. 이 파일이 그 함수들을 검증한다.
//
// 함수 목록 (`src/lib/ui/push/pushUI.ts`):
//   - stateToLabel: `PushState` → 안내 문구 (FR-33.2(a))
//   - errorToLabel: `PushErrorCode` → 사실 문구 (FR-33.8)
//   - canEnable: 켜기 버튼 활성 여부 (FR-33.3 · FR-33.7)
//   - canDisable: 끄기 버튼 활성 여부 (FR-33.4)
//   - timeInputEnabled: 시각 입력 활성 여부 (FR-33.5)
//   - isDevRelay: 테스트 발송 버튼 노출 여부 (FR-33.11)

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import {
  stateToLabel,
  errorToLabel,
  canEnable,
  canDisable,
  timeInputEnabled,
  isDevRelay,
} from '../../../src/lib/ui/push/pushUI';
import type { PushErrorCode } from '../../../src/lib/ui/push/types';

describe('stateToLabel', () => {
  it('on → 「알림 켜짐」', () => {
    assert.equal(stateToLabel('on'), '알림 켜짐');
  });

  it('off → 「알림 꺼짐」', () => {
    assert.equal(stateToLabel('off'), '알림 꺼짐');
  });

  it('denied → SPEC FR-33.2(a) 정확한 문구', () => {
    assert.equal(
      stateToLabel('denied'),
      '알림 권한 거부됨 — 브라우저 설정에서 바꿀 수 있습니다',
    );
  });

  it('unsupported → SPEC FR-33.2(a) 정확한 문구', () => {
    assert.equal(
      stateToLabel('unsupported'),
      '이 브라우저에서는 푸시 알림을 쓸 수 없습니다. iPhone 은 홈 화면에 추가한 앱에서만 됩니다',
    );
  });

  it('loading → 「확인 중」', () => {
    assert.equal(stateToLabel('loading'), '확인 중');
  });
});

describe('canEnable', () => {
  it('state=off 이고 프로그램 선택되어 있으면 true', () => {
    assert.equal(canEnable('off', true), true);
  });

  it('state=off 이지만 프로그램 미선택이면 false (EC-77)', () => {
    assert.equal(canEnable('off', false), false);
  });

  it('state=on 이면 프로그램 선택과 무관하게 false', () => {
    assert.equal(canEnable('on', true), false);
    assert.equal(canEnable('on', false), false);
  });

  it('state=denied / unsupported / loading 이면 false', () => {
    assert.equal(canEnable('denied', true), false);
    assert.equal(canEnable('unsupported', true), false);
    assert.equal(canEnable('loading', true), false);
  });
});

describe('canDisable', () => {
  it('state=on 이면 true', () => {
    assert.equal(canDisable('on'), true);
  });

  it('state=off 이면 false', () => {
    assert.equal(canDisable('off'), false);
  });

  it('state=denied / unsupported / loading 이면 false', () => {
    assert.equal(canDisable('denied'), false);
    assert.equal(canDisable('unsupported'), false);
    assert.equal(canDisable('loading'), false);
  });
});

describe('timeInputEnabled', () => {
  it('denied → false', () => {
    assert.equal(timeInputEnabled('denied'), false);
  });

  it('unsupported → false', () => {
    assert.equal(timeInputEnabled('unsupported'), false);
  });

  it('off → true (FR-33.5 꺼져 있어도 시각은 쓸 수 있다)', () => {
    assert.equal(timeInputEnabled('off'), true);
  });

  it('on → true', () => {
    assert.equal(timeInputEnabled('on'), true);
  });

  it('loading → true', () => {
    assert.equal(timeInputEnabled('loading'), true);
  });
});

describe('errorToLabel', () => {
  it('모든 8종 code 에 비어 있지 않은 문자열을 반환한다', () => {
    const codes: PushErrorCode[] = [
      'denied',
      'unsupported',
      'no-service-worker',
      'origin-not-allowed',
      'push-service-not-allowed',
      'subscribe',
      'network',
      'server',
    ];
    for (const code of codes) {
      const label = errorToLabel(code);
      assert.equal(typeof label, 'string');
      assert.ok(label.length > 0, `errorToLabel(${code}) 는 비어 있지 않아야 한다`);
    }
  });

  it('8종 code 라벨이 서로 다르다 (고유 안내)', () => {
    const codes: PushErrorCode[] = [
      'denied',
      'unsupported',
      'no-service-worker',
      'origin-not-allowed',
      'push-service-not-allowed',
      'subscribe',
      'network',
      'server',
    ];
    const labels = codes.map(errorToLabel);
    const unique = new Set(labels);
    assert.equal(unique.size, codes.length, '각 code 는 고유한 문구를 가져야 한다');
  });
});

describe('isDevRelay', () => {
  it('dev 주소와 정확히 같으면 true', () => {
    assert.equal(isDevRelay('https://push-dev.siot-ieung.duckdns.org'), true);
  });

  it('운영 주소면 false', () => {
    assert.equal(isDevRelay('https://push.siot-ieung.duckdns.org'), false);
  });

  it('빈 문자열이면 false', () => {
    assert.equal(isDevRelay(''), false);
  });

  it('임의 다른 호스트면 false', () => {
    assert.equal(isDevRelay('https://push-dev.siot-ieung.duckdns.org/'), false);
    assert.equal(isDevRelay('http://push-dev.siot-ieung.duckdns.org'), false);
  });
});
