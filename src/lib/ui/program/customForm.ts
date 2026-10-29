/**
 * 커스텀 프로그램 폼의 순수 계산 (#13).
 *
 * 룬을 쓰지 않는다. 입력 검사는 도메인의 `validateCustomProgram` 한 곳이 맡고, 여기는
 * 폼 상태를 바꾸는 계산과 화면 문구 조립만 한다.
 */

import { CUSTOM_NAME_MAX, getProgression, LABEL_TO_ID, WEEKDAYS } from '$lib/domain';
import type { Catalog, CustomProgramInput, Program, ProgressionId, Weekday } from '$lib/domain/types';

/** 폼이 보여 주는 종목 순서. */
export const PICK_ORDER: readonly ProgressionId[] = [
  'pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu',
];

export function emptyInput(): CustomProgramInput {
  return { name: '', days: {} };
}

/** 그 요일에 종목을 넣거나 뺀다. 원래 입력은 바꾸지 않는다. */
export function toggleDay(
  input: CustomProgramInput, weekday: Weekday, id: ProgressionId,
): CustomProgramInput {
  const cur = input.days[weekday] ?? [];
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  return { ...input, days: { ...input.days, [weekday]: next } };
}

/** 종목이 하나라도 들어간 요일 수. */
export function trainingDayCount(input: CustomProgramInput): number {
  return WEEKDAYS.filter((w) => (input.days[w] ?? []).length > 0).length;
}

/**
 * 복제본 이름. `「원래 이름」 복사` 가 이미 있으면 뒤에 번호를 붙인다.
 * 이름 길이 제한을 넘으면 원래 이름 쪽을 자른다.
 */
export function copyName(original: string, taken: readonly string[]): string {
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? ' 복사' : ` 복사 ${n}`;
    const room = CUSTOM_NAME_MAX - [...suffix].length;
    const name = [...original].slice(0, room).join('').trimEnd() + suffix;
    if (!taken.includes(name)) return name;
  }
}

/** 요일표 한 줄 문구. `월 푸시업 · 화 레그 레이즈, 풀업`. 휴식일은 뺀다. */
export function scheduleLine(catalog: Catalog, program: Program): string {
  const parts: string[] = [];
  for (const w of WEEKDAYS) {
    const names = (program.schedule[w] ?? [])
      .map(([label]) => LABEL_TO_ID[label])
      .filter((id): id is ProgressionId => id !== undefined)
      .map((id) => getProgression(catalog, id).name.ko);
    if (names.length > 0) parts.push(`${w} ${names.join(', ')}`);
  }
  return parts.join(' · ');
}
