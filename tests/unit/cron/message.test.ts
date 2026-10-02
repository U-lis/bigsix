// `cron/message.ts` 단위 테스트 (SPEC FR-35.3, FR-35.8, ADR-38).

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import {
  buildMessage,
  buildRequestId,
  buildTestMessage,
  estimatedMessageBytes,
} from '../../../cron/message.ts';
import type { DecideResult, ValidMeta } from '../../../cron/decide.ts';

const APP = 'https://bigsix.siot-ieung.duckdns.org';

const SEOUL: ValidMeta = {
  v: 1,
  tz: 'Asia/Seoul',
  notifyAt: '19:00',
  program: '모범수',
  days: { 월: ['푸시업', '레그 레이즈'], 수: ['풀업', '스쿼트'], 금: ['핸드스탠드 푸시업', '브리지'] },
};

const MON_SEOUL_1900_UTC = new Date('2026-10-05T10:00:00Z'); // Seoul Mon 19:00

function makeResult(meta: ValidMeta, id = 's_test______________AAAA'): DecideResult {
  return { subscriptionId: id, meta };
}

describe('buildMessage — FR-35.3', () => {
  it('notification.title 이 "BigSix"', () => {
    const msg = buildMessage(makeResult(SEOUL), APP, MON_SEOUL_1900_UTC);
    assert.equal(msg.notification.title, 'BigSix');
  });

  it('notification.body 가 "<program> · <exercises.join(\\", \\")>" 형식 (현지 요일)', () => {
    const msg = buildMessage(makeResult(SEOUL), APP, MON_SEOUL_1900_UTC);
    assert.equal(msg.notification.body, '모범수 · 푸시업, 레그 레이즈');
  });

  it('notification.url 이 "/"', () => {
    const msg = buildMessage(makeResult(SEOUL), APP, MON_SEOUL_1900_UTC);
    assert.equal(msg.notification.url, '/');
  });

  it('notification.tag 이 "bigsix-workday"', () => {
    const msg = buildMessage(makeResult(SEOUL), APP, MON_SEOUL_1900_UTC);
    assert.equal(msg.notification.tag, 'bigsix-workday');
  });

  it('notification.icon 이 /icon-192.png 로 끝나는 절대 HTTPS URL (IR-6 우회)', () => {
    const msg = buildMessage(makeResult(SEOUL), APP, MON_SEOUL_1900_UTC);
    assert.equal(msg.notification.icon, 'https://bigsix.siot-ieung.duckdns.org/icon-192.png');
    assert.match(msg.notification.icon, /^https:\/\/[^/]+\/icon-192\.png$/);
  });

  it('dedupKey 가 구독 타임존 기준 오늘 날짜 YYYY-MM-DD (ADR-38)', () => {
    const msg = buildMessage(makeResult(SEOUL), APP, MON_SEOUL_1900_UTC);
    assert.equal(msg.dedupKey, '2026-10-05');
  });

  it('UTC 자정 근처라도 구독 타임존 기준으로 날짜가 결정된다', () => {
    // UTC 2026-10-05 23:00 → Seoul 2026-10-06 08:00
    const utc = new Date('2026-10-05T23:00:00Z');
    // 요일 매칭을 위해 다양한 요일을 다 열어 둔 메타
    const openMeta: ValidMeta = {
      ...SEOUL,
      notifyAt: '08:00',
      days: { 화: ['푸시업'] }, // 2026-10-06 는 화요일 (Seoul)
    };
    const msg = buildMessage(makeResult(openMeta), APP, utc);
    assert.equal(msg.dedupKey, '2026-10-06');
  });

  it('to 가 subscriptionId 와 같다', () => {
    const msg = buildMessage(makeResult(SEOUL, 's_abc______________XYZ_'), APP, MON_SEOUL_1900_UTC);
    assert.equal(msg.to, 's_abc______________XYZ_');
  });
});

describe('estimatedMessageBytes — 3072 바이트 상한 (push-relay §6)', () => {
  it('다섯 프로그램 모두에서 3072 이하', () => {
    // SPEC 수치표(라벨 그대로 둔 실측 최대 408 바이트) 참고. 실제 CronMessage 는
    // 하루치 종목만 담으므로 더 작다. 각 프로그램의 최악의 날을 흉내 낸다.
    const programs: Array<{ program: string; longest: string[] }> = [
      { program: '신참', longest: ['푸시업', '레그 레이즈'] },
      { program: '모범수', longest: ['핸드스탠드 푸시업', '브리지'] },
      { program: '베테랑', longest: ['핸드스탠드 푸시업', '브리지', '풀업'] },
      {
        program: '독방 감금',
        longest: ['핸드스탠드 푸시업', '풀업', '레그 레이즈', '스쿼트', '브리지', '푸시업'],
      },
      { program: '슈퍼맥스', longest: ['핸드스탠드 푸시업', '풀업', '레그 레이즈', '스쿼트'] },
    ];
    for (const p of programs) {
      const meta: ValidMeta = {
        v: 1,
        tz: 'Asia/Seoul',
        notifyAt: '19:00',
        program: p.program,
        days: { 월: p.longest },
      };
      const msg = buildMessage(makeResult(meta), APP, MON_SEOUL_1900_UTC);
      const bytes = estimatedMessageBytes(msg);
      assert.ok(bytes <= 3072, `${p.program}: ${bytes} bytes exceeds 3072`);
    }
  });
});

