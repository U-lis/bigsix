/**
 * localStorage 저장 계층 (FR-1, FR-2).
 *
 * 도메인 타입을 오염시키지 않기 위해 저장 단위는 **봉투(envelope)** 다 —
 * `{ schemaVersion, appState }` 또는 `{ schemaVersion, inProgress }`.
 * 앱 상태(`AppState`)에는 버전 필드를 섞지 않는다 (FR-1.2 / FR-1.9).
 *
 * 읽기는 예외를 던지지 않고 `ReadResult` 판별 유니온을 돌려준다. 부팅이 예외로
 * 죽지 않아야 하기 때문이다. 쓰기 실패는 예외를 그대로 전파한다 — 스토어 쪽에서
 * 잡아 배너로 노출한다 (FR-1.8, EC-4).
 *
 * 손상 감지 시 원본을 지우지 않는다 (FR-1.7 / EC-1 / EC-2). "초기 상태로 시작" 은
 * 사용자가 명시적으로 눌러야 한다.
 *
 * 미래 버전은 덮어쓰지 않는다 (FR-1.5 / EC-3). v2 를 쓰기 시작한 뒤 v1 으로 돌아가는
 * 경로는 만들지 않는다.
 */

import type { AppState, ProgressionId } from '../domain/types.ts';

// ── 키 & 버전 ──────────────────────────────────────────────────────────────

export const APP_STATE_KEY = 'bigsix.state';
export const IN_PROGRESS_KEY = 'bigsix.session.inprogress';

/**
 * 현재 저장 스키마 버전 (GLOBAL 합의 #4).
 *
 * v1 → v2: `AppState.adjustedAtSessionIndex` 필드가 추가됐다. 값이 없는 v1 데이터를
 * 읽으면 그 필드가 `undefined` 인 채로 정상 복원된다 (앵커 없음 = 조정한 적 없음).
 * FR-1.4 마이그레이션 체인의 첫 단계 v1→v2 는 이 no-op 이다.
 */
export const CURRENT_SCHEMA_VERSION = 2;

// ── 봉투 스키마 ────────────────────────────────────────────────────────────

export interface AppStateEnvelope {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  appState: AppState;
}

export interface InProgressEnvelope {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  inProgress: InProgressSession;
}

/**
 * 진행 중 세션 스키마 (FR-2.2).
 *
 * `SessionRecord` 는 완결된 세션만 표현한다. 세트 3개 중 2개까지 한 상태를 담을
 * 자리가 도메인 타입에는 없다. 그래서 UI 전용 스키마다.
 */
export interface InProgressSession {
  /** 세션을 시작한 날짜 (FR-2.8 / D-7). 완료 시 이 값이 SessionInput.date 가 된다. */
  startedAt: string;
  progressionId: ProgressionId;
  /** 훈련 중인 단계. 다지기 기록도 이 값은 그대로 둔다. */
  step: number;
  /** 실제로 수행하는 단계. 다지기면 step - 1. */
  performedStep: number;
  kind: 'work' | 'consolidation';
  /** 입력된 워밍업 세트. 순서대로 채워진다. 미입력 세트는 아직 배열에 없다. */
  warmupSets: SetEntry[];
  /** 입력된 본 세트. 순서대로 채워진다. */
  workSets: SetEntry[];
}

export interface SetEntry {
  value: number;
  /** 세트별 RPE (FR-6.7). 선택 입력. */
  rpe?: number;
  /** `unit: 'seconds'` 타이머가 시작된 시각 (Date.now()). EC-30 대비. */
  timerStartedAt?: number;
  timerEndedAt?: number;
}

// ── 판별 유니온 결과 ───────────────────────────────────────────────────────

export type ReadResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'empty' }
  | { status: 'corrupt'; raw: string }
  | { status: 'future-version'; version: number }
  | { status: 'read-blocked'; error: Error };

/**
 * `AppState` 로 안전하게 좁혀지는 최소 형태 검증.
 * 필수: `steps` (객체) · `history` (배열) · `stints` (배열) · `proposals` (배열).
 * `adjustedAtSessionIndex` 는 선택 필드다.
 */
