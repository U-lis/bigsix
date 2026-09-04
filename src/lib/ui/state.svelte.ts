/**
 * `AppState` 룬 스토어 (FR-1.6).
 *
 * 도메인 함수의 결과를 스토어에 반영하고 즉시 저장한다. 세팅자마다 저장 트리거가
 * 붙는다. 저장 실패는 `saveStatus` 로 노출되어 상단 배너에서 소비된다 (FR-1.8).
 *
 * 저장 데이터 자체의 상태(빈 값, 손상, 미래 버전, 접근 차단)는 `storageStatus` 다.
 * 앱은 부팅 시 이 값을 근거로 "초기 상태로 시작" 확인 UI 를 보여야 하는지 판단한다
 * (FR-1.7 / EC-1~5).
 */

import { initialState } from '../domain/index.ts';
import type { AppState } from '../domain/types.ts';
import { writeAppState } from './storage.ts';

export type SaveStatus = 'ok' | 'write-blocked';
export type StorageStatus = 'ok' | 'empty' | 'corrupt' | 'future-version' | 'read-blocked';

class AppStateStore {
  #state = $state<AppState>(initialState());
  #saveStatus = $state<SaveStatus>('ok');
  #storageStatus = $state<StorageStatus>('empty');
  #futureVersion = $state<number | null>(null);
  #corruptRaw = $state<string | null>(null);
  #readError = $state<Error | null>(null);

  get value(): AppState {
    return this.#state;
  }

  get saveStatus(): SaveStatus {
    return this.#saveStatus;
  }

  get storageStatus(): StorageStatus {
    return this.#storageStatus;
  }

  get futureVersion(): number | null {
    return this.#futureVersion;
  }

  get corruptRaw(): string | null {
    return this.#corruptRaw;
  }

  get readError(): Error | null {
    return this.#readError;
  }

  /** 부팅 결과를 스토어에 심는다. `boot()` 이 부른다. */
  initFromBoot(args: {
    state: AppState;
    storageStatus: StorageStatus;
    futureVersion?: number;
    corruptRaw?: string;
    readError?: Error;
  }): void {
    this.#state = args.state;
    this.#storageStatus = args.storageStatus;
    this.#futureVersion = args.futureVersion ?? null;
    this.#corruptRaw = args.corruptRaw ?? null;
    this.#readError = args.readError ?? null;
    // 부팅 직후 saveStatus 는 아직 안 눌러본 상태다 — ok 로 둔다.
    this.#saveStatus = 'ok';
  }

  /**
   * 도메인 함수의 결과 `AppState` 를 스토어에 반영하고 즉시 저장한다 (FR-1.6).
   *
   * 미래 버전 데이터를 만난 상태에서는 저장하지 않는다 — 사용자의 다른 기기 · 다른
   * 세션의 새 데이터를 덮어쓸 위험이 있기 때문이다 (FR-1.5 / EC-3).
   */
  apply(next: AppState): void {
    this.#state = next;
    if (this.#storageStatus === 'future-version') {
      // 상위 버전 데이터는 덮어쓰지 않는다. 화면만 갱신된다.
      return;
    }
    try {
      writeAppState(next);
      this.#saveStatus = 'ok';
    } catch {
      this.#saveStatus = 'write-blocked';
    }
  }

  /** 사용자가 "초기 상태로 시작" 을 눌렀을 때. */
  resetToInitial(): void {
    this.#state = initialState();
    this.#storageStatus = 'ok';
    this.#futureVersion = null;
    this.#corruptRaw = null;
    this.#readError = null;
    try {
      writeAppState(this.#state);
      this.#saveStatus = 'ok';
    } catch {
      this.#saveStatus = 'write-blocked';
    }
  }
}

export const appState = new AppStateStore();
