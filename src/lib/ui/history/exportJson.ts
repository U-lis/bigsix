/**
 * 내보내기 JSON 조립 (FR-26.2 · ADR-25 · GLOBAL (B.3)).
 *
 * 파일 최상위는 `{meta, appState, catalog}` — 사람과 AI 가 함께 읽는 파일이자
 * 가져오기 때 기존 마이그레이션 체인을 그대로 태울 봉투의 근원이다.
 *
 * 이 함수는 **순수 함수다** (FR-26.6 / EC-59): `state` 를 참조 그대로 담아내고
 * 값을 새로 만들지 않는다. `catalog` 는 종목·단계의 한국어 이름과 기준 수치만
 * 뽑아 표시용 프로젝션으로 담는다 — 사람이 CSV 열을 눈으로 읽지 않고 파일
 * 하나로 문맥을 이해할 수 있게 하기 위함이다.
 *
 * `meta` 는 호출자가 만들어 넘긴다 — 컴포넌트가 `todayClock.nowIsoLocal()` 과
 * `__APP_VERSION__` · `__COMMIT_HASH__` 를 채운다. 순수 함수를 유지하기 위한 결정이다.
 *
 * 진행 중 세션은 여기 담기지 않는다 — 함수가 `inProgress` 를 인자로 받지 않는다 (EC-59).
 */

import { getProgression } from '$lib/domain';
import type {
  AppState, Catalog, ProgressionId, Standard, Step, StandardLabel,
} from '$lib/domain/types';

/**
 * 파일 최상위 `meta`. 호출자가 만들어 넘긴다.
 * - `app` 은 항상 `'bigsix'`. 다른 값을 쓰지 않는다 — 문자열로 검증하기 쉬운 표식.
 * - `version` 은 `__APP_VERSION__`. `commit` 은 `__COMMIT_HASH__`.
 * - `exportedAt` 은 `todayClock.nowIsoLocal()` (로컬 오프셋 포함 ISO 8601, ADR-24).
 * - `schemaVersion` 은 `CURRENT_SCHEMA_VERSION` (현재 4).
 */
export interface ExportMeta {
  app: 'bigsix';
  version: string;
  commit: string;
  exportedAt: string;
  schemaVersion: number;
}

// ── 카탈로그 표시용 프로젝션 (GLOBAL B.3) ────────────────────────────────────

/** 한 기준(초·중·상·최상)의 표시용 값. `Standard` 를 그대로 옮긴다. */
type StandardProjection = { sets: number; value: number | [number, number] };

/** 한 단계의 표시용 값. */
interface StepProjection {
  n: number;
  nameKo: string;
  unit: 'reps' | 'seconds';
  perSide: boolean;
  beginner: StandardProjection;
  intermediate: StandardProjection;
  progression?: StandardProjection;
  elite?: StandardProjection;
}

/** 한 종목의 표시용 값 (steps 배열 포함). */
interface ProgressionProjection {
  nameKo: string;
  steps: StepProjection[];
}

interface CatalogProjection {
  progressions: Record<ProgressionId, ProgressionProjection>;
}

const BIG_SIX: readonly ProgressionId[] = [
  'pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu',
];

function stdCopy(std: Standard): StandardProjection {
  // 배열이면 그대로 옮긴다 (브리지 마스터 10~30).
  const v = std.value;
  return { sets: std.sets, value: Array.isArray(v) ? [v[0], v[1]] : v };
}

function stepProjection(step: Step): StepProjection {
  const out: StepProjection = {
    n: step.n,
    nameKo: step.name.ko,
    unit: step.unit,
    perSide: step.perSide === true,
    beginner: stdCopy(step.beginner),
    intermediate: stdCopy(step.intermediate),
  };
  if (step.progression) out.progression = stdCopy(step.progression);
  if (step.elite) out.elite = stdCopy(step.elite);
  return out;
}

function catalogProjection(catalog: Catalog): CatalogProjection {
  const progressions = {} as Record<ProgressionId, ProgressionProjection>;
  for (const id of BIG_SIX) {
    const p = getProgression(catalog, id);
    progressions[id] = {
      nameKo: p.name.ko,
      steps: p.steps.map(stepProjection),
    };
  }
  return { progressions };
}

// ── 조립 ─────────────────────────────────────────────────────────────────────

export interface ExportFile {
  meta: ExportMeta;
  appState: AppState;
  catalog: CatalogProjection;
}

/**
 * 내보내기 파일 값을 만든다.
 *
 * 상태는 참조 그대로 담긴다 — 호출자가 `JSON.stringify` 로 직렬화하면 그때
 * 깊은 복사가 일어난다. 이 함수 자체는 상태를 바꾸지 않는다 (FR-26.6).
 *
 * `_std_labels` 같은 라벨 목록은 담지 않는다 — 카탈로그 자체가 라벨을 나타낸다.
 * 파일을 읽는 쪽(사람 · AI) 이 `beginner/intermediate/progression/elite` 를 알아본다.
 */
export function buildExportJson(args: {
  state: AppState;
  catalog: Catalog;
  meta: ExportMeta;
}): ExportFile {
  return {
    meta: args.meta,
    appState: args.state,
    catalog: catalogProjection(args.catalog),
  };
}

// 라벨은 나중에 CSV 도 함께 참조할 수 있게 상수로 노출한다.
export const STANDARD_LABELS: readonly StandardLabel[] = [
  'beginner', 'intermediate', 'progression', 'elite',
];
