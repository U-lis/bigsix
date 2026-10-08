/**
 * localStorage 저장 계층 (FR-1, FR-2, FR-45).
 *
 * 도메인 타입을 오염시키지 않기 위해 저장 단위는 **봉투(envelope)** 다 —
 * `{ schemaVersion, appState }` 또는 `{ schemaVersion, drafts }`.
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

import type { AppState, ProgressionId, SessionTarget } from '$lib/domain/types';

// ── 키 & 버전 ──────────────────────────────────────────────────────────────

export const APP_STATE_KEY = 'bigsix.state';
export const IN_PROGRESS_KEY = 'bigsix.session.inprogress';

/**
 * AppState 봉투 스키마 버전 (ADR-43).
 *
 * v1 → v2: `AppState.adjustedAtSessionIndex` 필드가 추가됐다. 값이 없는 v1 데이터를
 * 읽으면 그 필드가 `undefined` 인 채로 정상 복원된다 (앵커 없음 = 조정한 적 없음).
 * v2 → v3: `warmupSets` 제거 (FR-20.3 / EC-48).
 * v3 → v4: `SessionInput.target/setRpes/completedAt` · `InProgressSession.target`
 *   신설 (FR-28 / ADR-22). 모두 선택 필드라 옛 데이터에 대한 마이그레이션은 no-op.
 *   옛 진행 중 세션은 `target === undefined` 로 완료된다 (FR-28.6 / RISK-6).
 * FR-1.4 마이그레이션 체인.
 *
 * SPEC5 (FR-45 / ADR-43): 진행 중 봉투만 v5 로 올렸다. AppState 봉투는 v4 그대로다.
 * 분리하지 않으면 v0.3.0 롤백 시 `readAppState` 가 future-version 을 돌려주고 기록
 * 전체가 열리지 않는다.
 */
export const APP_STATE_SCHEMA_VERSION = 4;

/**
 * 진행 중 봉투 스키마 버전 (ADR-43).
 *
 * v4 → v5: 단일 `InProgressSession` 을 `Record<string, SessionDraft>` 로 교체한다
 * (FR-45 / EC-98). 한 종목에 work · consolidation · free 칸이 공존할 수 있다.
 */
export const IN_PROGRESS_SCHEMA_VERSION = 5;

/**
 * 호환 별칭. 다른 파일의 참조가 한 번에 깨지지 않도록 Phase 1 동안 유지한다.
 * Phase 2 이후 점진적으로 제거한다.
 */
export const CURRENT_SCHEMA_VERSION = APP_STATE_SCHEMA_VERSION;

// ── 봉투 스키마 ────────────────────────────────────────────────────────────

export interface AppStateEnvelope {
  schemaVersion: typeof APP_STATE_SCHEMA_VERSION;
  appState: AppState;
}

/**
 * v5 진행 중 봉투 (ADR-43 / FR-45).
 *
 * `drafts` 는 `draftKey(progressionId, kind)` 을 키로 하는 맵이다. 한 종목에 work
 * 칸·다지기 칸·자유 운동 칸이 모두 공존할 수 있다 (한 종목에 free 칸은 최대 하나).
 */
export interface InProgressEnvelope {
  schemaVersion: typeof IN_PROGRESS_SCHEMA_VERSION;
  drafts: Record<string, SessionDraft>;
}

/**
 * 진행 중 세션 칸 (ADR-42).
 *
 * 종목·역할마다 하나의 draft 가 열린다. `kind` 가 세션 성격을 구분한다:
 *   - work: 그날 계획된 종목의 본 세트.
 *   - consolidation: 다지기 (step - 1 수행).
 *   - free: 자유 운동. `applySession` 이 조기 반환으로 `state.steps` 를 손대지 않는다.
 *
 * `abandoned` 는 「이 단계 중단」 토글 상태다 (ADR-45). 즉시 기록하지 않고 플래그만
 * 세운다 — 「오늘 운동 마치기」 시점의 플래너가 abandon op 로 전환한다.
 *
 * `linkedTo` 는 다지기 칸이 어느 work 칸을 뒤잇는지 가리킨다 (EC-94). work 칸의
 * abandon 을 취소하면 UI 는 연결된 다지기 칸을 함께 닫을지 묻는다.
 */
