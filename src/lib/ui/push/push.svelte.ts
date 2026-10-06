/**
 * 반응형 푸시 레코드 (SPEC4 FR-33.9).
 *
 * 룬 기반 단일 출처. 모듈 로드 시 `readPushRecord()` 로 초기화하고,
 * `setNotifyAt` · `setSentMeta` · `replace` 세터가 변경과 동시에 `writePushRecord`
 * 로 저장한다. 「켜짐 여부」는 담지 않는다 — 정본은 `PushRelay.state()` 다 (ADR-29).
 *
 * 다른 상태 스토어(`appState`)와 같은 패턴 — 클래스 하나 · 모듈 레벨 싱글톤 하나.
 */

import type { PushRecord } from './types';
import { readPushRecord, writePushRecord } from './storage';

class PushRecordStore {
  #record = $state<PushRecord>(readPushRecord());

  /** 현재 레코드 (읽기 전용). 세터로만 바꾼다. */
  get value(): PushRecord {
    return this.#record;
  }

  /** 사용자가 알림 시각을 바꿨을 때 (FR-33.5). */
  setNotifyAt(notifyAt: string): void {
    this.#record = { ...this.#record, notifyAt };
    writePushRecord(this.#record);
  }

  /**
   * 릴레이에 meta 를 보낸 뒤 그 직렬화 결과를 기록한다 (FR-34.3 비교용).
   * `null` 을 넣으면 「아직 보낸 적 없음」으로 돌아간다 (`disable()` 뒤).
   */
  setSentMeta(sentMeta: string | null): void {
    this.#record = { ...this.#record, sentMeta };
    writePushRecord(this.#record);
  }

  /** 레코드 전체를 교체한다 — 외부 import 등 특수 경로용. */
  replace(next: PushRecord): void {
    this.#record = next;
    writePushRecord(this.#record);
  }

  /**
   * 저장소에서 다시 읽어 메모리 상태를 갱신한다. 「전체 초기화」(FR-33.10) 뒤
   * `deletePushRecord` 가 돌고 난 다음, 기본값으로 돌아가게 하려고 호출한다.
   */
  reload(): void {
    this.#record = readPushRecord();
  }
}

/** 앱 세션 안에서 푸시 레코드의 단일 출처. */
export const pushRecord = new PushRecordStore();
