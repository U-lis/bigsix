// `cron/decide.ts` 단위 테스트 (SPEC FR-35.2, FR-35.5, FR-35.6, FR-35.8).
//
// 모든 테스트에서 `nowUtc` 를 `Date` 인자로 전달한다 — 시스템 시각을 읽지 않는다.
// 타임존 변환은 `Intl.DateTimeFormat` 이 담당한다 (외부 라이브러리 없음).

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import {
  filterSubscriptions,
  shouldSend,
  shouldTestSend,
  validateMeta,
} from '../../../cron/decide.ts';
import type { SubscriptionItem, ValidMeta } from '../../../cron/decide.ts';

const SEOUL: ValidMeta = {
  v: 1,
  tz: 'Asia/Seoul', // UTC+9, DST 없음
  notifyAt: '19:00',
  program: '모범수',
  days: { 월: ['푸시업', '레그 레이즈'], 수: ['풀업', '스쿼트'], 금: ['핸드스탠드 푸시업', '브리지'] },
};

// 2026-10-05 is Monday. Seoul = UTC+9.
const MON_1900_SEOUL = new Date('2026-10-05T10:00:00Z'); // Seoul: 2026-10-05 19:00 Mon
const MON_1829_SEOUL = new Date('2026-10-05T09:29:00Z'); // Seoul: 18:29 Mon (전)
const MON_1930_SEOUL = new Date('2026-10-05T10:30:00Z'); // Seoul: 19:30 Mon (경계 = +30분 → 포함 안 함)
const MON_1929_SEOUL = new Date('2026-10-05T10:29:59Z'); // Seoul: 19:29:59 Mon → 포함
const TUE_1900_SEOUL = new Date('2026-10-06T10:00:00Z'); // Seoul: 화 19:00 (휴식일)

describe('shouldSend — FR-35.2-3', () => {
  it('현지 시각이 [notifyAt, notifyAt + 30분) 안이고 요일 키가 있으면 true', () => {
    assert.equal(shouldSend(SEOUL, MON_1900_SEOUL), true);
    assert.equal(shouldSend(SEOUL, MON_1929_SEOUL), true);
  });

  it('현지 시각이 notifyAt 이전이면 false', () => {
    assert.equal(shouldSend(SEOUL, MON_1829_SEOUL), false);
  });

  it('현지 시각이 notifyAt + 30분 이후면 false (경계 포함 안 함)', () => {
    assert.equal(shouldSend(SEOUL, MON_1930_SEOUL), false);
  });

  it('현지 요일이 meta.days 에 없으면 false — 휴식일 (EC-79)', () => {
    assert.equal(shouldSend(SEOUL, TUE_1900_SEOUL), false);
  });

  it('창이 자정을 넘지 않는다 — 23:50 설정에서 23:55 는 true, 00:10 (다음날) 은 false (EC-80)', () => {
    const lateMeta: ValidMeta = { ...SEOUL, notifyAt: '23:50' };
    // Seoul: 2026-10-05 23:55 Mon → UTC = 14:55Z
    const localMon2355 = new Date('2026-10-05T14:55:00Z');
    // Seoul: 2026-10-06 00:10 Tue → UTC = 15:10Z
    const localTue0010 = new Date('2026-10-05T15:10:00Z');
    assert.equal(shouldSend(lateMeta, localMon2355), true);
    assert.equal(shouldSend(lateMeta, localTue0010), false);
  });

  it('meta.days[요일] 이 빈 배열이면 false', () => {
    const emptyMeta: ValidMeta = { ...SEOUL, days: { 월: [] } };
    assert.equal(shouldSend(emptyMeta, MON_1900_SEOUL), false);
  });
});