export interface SessionDraft {
  /** 세션을 시작한 날짜 (FR-2.8 / D-7). 완료 시 이 값이 SessionInput.date 가 된다. */
  startedAt: string;
  progressionId: ProgressionId;
  /** 훈련 중인 단계. 다지기 기록도 이 값은 그대로 둔다. */
  step: number;
  /**
   * 실제로 수행하는 단계.
   * work = step. consolidation = step - 1. free = 사용자가 고른 단계 그대로.
   */
  performedStep: number;
  /**
   * 세션 성격.
   * free 는 자유 운동 진행 중 상태다 (FR-18.1). 완료 시 applySession 이 조기 반환으로
   * state.steps 를 손대지 않는다 (FR-18.4).
   */
  kind: 'work' | 'consolidation' | 'free';
  /** 입력된 본 세트. 순서대로 채워진다. 미입력 세트는 아직 배열에 없다. */
  workSets: SetEntry[];
  /**
   * 시작 시점의 목표 스냅샷 (FR-28.3 / ADR-22). `begin(startedAt, plan)` 에서
   * `plan.goal` · `plan.work` 를 그대로 저장한다. 자유 운동은 없다.
   * 옛 v3 이하 봉투를 읽으면 이 필드가 undefined 로 정상 복원된다 (RISK-6).
   */
  target?: SessionTarget;
  /** 「이 단계 중단」 토글 (ADR-45). 플래너가 abandon op 로 전환한다. */
  abandoned?: boolean;
  /** 다지기 칸이 뒤잇는 work 칸의 draftKey (EC-94). */
  linkedTo?: string;
}

/**
 * Phase 1 호환 별칭. 기존 코드가 `InProgressSession` 을 참조하므로 유지한다.
 * Phase 2 에서 스토어가 drafts 맵으로 완전히 전환되면 제거한다.
 */
export type InProgressSession = SessionDraft;

export interface SetEntry {
  value: number;
  /** 세트별 RPE (FR-6.7). 선택 입력. */
  rpe?: number;
  /** `unit: 'seconds'` 타이머가 시작된 시각 (Date.now()). EC-30 대비. */
  timerStartedAt?: number;
  timerEndedAt?: number;
}

// ── draftKey — 칸 키 (ADR-41) ─────────────────────────────────────────────

/**
 * 진행 중 칸의 키를 만든다 (ADR-41).
 *
 * 형식: `${progressionId}:${kind}`. 같은 종목이어도 work · consolidation · free
 * 칸은 키가 달라 따로 존재한다. 한 종목에 free 칸은 최대 하나다.
 */
export function draftKey(
  progressionId: ProgressionId,
  kind: 'work' | 'consolidation' | 'free',
): string {
  return `${progressionId}:${kind}`;
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

/** 한 draft 가 `SessionDraft` 형태를 만족하는지 얕게 확인한다. */
function isSessionDraftShape(value: unknown): value is SessionDraft {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.startedAt !== 'string') return false;
  if (typeof v.progressionId !== 'string') return false;
  if (typeof v.step !== 'number') return false;
  if (typeof v.performedStep !== 'number') return false;
  if (v.kind !== 'work' && v.kind !== 'consolidation' && v.kind !== 'free') return false;
  if (!Array.isArray(v.workSets)) return false;
  // target 은 선택 필드다. 있으면 { goal, work } 형태만 얕게 확인 —
  // 값이 있는데 형태가 다르면 corrupt (부분 손상을 조용히 넘기지 않는다).
  if ('target' in v && v.target !== undefined) {
    const t = v.target;
    if (t === null || typeof t !== 'object') return false;
    const tt = t as Record<string, unknown>;
    if (tt.goal === null || typeof tt.goal !== 'object') return false;
    if (!Array.isArray(tt.work)) return false;
  }
  // abandoned · linkedTo 는 선택 필드. 있으면 타입만 확인.
  if ('abandoned' in v && v.abandoned !== undefined && typeof v.abandoned !== 'boolean') {
    return false;
  }
  if ('linkedTo' in v && v.linkedTo !== undefined && typeof v.linkedTo !== 'string') {
    return false;
  }
  return true;
}

