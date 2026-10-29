import { LABEL_TO_ID } from './schedule.ts';
import { WEEKDAYS } from './types.ts';
import type {
  AppState, Catalog, CustomProgramInput, Program, ProgressionId, Weekday,
} from './types.ts';

/**
 * 커스텀 프로그램 (#13).
 *
 * 사용자가 만든 프로그램은 카탈로그의 5종과 **같은 `Program` 모양**으로 `state.customPrograms`
 * 에 저장된다. `withCustomPrograms` 가 둘을 합친 카탈로그를 돌려주면, 계획 · 구간 · 기록 조회
 * 등 `catalog` 를 받는 기존 함수가 전부 그대로 돈다 — 커스텀 전용 분기를 따로 두지 않는다.
 *
 * 자동 전환 제안은 내지 않는다. `nextProgramId` 가 `PROGRAM_ORDER` 밖의 id 에 null 을
 * 돌려주므로 `proposeSwitch` 가 첫 단계에서 끝난다.
 *
 * 한 번이라도 구간에 쓰인 프로그램은 고치거나 지울 수 없다. 지난 날의 계획(`reviewDay`)은
 * 요일표에서 다시 계산되므로, 요일표가 바뀌면 지난 날의 수행 · 미수행 판정이 바뀐다.
 * 고치고 싶으면 복제해서 새로 만든다.
 */

/** 커스텀 프로그램 id 접두어. 카탈로그 5종의 id 와 겹치지 않는다. */
export const CUSTOM_PREFIX = 'custom-';

/** 프로그램 이름 최대 길이 (글자 수). */
export const CUSTOM_NAME_MAX = 20;

/** 요일 안 종목 정렬 순서. 화면과 알림이 같은 순서를 보도록 고정한다. */
const ORDER: readonly ProgressionId[] = ['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'];

const ID_TO_LABEL: Record<ProgressionId, string> = Object.fromEntries(
  Object.entries(LABEL_TO_ID).map(([label, id]) => [id, label]),
) as Record<ProgressionId, string>;

export function isCustomProgramId(id: string): boolean {
  return id.startsWith(CUSTOM_PREFIX);
}

/**
 * 카탈로그에 커스텀 프로그램을 덧붙인다. 카탈로그 5종이 앞, 커스텀이 저장 순서대로 뒤.
 * 이미 합쳐진 카탈로그를 다시 넣어도 커스텀이 두 번 들어가지 않는다.
 */
export function withCustomPrograms(catalog: Catalog, state: AppState): Catalog {
  const custom = state.customPrograms ?? [];
  const base = catalog.programs.filter((p) => !isCustomProgramId(p.id));
  if (custom.length === 0 && base.length === catalog.programs.length) return catalog;
  return { ...catalog, programs: [...base, ...custom] };
}

/** 그 프로그램으로 구간을 시작한 적이 있는지. 있으면 고치거나 지울 수 없다. */
export function isProgramUsed(state: AppState, programId: string): boolean {
  return state.stints.some((s) => s.programId === programId);
}

/** 요일별 종목을 정해진 순서로 정렬하고 빈 요일을 뺀다. */
function normalizeDays(days: CustomProgramInput['days']): Partial<Record<Weekday, ProgressionId[]>> {
  const out: Partial<Record<Weekday, ProgressionId[]>> = {};
  for (const w of WEEKDAYS) {
    const ids = days[w] ?? [];
    if (ids.length === 0) continue;
    out[w] = [...ids].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  }
  return out;
}

/**
 * 입력을 검사한다. 문제가 없으면 null, 있으면 화면에 그대로 보일 문구.
 * `selfId` 는 자기 자신과의 이름 중복을 허용하기 위한 것이다 (수정할 때).
 */
export function validateCustomProgram(
  state: AppState, catalog: Catalog, input: CustomProgramInput, selfId?: string,
): string | null {
  const name = input.name.trim();
  if (name.length === 0) return '프로그램 이름이 비어 있다.';
  if ([...name].length > CUSTOM_NAME_MAX) {
    return `프로그램 이름은 ${CUSTOM_NAME_MAX}자 이하여야 한다.`;
  }
  const others = withCustomPrograms(catalog, state).programs.filter((p) => p.id !== selfId);
  if (others.some((p) => p.name.ko === name || p.name.en === name)) {
    return `같은 이름의 프로그램이 이미 있다: ${name}`;
  }

  let trainingDays = 0;
  for (const w of WEEKDAYS) {
    const ids = input.days[w] ?? [];
    for (const id of ids) {
      if (!catalog.progressions.some((p) => p.id === id)) return `알 수 없는 종목: ${id}`;
    }
    if (new Set(ids).size !== ids.length) return `${w}요일에 같은 종목이 두 번 들어 있다.`;
    if (ids.length > 0) trainingDays += 1;
  }
  if (trainingDays === 0) return '운동일이 하루도 없다. 한 요일 이상에 종목을 넣어야 한다.';
  return null;
}

