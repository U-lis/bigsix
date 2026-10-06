/**
 * 푸시 레코드 localStorage 저장 (SPEC4 FR-33.9 / ADR-29).
 *
 * 키 `bigsix.push` 에 `PushRecord` 를 담는다. 「켜짐 여부」는 저장하지 않는다 —
 * 정본은 `PushRelay.state()` 다. 로컬에는 사용자 설정 시각과 마지막으로 보낸 meta 만.
 *
 * 세 함수 모두 throw 하지 않는다. 읽기는 손상된 JSON · getItem throw 모두
 * 기본값 `{ v:1, notifyAt:'19:00', sentMeta:null }` 으로 복구한다 — 부팅이 푸시 레코드
 * 때문에 깨지지 않게 하기 위해서다 (`bigsix.state` 쪽의 `readAppState` 는 손상을
 * 외부로 알리지만 푸시 레코드는 설정 가치가 낮아 그냥 기본값으로 떨어뜨린다).
 * 쓰기·삭제도 try/catch 로 삼킨다 — 설정 변경이 저장 실패로 UI 를 끊지 않도록.
 */

import type { PushRecord } from './types';

/** localStorage 키. */
export const PUSH_KEY = 'bigsix.push';

const DEFAULT_RECORD: PushRecord = { v: 1, notifyAt: '19:00', sentMeta: null };

/**
 * `PushRecord` 의 모양을 확인한다. 알려진 필드만 검사 — 미래 필드는 무시한다.
 */
function isRecordShape(x: unknown): x is PushRecord {
  if (x === null || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  if (r.v !== 1) return false;
  if (typeof r.notifyAt !== 'string') return false;
  if (r.sentMeta !== null && typeof r.sentMeta !== 'string') return false;
  return true;
}

/**
 * 저장된 `PushRecord` 를 읽는다.
 *
 * 손상된 JSON · 비정상 형태 · `getItem` throw 등 어떤 상황에서도 기본값
 * `{ v:1, notifyAt:'19:00', sentMeta:null }` 을 돌려준다 — 이 함수는 throw 하지 않는다.
 */
export function readPushRecord(): PushRecord {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(PUSH_KEY);
  } catch {
    return { ...DEFAULT_RECORD };
  }
  if (raw === null) return { ...DEFAULT_RECORD };

  try {
    const parsed = JSON.parse(raw);
    if (!isRecordShape(parsed)) return { ...DEFAULT_RECORD };
    return parsed;
  } catch {
    return { ...DEFAULT_RECORD };
  }
}

/**
 * `PushRecord` 를 저장한다. `setItem` 이 throw 해도 조용히 넘긴다 —
 * 설정 변경이 저장소 접근 실패로 UI 를 끊지 않도록.
 */
export function writePushRecord(r: PushRecord): void {
  try {
    window.localStorage.setItem(PUSH_KEY, JSON.stringify(r));
  } catch {
    // 저장 실패는 조용히 넘긴다. 다음 변경 때 다시 시도된다.
  }
}

/**
 * 저장된 레코드를 지운다. 「전체 초기화」(FR-33.10) 가 호출한다.
 * `removeItem` 이 throw 해도 조용히 넘긴다.
 */
export function deletePushRecord(): void {
  try {
    window.localStorage.removeItem(PUSH_KEY);
  } catch {
    // 삭제 실패는 조용히 넘긴다.
  }
}