describe('validateMeta — FR-35.5', () => {
  it('v !== 1 이면 null', () => {
    assert.equal(validateMeta({ ...SEOUL, v: 2 }), null);
  });

  it('알 수 없는 tz 문자열이면 null', () => {
    assert.equal(validateMeta({ ...SEOUL, tz: 'Mars/Olympus' }), null);
  });

  it('notifyAt 이 HH:MM 형식이 아니면 null', () => {
    assert.equal(validateMeta({ ...SEOUL, notifyAt: '7:00' }), null);
    assert.equal(validateMeta({ ...SEOUL, notifyAt: '19:0' }), null);
    assert.equal(validateMeta({ ...SEOUL, notifyAt: '25:00' }), null);
    assert.equal(validateMeta({ ...SEOUL, notifyAt: '19:60' }), null);
    assert.equal(validateMeta({ ...SEOUL, notifyAt: 'abcde' }), null);
  });

  it('필수 필드가 없으면 null', () => {
    assert.equal(validateMeta({ v: 1, tz: 'Asia/Seoul' }), null);
    assert.equal(validateMeta(null), null);
    assert.equal(validateMeta('not an object'), null);
    assert.equal(validateMeta({ ...SEOUL, days: null }), null);
    assert.equal(validateMeta({ ...SEOUL, days: 'wrong-type' }), null);
  });

  it('days 안 값이 string[] 가 아니면 null', () => {
    assert.equal(validateMeta({ ...SEOUL, days: { 월: 'not-array' } }), null);
    assert.equal(validateMeta({ ...SEOUL, days: { 월: [1, 2] } }), null);
  });

  it('유효한 meta 는 그대로 돌려준다', () => {
    const out = validateMeta(SEOUL);
    assert.ok(out !== null);
    assert.deepEqual(out, SEOUL);
  });

  it('test 필드가 문자열이면 포함해 돌려준다', () => {
    const withTest = { ...SEOUL, test: '2026-10-05T10:00:00Z' };
    const out = validateMeta(withTest);
    assert.ok(out !== null);
    assert.equal(out!.test, '2026-10-05T10:00:00Z');
  });
});

describe('filterSubscriptions — FR-35.2 · FR-35.5', () => {
  it('서로 다른 타임존 두 구독이 독립적으로 판정된다 — 하나는 발송, 하나는 건너뜀', () => {
    // 같은 nowUtc 에서 Seoul=Mon 19:00 (send), New York(EDT=UTC-4)=Mon 06:00 (skip)
    const items: SubscriptionItem[] = [
      {
        id: 's_seoulMon_______AAAAAAA', // 패턴은 테스트에서 느슨해도 된다
        meta: SEOUL,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 's_nyMon__________BBBBBBB',
        meta: { ...SEOUL, tz: 'America/New_York' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const out = filterSubscriptions(items, MON_1900_SEOUL);
    assert.equal(out.length, 1);
    assert.equal(out[0].subscriptionId, 's_seoulMon_______AAAAAAA');
  });

  it('검증 실패 구독은 건너뛰고 유효한 구독만 돌려준다 (한 구독의 문제로 전체가 멈추지 않는다)', () => {
    const items: SubscriptionItem[] = [
      {
        id: 's_bad',
        meta: { v: 2, tz: 'Asia/Seoul' }, // v 불일치
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 's_good',
        meta: SEOUL,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const out = filterSubscriptions(items, MON_1900_SEOUL);
    assert.equal(out.length, 1);
    assert.equal(out[0].subscriptionId, 's_good');
  });
});

describe('shouldTestSend — FR-35.8', () => {
  it('meta.test 가 nowUtc 보다 9분 전이면 true', () => {
    const now = new Date('2026-10-05T10:09:00Z');
    const meta: ValidMeta = { ...SEOUL, test: '2026-10-05T10:00:00Z' };
    assert.equal(shouldTestSend(meta, now), true);
  });

  it('meta.test 가 nowUtc 와 정확히 같은 순간이면 true (10분 창에 포함)', () => {
    const now = new Date('2026-10-05T10:00:00Z');
    const meta: ValidMeta = { ...SEOUL, test: '2026-10-05T10:00:00Z' };
    assert.equal(shouldTestSend(meta, now), true);
  });

  it('meta.test 가 nowUtc 보다 11분 전이면 false', () => {
    const now = new Date('2026-10-05T10:11:00Z');
    const meta: ValidMeta = { ...SEOUL, test: '2026-10-05T10:00:00Z' };
    assert.equal(shouldTestSend(meta, now), false);
  });

  it('meta.test 가 미래이면 false (음수 diff 는 보내지 않는다)', () => {
    const now = new Date('2026-10-05T10:00:00Z');
    const meta: ValidMeta = { ...SEOUL, test: '2026-10-05T10:05:00Z' };
    assert.equal(shouldTestSend(meta, now), false);
  });

  it('meta.test 가 없으면 false', () => {
    assert.equal(shouldTestSend(SEOUL, new Date('2026-10-05T10:00:00Z')), false);
  });

  it('meta.test 가 Invalid Date 로 파싱되면 false', () => {
    const meta: ValidMeta = { ...SEOUL, test: 'not-a-date' };
    assert.equal(shouldTestSend(meta, new Date('2026-10-05T10:00:00Z')), false);
  });
});