/** v5 봉투의 `drafts` 가 올바른 모양(Record<string, SessionDraft>) 인지 확인한다. */
function isDraftsShape(value: unknown): value is Record<string, SessionDraft> {
  if (value === null || typeof value !== 'object') return false;
  // 배열은 거절한다 — Record 로 쓰려는 자리에 배열이 오면 손상이다.
  if (Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  for (const k of Object.keys(v)) {
    if (!isSessionDraftShape(v[k])) return false;
  }
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

/** v2 → v3: 워밍업 제거 (FR-20). `AppState` 봉투에는 워밍업이 없어 no-op 이다. */
const migrateV2toV3: Migrator = (envelope) => ({ ...envelope, schemaVersion: 3 });

/**
 * v3 → v4: `SessionInput.target/setRpes/completedAt` 신설 (FR-28.6 / ADR-22).
 * 셋 다 선택 필드라 옛 record 는 필드 없이 그대로 남는다 — no-op.
 */
const migrateV3toV4: Migrator = (envelope) => ({ ...envelope, schemaVersion: 4 });

const APP_STATE_MIGRATIONS: Record<number, Migrator> = {
  1: migrateV1toV2,
  2: migrateV2toV3,
  3: migrateV3toV4,
};

/**
 * `raw.schemaVersion` 부터 CURRENT 까지 마이그레이션 체인을 적용한다.
 * 체인이 이어지지 않으면 corrupt 로 취급한다.
 */
function migrateAppStateEnvelope(raw: Record<string, unknown>): Record<string, unknown> | null {
  let cur = raw;
  let iter = 0;
  const MAX_ITER = 16;
  while (typeof cur.schemaVersion === 'number' && cur.schemaVersion < APP_STATE_SCHEMA_VERSION) {
    const step = APP_STATE_MIGRATIONS[cur.schemaVersion];
    if (step === undefined) return null;
    cur = step(cur);
    iter += 1;
    if (iter > MAX_ITER) return null;
  }
  return cur;
}

// InProgress 스키마도 같은 자리에 마이그레이션 훅을 열어 둔다.
// 정책은 동일 — 미래 버전은 실패, 낮은 버전은 체인 적용.

/** v1 → v2: 변경 없음. `AppState` 쪽만 필드가 늘었다. */
const migrateInProgressV1toV2: Migrator = (envelope) => ({ ...envelope, schemaVersion: 2 });

/**
 * v2 → v3: 진행 중 세션에서 `warmupSets` 를 버린다 (FR-20.3 / EC-48).
 * 워밍업 자체가 없어졌으므로 남은 값은 의미가 없다. 오류로 버리지 않고 무시한다 —
 * 세션 도중 앱을 갱신한 사용자가 본세트 입력분까지 잃으면 안 된다.
 */
const migrateInProgressV2toV3: Migrator = (envelope) => {
  const inProgress = envelope.inProgress;
  if (inProgress === null || typeof inProgress !== 'object') {
    return { ...envelope, schemaVersion: 3 };
  }
  const { warmupSets: _dropped, ...rest } = inProgress as Record<string, unknown>;
  return { ...envelope, inProgress: rest, schemaVersion: 3 };
};

/**
 * v3 → v4: `InProgressSession.target` 신설 (FR-28.3 / ADR-22).
 * 옛 진행 중 세션에는 target 이 없으므로 그 세션은 target 없이 완료된다 (RISK-6).
 */
const migrateInProgressV3toV4: Migrator = (envelope) => ({ ...envelope, schemaVersion: 4 });

/**
 * v4 → v5: 단일 `inProgress` 세션을 `drafts` 맵의 한 원소로 옮긴다 (FR-45 / EC-98).
 *
 * `inProgress` 가 없거나 null 이면 빈 맵으로 시작한다. 세션이 있으면
 * `draftKey(progressionId, kind)` 로 키를 만들어 그 자리에 넣는다. `target` 을 포함한
 * 모든 필드를 그대로 보존한다 (R-1). 세션이 손상돼 있으면 (예: progressionId 누락)
 * 그대로 drafts 에 넣는다 — 뒤이은 `isDraftsShape` 가 거절해 corrupt 로 떨어진다
 * (손상 감지를 조용히 삼키지 않는다, FR-1.7).
 */
const migrateInProgressV4toV5: Migrator = (envelope) => {
  const inProgress = envelope.inProgress;
  const drafts: Record<string, unknown> = {};
  if (inProgress !== null && typeof inProgress === 'object') {
    const s = inProgress as Record<string, unknown>;
    const pid = typeof s.progressionId === 'string' ? s.progressionId : 'unknown';
    const kind = typeof s.kind === 'string' ? s.kind : 'unknown';
    const key = `${pid}:${kind}`;
    drafts[key] = s;
  }
  // 봉투에서 옛 `inProgress` 필드를 떼어내고 `drafts` 로 교체한다.
  const { inProgress: _dropped, ...rest } = envelope;
  return { ...rest, drafts, schemaVersion: 5 };
};

const IN_PROGRESS_MIGRATIONS: Record<number, Migrator> = {
  1: migrateInProgressV1toV2,
  2: migrateInProgressV2toV3,
  3: migrateInProgressV3toV4,
  4: migrateInProgressV4toV5,
};

function migrateInProgressEnvelope(raw: Record<string, unknown>): Record<string, unknown> | null {
  let cur = raw;
  let iter = 0;
  const MAX_ITER = 16;
  while (
    typeof cur.schemaVersion === 'number' &&
    cur.schemaVersion < IN_PROGRESS_SCHEMA_VERSION
  ) {
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
  if (env.schemaVersion > APP_STATE_SCHEMA_VERSION) {
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
    schemaVersion: APP_STATE_SCHEMA_VERSION,
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

// ── 진행 중 세션 읽기·쓰기 (v5 drafts 맵) ─────────────────────────────────

/**
 * 진행 중 drafts 맵을 읽는다 (v5).
 *
 * 성공 시 `{ status: 'ok', value: drafts }`. 빈 봉투 또는 v4 → v5 마이그레이션 결과가
 * 빈 맵이면 `value === {}`. 저장이 없으면 `empty`.
 */
export function readInProgress(): ReadResult<Record<string, SessionDraft>> {
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

  if (env.schemaVersion > IN_PROGRESS_SCHEMA_VERSION) {
    return { status: 'future-version', version: env.schemaVersion };
  }

  const migrated = migrateInProgressEnvelope(env);
  if (migrated === null) return { status: 'corrupt', raw };

  const drafts = migrated.drafts;
  if (!isDraftsShape(drafts)) return { status: 'corrupt', raw };

  return { status: 'ok', value: drafts };
}

/** v5 drafts 맵을 저장한다. */
export function writeInProgress(drafts: Record<string, SessionDraft>): void {
  const storage = getStorage();
  if (!storage.ok) throw storage.error;

  const envelope: InProgressEnvelope = {
    schemaVersion: IN_PROGRESS_SCHEMA_VERSION,
    drafts,
  };
  storage.store.setItem(IN_PROGRESS_KEY, JSON.stringify(envelope));
}

/**
 * Phase 1 호환 래퍼 (R-2).
 *
 * 기존 스토어(`session.svelte.ts`)는 단일 세션 하나만 들고 있다. Phase 2 에서
 * 스토어가 drafts 맵으로 완전히 전환될 때까지, 이 래퍼가 단일 세션을
 * `{ [draftKey]: session }` 맵으로 감싸 `writeInProgress` 를 호출한다.
 *
 * **Phase 2 에서 제거한다.**
 */
export function writeInProgressCompat(session: InProgressSession): void {
  const key = draftKey(session.progressionId, session.kind);
  writeInProgress({ [key]: session });
}

/**
 * Phase 1 호환 래퍼 (R-2).
 *
 * `readInProgress()` 는 drafts 맵을 돌려주지만 Phase 1 의 스토어·부팅 코드는 아직
 * 단일 세션 모델이다. 이 래퍼가 drafts 맵의 첫 원소를 꺼내 돌려준다 — 저장된 칸이
 * 하나뿐이던 v4 시절과 같은 모습으로. 맵이 비어 있으면 `empty` 로 돌려준다 (옛
 * `readInProgress` 가 저장이 없을 때 돌려주던 모양과 같다).
 *
 * **Phase 2 에서 제거한다.**
 */
export function readInProgressCompat(): ReadResult<InProgressSession> {
  const r = readInProgress();
  if (r.status !== 'ok') return r;
  const keys = Object.keys(r.value);
  if (keys.length === 0) return { status: 'empty' };
  // Phase 1 에서는 칸이 최대 하나다 (스토어가 단일 세션). 여럿이면 첫 번째를 쓴다.
  return { status: 'ok', value: r.value[keys[0]] };
}

export function clearInProgress(): void {
  const storage = getStorage();
  if (!storage.ok) throw storage.error;
  storage.store.removeItem(IN_PROGRESS_KEY);
}

// ── 봉투 재사용 검증 (ADR-25 / B.6) ───────────────────────────────────────

/**
 * `validateAndMigrateAppStateEnvelope` 의 결과 판별 유니온.
 * 성공/미래 버전/손상 세 갈래는 `readAppState` 와 대응한다.
 */
export type EnvelopeValidation =
  | { ok: true; state: AppState }
  | { ok: false; reason: 'future-version'; version: number }
  | { ok: false; reason: 'corrupt' };

/**
 * 임의의 봉투를 마이그레이션 체인 + 형태 검증으로 통과시킨다 (ADR-25).
 *
 * 가져오기(FR-27)가 파일에서 봉투를 재조립해 이 함수를 호출한다.
 * 새 검증 경로를 만들지 않고 기존 `migrateAppStateEnvelope` + `isAppStateShape` 를
 * 그대로 재사용한다 — 진짜 검증 규칙은 `readAppState` 와 하나여야 하기 때문이다.
 *
 * SPEC5 (ADR-43): AppState 봉투 버전은 `APP_STATE_SCHEMA_VERSION`(4) 그대로다.
 * 진행 중 봉투의 v5 분리와 무관하다.
 */
export function validateAndMigrateAppStateEnvelope(
  envelope: { schemaVersion: number; appState: unknown },
): EnvelopeValidation {
  if (typeof envelope.schemaVersion !== 'number') return { ok: false, reason: 'corrupt' };
  if (envelope.schemaVersion > APP_STATE_SCHEMA_VERSION) {
    return { ok: false, reason: 'future-version', version: envelope.schemaVersion };
  }
  const migrated = migrateAppStateEnvelope(
    envelope as unknown as Record<string, unknown>,
  );
  if (migrated === null) return { ok: false, reason: 'corrupt' };
  const appState = migrated.appState;
  if (!isAppStateShape(appState)) return { ok: false, reason: 'corrupt' };
  return { ok: true, state: appState };
}