/** 입력을 카탈로그와 같은 `Program` 모양으로 만든다. 세트 표기는 비운다 — 세트는 기준표가 정한다. */
function toProgram(id: string, input: CustomProgramInput): Program {
  const name = input.name.trim();
  const days = normalizeDays(input.days);
  const schedule = Object.fromEntries(
    WEEKDAYS.map((w) => [w, (days[w] ?? []).map((pid) => [ID_TO_LABEL[pid], ''] as [string, string])]),
  ) as Program['schedule'];
  const trainingDays = WEEKDAYS.filter((w) => schedule[w].length > 0).length;
  return { id, name: { en: name, ko: name }, frequency: `주 ${trainingDays}일`, schedule };
}

/**
 * 남아 있는 커스텀과 구간이 가리키는 id 중 가장 큰 번호의 다음 번호로 id 를 만든다.
 * 지운 프로그램은 쓴 적이 없는 것뿐이라(`requireEditable`) 그 번호를 다시 써도 기록과 겹치지 않는다.
 */
function nextCustomId(state: AppState): string {
  const used = [
    ...(state.customPrograms ?? []).map((p) => p.id),
    ...state.stints.map((s) => s.programId),
  ].filter(isCustomProgramId);
  const max = used.reduce((m, id) => {
    const n = Number(id.slice(CUSTOM_PREFIX.length));
    return Number.isInteger(n) && n > m ? n : m;
  }, 0);
  return `${CUSTOM_PREFIX}${max + 1}`;
}

function requireValid(
  state: AppState, catalog: Catalog, input: CustomProgramInput, selfId?: string,
): void {
  const error = validateCustomProgram(state, catalog, input, selfId);
  if (error !== null) throw new Error(error);
}

/** 커스텀 프로그램을 만든다. 입력이 틀리면 `validateCustomProgram` 의 문구로 예외를 던진다. */
export function addCustomProgram(
  state: AppState, catalog: Catalog, input: CustomProgramInput,
): { state: AppState; programId: string } {
  requireValid(state, catalog, input);
  const programId = nextCustomId(state);
  return {
    state: { ...state, customPrograms: [...(state.customPrograms ?? []), toProgram(programId, input)] },
    programId,
  };
}

function requireEditable(state: AppState, programId: string): void {
  if (!(state.customPrograms ?? []).some((p) => p.id === programId)) {
    throw new Error(`커스텀 프로그램이 아니다: ${programId}`);
  }
  if (isProgramUsed(state, programId)) {
    throw new Error('한 번이라도 쓴 프로그램은 고치거나 지울 수 없다. 복제해서 새로 만든다.');
  }
}

/** 아직 쓰지 않은 커스텀 프로그램을 고친다. */
export function updateCustomProgram(
  state: AppState, catalog: Catalog, programId: string, input: CustomProgramInput,
): AppState {
  requireEditable(state, programId);
  requireValid(state, catalog, input, programId);
  return {
    ...state,
    customPrograms: (state.customPrograms ?? []).map((p) =>
      (p.id === programId ? toProgram(programId, input) : p)),
  };
}

/** 아직 쓰지 않은 커스텀 프로그램을 지운다. */
export function removeCustomProgram(state: AppState, programId: string): AppState {
  requireEditable(state, programId);
  return {
    ...state,
    customPrograms: (state.customPrograms ?? []).filter((p) => p.id !== programId),
  };
}

/** 프로그램 하나를 편집 폼의 입력 모양으로 되돌린다 (수정 · 복제). 빅6 밖 라벨은 뺀다. */
export function programToInput(catalog: Catalog, program: Program): CustomProgramInput {
  const days: CustomProgramInput['days'] = {};
  for (const w of WEEKDAYS) {
    const ids = (program.schedule[w] ?? [])
      .map(([label]) => LABEL_TO_ID[label])
      .filter((id): id is ProgressionId => id !== undefined);
    // 카탈로그에 없는 종목은 넣지 않는다 — 검사에서 어차피 막힌다.
    const known = ids.filter((id) => catalog.progressions.some((p) => p.id === id));
    if (known.length > 0) days[w] = [...new Set(known)];
  }
  return { name: program.name.ko, days };
}