function isAppStateShape(value: unknown): value is AppState {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.steps === null || typeof v.steps !== 'object') return false;
  if (!Array.isArray(v.history)) return false;
  if (!Array.isArray(v.stints)) return false;
  if (!Array.isArray(v.proposals)) return false;
  return true;
}

function isInProgressShape(value: unknown): value is InProgressSession {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.startedAt !== 'string') return false;
  if (typeof v.progressionId !== 'string') return false;
  if (typeof v.step !== 'number') return false;
  if (typeof v.performedStep !== 'number') return false;
  if (v.kind !== 'work' && v.kind !== 'consolidation') return false;
  if (!Array.isArray(v.warmupSets)) return false;
  if (!Array.isArray(v.workSets)) return false;
  return true;
}

// ── 마이그레이션 체인 (FR-1.4) ────────────────────────────────────────────
//
// 다음 스키마 변경 때 분기문을 늘리는 게 아니라 함수를 하나 더 잇는 형태여야 한다
// (ADR-11). v1 → v2 는 no-op 이지만 체인 구조 자체는 코드에 있다.

type Migrator = (raw: Record<string, unknown>) => Record<string, unknown>;

/** v1 → v2: `adjustedAtSessionIndex` 필드 추가 — no-op (없으면 undefined 로 정상 복원). */
const migrateV1toV2: Migrator = (envelope) => {
  // 봉투 내부의 appState 는 손대지 않는다. adjustedAtSessionIndex 는 선택 필드다.
  return { ...envelope, schemaVersion: 2 };
};

const APP_STATE_MIGRATIONS: Record<number, Migrator> = {
  1: migrateV1toV2,
};

/**
 * `raw.schemaVersion` 부터 CURRENT 까지 마이그레이션 체인을 적용한다.
 * 체인이 이어지지 않으면 corrupt 로 취급한다.
 */
function migrateAppStateEnvelope(raw: Record<string, unknown>): Record<string, unknown> | null {
  let cur = raw;
  let iter = 0;
  const MAX_ITER = 16;
  while (typeof cur.schemaVersion === 'number' && cur.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const step = APP_STATE_MIGRATIONS[cur.schemaVersion];
    if (step === undefined) return null;
    cur = step(cur);
    iter += 1;
    if (iter > MAX_ITER) return null;
  }
  return cur;
}

// InProgress 스키마도 같은 자리에 마이그레이션 훅을 열어 둔다. 지금은 v1 이 없어
// 실제 마이그레이션이 없다. 정책만 동일 — 미래 버전은 실패, 낮은 버전은 체인 적용.
const IN_PROGRESS_MIGRATIONS: Record<number, Migrator> = {
  // 미래 확장 자리.
};

function migrateInProgressEnvelope(raw: Record<string, unknown>): Record<string, unknown> | null {
  let cur = raw;
  let iter = 0;
  const MAX_ITER = 16;
  while (typeof cur.schemaVersion === 'number' && cur.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const step = IN_PROGRESS_MIGRATIONS[cur.schemaVersion];
    if (step === undefined) return null;
    cur = step(cur);
    iter += 1;
    if (iter > MAX_ITER) return null;
  }
  return cur;
}

// ── 저수준 헬퍼 ───────────────────────────────────────────────────────────

/**
 * localStorage 자체에 접근할 수 있는지 안전하게 확인 (EC-5).
 *
 * 사생활 보호 모드 · 저장 접근 차단 · SSR 환경에서 `window.localStorage` 접근이
 * 예외를 던지거나 존재하지 않는다. 이 함수는 예외 대신 결과를 돌려준다.
 */
function getStorage(): { ok: true; store: Storage } | { ok: false; error: Error } {
  try {
    if (typeof globalThis === 'undefined') {
      return { ok: false, error: new Error('globalThis 가 없다') };
    }
    // Node 환경에서 window 는 없다.
    const w = (globalThis as { localStorage?: Storage }).localStorage;
    if (w === undefined) return { ok: false, error: new Error('localStorage 가 없다') };
    return { ok: true, store: w };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { ok: false, error: err };
  }
}

