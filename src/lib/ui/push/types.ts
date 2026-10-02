/**
 * 푸시 알림 UI 레이어 타입 (SPEC4 FR-33 / FR-34, GLOBAL 데이터 모델).
 *
 * `PushMeta` 는 앱이 릴레이에 보내는 구독 메타 JSON — cron 이 그대로 돌려받는다.
 * cron 이 bigsix 도메인(진행 상태 · 종목 잠금)을 몰라도 알림 문구를 조립할 수 있도록
 * 「알림 문구 재료」를 미리 담아 보낸다 (FR-34).
 *
 * `PushRecord` 는 로컬 저장용. 켜짐 여부는 넣지 않는다 — 정본은 `PushRelay.state()`
 * 다 (ADR-29). 사용자 설정 시각과 마지막으로 보낸 meta 의 직렬화만 둔다.
 */

import type { Weekday } from '$lib/domain/types';

/**
 * UI 가 표시하는 푸시 상태. 릴레이 `client.js` 의 `state()` 결과와 로딩 중을 더한 것.
 * 「켜짐 여부의 정본」은 릴레이다 (ADR-29) — 이 값은 그 결과를 UI 가 쓸 수 있게 좁힌 것.
 */
export type PushState = 'loading' | 'unsupported' | 'denied' | 'off' | 'on';

/**
 * 릴레이 `enable()` · `disable()` 가 던지는 `Error.code` 값 (연동 문서 §2 표).
 * 설정 화면이 각 code 를 사실 문구로 바꿔 표시한다 (FR-33.8).
 */
export type PushErrorCode =
  | 'denied'
  | 'unsupported'
  | 'no-service-worker'
  | 'origin-not-allowed'
  | 'push-service-not-allowed'
  | 'subscribe'
  | 'network'
  | 'server';

/**
 * 구독 메타. 릴레이가 해석하지 않고 cron 이 구독 목록으로 돌려받는 JSON.
 * 직렬화 결과가 1024 바이트 이하다 (FR-34.2).
 *
 * `days` 는 종목이 있는 요일만 키로 들어온다 — 휴식일은 빠진다.
 * 값은 `planDay(...).exercises` 를 지나온 종목의 한국어명 배열이다 (잠긴 종목 제외).
 */
export interface PushMeta {
  v: 1;
  /** IANA 타임존 (예: `"Asia/Seoul"`). 기기 타임존을 그대로 싣는다 (H-2). */
  tz: string;
  /** 사용자가 정한 알림 시각. `"HH:MM"` 분 단위 (H-6). */
  notifyAt: string;
  /** 현재 구간 프로그램의 한국어명. */
  program: string;
  /** 요일 → 그날 종목 한국어명 배열. 종목이 없는 요일은 키 없음. */
  days: Partial<Record<Weekday, string[]>>;
}

/**
 * localStorage `bigsix.push` 에 저장하는 레코드.
 * 「켜짐 여부」는 담지 않는다 — ADR-29 가 금한다.
 */
export interface PushRecord {
  v: 1;
  /** 사용자가 설정한 알림 시각. 꺼져 있어도 저장해 둔다 (FR-33.5). 기본값 `"19:00"`. */
  notifyAt: string;
  /** 마지막으로 릴레이에 보낸 `PushMeta` 의 `JSON.stringify` 결과. 없으면 null. */
  sentMeta: string | null;
}
