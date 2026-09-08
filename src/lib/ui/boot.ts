/**
 * 부팅 시퀀스 (FR-3).
 *
 * 순서는 다음으로 **고정**한다.
 *   1. `readAppState` — 저장된 상태를 읽는다 (FR-1.3 / FR-1.7)
 *   2. 오늘 날짜 — 로컬 자정 기준 (FR-4)
 *   3. `advanceProposals` — 부팅당 1회 호출 (FR-3.2 / EC-19)
 *   4. `planOn` — 오늘 할 일을 얻는다 (FR-3.1)
 *   5. `readInProgress` — 진행 중 세션 복원 (FR-2.4)
 *
 * `advanceProposals` 로 상태가 바뀌었으면 그 자리에서 저장한다 (FR-3.4).
 * `planOn` 은 `{ kind: 'no-program' }` 을 돌려줄 수 있으므로 예외로 분기하지 않는다
 * (FR-3.3). `stored.status === 'empty'` 이면 첫 실행 신호를 함께 돌려준다 (FR-3.5).
 */

import {
  advanceProposals,
  initialState,
  planOn,
  type AppState,
  type Catalog,
  type DayAgenda,
  type IsoDate,
} from '../domain/index.ts';
import { loadCatalog } from '../data/catalog.ts';
import {
  readAppState,
  readInProgress,
  writeAppState,
  type InProgressSession,
} from './storage.ts';
import type { StorageStatus } from './state.svelte.ts';

export interface BootResult {
  state: AppState;
  catalog: Catalog;
  today: IsoDate;
  agenda: DayAgenda;
  inProgress: InProgressSession | null;
  storageStatus: StorageStatus;
  /** 미래 버전 데이터를 만났을 때만 채워진다 (FR-1.5 / EC-3). */
  futureVersion?: number;
  /** 손상 데이터를 만났을 때 원본. FR-1.7 로 "초기 상태로 시작" 확인 UI 근거. */
  corruptRaw?: string;
  /** 저장소 접근 자체가 막힌 경우 (EC-5). */
  readError?: Error;
  /**
   * 저장된 상태가 아예 없어 첫 실행으로 판정될 때 (FR-3.5).
   * corrupt · future-version · read-blocked 는 첫 실행이 아니다 — 오히려 그 사실을
   * 사용자가 결정해야 한다.
   */
  needsFirstRun: boolean;
}

/**
 * 부팅 순서를 함수 하나가 소유해 순서 어긋남을 구조적으로 막는다 (FR-3.1).
 * @param today 오늘 날짜(IsoDate). UI 층에서 `todayClock.today` 를 주입한다.
 */
export function boot(today: IsoDate): BootResult {
  const catalog = loadCatalog(); // FR-10 — 이 한 곳
  const stored = readAppState(); // FR-1.3 / FR-1.7

  let storageStatus: StorageStatus;
  let initial: AppState;
  let futureVersion: number | undefined;
  let corruptRaw: string | undefined;
  let readError: Error | undefined;
  let needsFirstRun = false;

  switch (stored.status) {
    case 'ok':
      initial = stored.value;
      storageStatus = 'ok';
      break;
    case 'empty':
      initial = initialState();
      storageStatus = 'empty';
      needsFirstRun = true; // FR-3.5
      break;
    case 'corrupt':
      // 원본을 지우지 않는다 (FR-1.7). 화면에서 "초기 상태로 시작" 을 명시적으로 눌러야 한다.
      // 그동안은 앱을 굴려야 하므로 임시로 초기 상태를 쓰되, 저장하지는 않는다.
      initial = initialState();
      storageStatus = 'corrupt';
      corruptRaw = stored.raw;
      break;
    case 'future-version':
      // 덮어쓰지 않는다 (FR-1.5 / EC-3). 임시로 초기 상태로 굴린다.
      initial = initialState();
      storageStatus = 'future-version';
      futureVersion = stored.version;
      break;
    case 'read-blocked':
      // 저장소 접근 자체가 막혀 있다 (EC-5). 초기 상태로 굴린다.
      initial = initialState();
      storageStatus = 'read-blocked';
      readError = stored.error;
      break;
  }

  // 제안 생성의 단일 진입점 (FR-3.2 / ADR-6). 부팅당 1회.
  const state = advanceProposals(initial, catalog, today);

  // 상태가 실제로 바뀌었으면 저장한다 (FR-3.4).
  // corrupt · future-version · read-blocked 상태에서는 저장하지 않는다 —
  // 사용자 승인이 있어야 원본을 덮어쓸 수 있다 (FR-1.5 / FR-1.7).
  if (state !== initial && storageStatus === 'ok') {
    try {
      writeAppState(state);
    } catch {
      // 여기서 실패해도 부팅은 계속한다. 저장 실패는 apply() 시점에 saveStatus 로 다시 잡힌다.
    }
  }

  const agenda = planOn(state, catalog, today); // FR-3.1 (4)

  // 진행 중 세션 복원 (FR-2.4). 손상됐거나 접근 차단이면 null 로 둔다 —
  // AppState 처럼 확인 UI 로 다루기에는 무겁다. 사용자는 세션을 다시 시작하면 된다.
  const ip = readInProgress();
  const inProgress: InProgressSession | null = ip.status === 'ok' ? ip.value : null;

  const result: BootResult = {
    state,
    catalog,
    today,
    agenda,
    inProgress,
    storageStatus,
    needsFirstRun,
  };
  if (futureVersion !== undefined) result.futureVersion = futureVersion;
  if (corruptRaw !== undefined) result.corruptRaw = corruptRaw;
  if (readError !== undefined) result.readError = readError;
  return result;
}