// ── AppState 읽기·쓰기 ────────────────────────────────────────────────────

/**
 * 저장된 `AppState` 를 읽는다.
 * 예외를 던지지 않는다 — 부팅이 살아 있어야 배너를 띄울 수 있다.
 */
export function readAppState(): ReadResult<AppState> {
  const storage = getStorage();
  if (!storage.ok) return { status: 'read-blocked', error: storage.error };

  let raw: string | null;
  try {
    raw = storage.store.getItem(APP_STATE_KEY);
  } catch (e) {
    return { status: 'read-blocked', error: e instanceof Error ? e : new Error(String(e)) };
  }

  if (raw === null) return { status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt', raw };
  }

  if (parsed === null || typeof parsed !== 'object') return { status: 'corrupt', raw };
  const env = parsed as Record<string, unknown>;

  if (typeof env.schemaVersion !== 'number') return { status: 'corrupt', raw };

  // 미래 버전은 덮어쓰지 않는다 (FR-1.5 / EC-3).
  if (env.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return { status: 'future-version', version: env.schemaVersion };
  }

  // 낮은 버전은 마이그레이션 체인 적용 (FR-1.4).
  const migrated = migrateAppStateEnvelope(env);
  if (migrated === null) return { status: 'corrupt', raw };

  const appState = migrated.appState;
  if (!isAppStateShape(appState)) return { status: 'corrupt', raw };

  return { status: 'ok', value: appState };
}

/**
 * `AppState` 를 저장한다.
 * 실패(용량 초과, 접근 차단 등)는 예외를 그대로 던진다 — 호출자가 배너로 노출한다 (FR-1.8).
 */
export function writeAppState(state: AppState): void {
  const storage = getStorage();
  if (!storage.ok) throw storage.error;

  const envelope: AppStateEnvelope = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appState: state,
  };
  storage.store.setItem(APP_STATE_KEY, JSON.stringify(envelope));
}

/** 저장 데이터를 명시적으로 지운다. 사용자가 "초기 상태로 시작" 을 눌렀을 때만 호출한다. */
export function clearAppState(): void {
  const storage = getStorage();
  if (!storage.ok) throw storage.error;
  storage.store.removeItem(APP_STATE_KEY);
}

// ── 진행 중 세션 읽기·쓰기 ────────────────────────────────────────────────

export function readInProgress(): ReadResult<InProgressSession> {
  const storage = getStorage();
  if (!storage.ok) return { status: 'read-blocked', error: storage.error };

  let raw: string | null;
  try {
    raw = storage.store.getItem(IN_PROGRESS_KEY);
  } catch (e) {
    return { status: 'read-blocked', error: e instanceof Error ? e : new Error(String(e)) };
  }

  if (raw === null) return { status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt', raw };
  }

  if (parsed === null || typeof parsed !== 'object') return { status: 'corrupt', raw };
  const env = parsed as Record<string, unknown>;

  if (typeof env.schemaVersion !== 'number') return { status: 'corrupt', raw };

  if (env.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return { status: 'future-version', version: env.schemaVersion };
  }

  const migrated = migrateInProgressEnvelope(env);
  if (migrated === null) return { status: 'corrupt', raw };

  const inProgress = migrated.inProgress;
  if (!isInProgressShape(inProgress)) return { status: 'corrupt', raw };

  return { status: 'ok', value: inProgress };
}

export function writeInProgress(session: InProgressSession): void {
  const storage = getStorage();
  if (!storage.ok) throw storage.error;

  const envelope: InProgressEnvelope = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    inProgress: session,
  };
  storage.store.setItem(IN_PROGRESS_KEY, JSON.stringify(envelope));
}

export function clearInProgress(): void {
  const storage = getStorage();
  if (!storage.ok) throw storage.error;
  storage.store.removeItem(IN_PROGRESS_KEY);
}