describe('buildRequestId — ADR-38', () => {
  it('출력이 패턴 ^bigsix-\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}-[0-9a-f]{4,}$ 에 맞는다', () => {
    const id = buildRequestId(new Date('2026-10-05T10:00:00Z'));
    assert.match(id, /^bigsix-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}-[0-9a-f]{4,}$/);
    // 릴레이 스키마 ^[A-Za-z0-9_.:-]{1,64}$ 안에 들어온다
    assert.match(id, /^[A-Za-z0-9_.:-]{1,64}$/);
  });

  it('UTC 분 단위를 그대로 반영한다 (로컬 시각이 아니라)', () => {
    const id = buildRequestId(new Date('2026-10-05T10:00:00Z'));
    assert.ok(id.startsWith('bigsix-2026-10-05T10:00-'));
  });
});

describe('buildTestMessage — FR-35.8', () => {
  it('dedupKey 가 "test-" + YYYYMMDDHHMMSS 형식 (meta.test UTC 기준)', () => {
    const meta: ValidMeta = { ...SEOUL, test: '2026-10-05T09:58:42Z' };
    const msg = buildTestMessage(makeResult(meta), APP, MON_SEOUL_1900_UTC);
    assert.equal(msg.dedupKey, 'test-20261005095842');
  });

  it('tz="Asia/Seoul", test="2026-10-03T01:00:00Z" 에서 body 가 "테스트 · 10:00 · <정규 본문>" (SPEC FR-35.8)', () => {
    // 토요일 UTC 2026-10-03 01:00 → Seoul 2026-10-03 10:00 Sat.
    // nowUtc 를 Seoul Mon 19:00 으로 둬 정규 본문 계산 — SPEC FR-35.8 의 예시와 일치
    const meta: ValidMeta = { ...SEOUL, test: '2026-10-03T01:00:00Z' };
    const msg = buildTestMessage(makeResult(meta), APP, MON_SEOUL_1900_UTC);
    assert.ok(msg.notification.body.startsWith('테스트 · 10:00 · '));
    assert.equal(msg.notification.body, '테스트 · 10:00 · 모범수 · 푸시업, 레그 레이즈');
  });

  it('현지 요일이 meta.days 에 없는 휴식일에서는 "테스트 · HH:MM · <program> · 오늘 휴식일" 형식', () => {
    // Seoul 2026-10-06 (화) 는 모범수 휴식일 (days 에 "화" 없음)
    const utcTue = new Date('2026-10-06T10:00:00Z'); // Seoul Tue 19:00
    const meta: ValidMeta = { ...SEOUL, test: '2026-10-06T10:00:00Z' };
    const msg = buildTestMessage(makeResult(meta), APP, utcTue);
    assert.equal(msg.notification.body, '테스트 · 19:00 · 모범수 · 오늘 휴식일');
  });

  it('title · url · tag · icon 은 buildMessage 와 같다', () => {
    const meta: ValidMeta = { ...SEOUL, test: '2026-10-05T10:00:00Z' };
    const msg = buildTestMessage(makeResult(meta), APP, MON_SEOUL_1900_UTC);
    assert.equal(msg.notification.title, 'BigSix');
    assert.equal(msg.notification.url, '/');
    assert.equal(msg.notification.tag, 'bigsix-workday');
    assert.equal(msg.notification.icon, 'https://bigsix.siot-ieung.duckdns.org/icon-192.png');
  });

  it('같은 초의 두 번 호출은 같은 dedupKey (릴레이 dedup 으로 1건만 발송)', () => {
    const meta: ValidMeta = { ...SEOUL, test: '2026-10-05T09:58:42Z' };
    const a = buildTestMessage(makeResult(meta), APP, MON_SEOUL_1900_UTC);
    const b = buildTestMessage(makeResult(meta), APP, MON_SEOUL_1900_UTC);
    assert.equal(a.dedupKey, b.dedupKey);
  });
});
