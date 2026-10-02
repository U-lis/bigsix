/**
 * `buildMeta` — 구독 메타 조립 순수 함수 (SPEC4 FR-34 / ADR-34).
 *
 * 입력: AppState · catalog · tz · notifyAt. 출력: PushMeta 또는 null.
 * 시스템 시각을 읽지 않는다. 같은 입력엔 항상 같은 결과를 돌려준다 (결정적).
 * 호출자가 이미 로드한 catalog 를 넘긴다 — 여기서 다시 `loadCatalog()` 하지 않는다.
 *
 * 자동 동기화(ADR-35)가 「달라졌다」를 `JSON.stringify` 비교로 하므로, 요일별 종목
 * 배열의 순서는 `program.schedule[weekday]` 가 정한 순서를 그대로 따라간다.
 */

import { currentStint, getProgram, getProgression, planDay, WEEKDAYS } from '$lib/domain';
import type { AppState, Catalog, Weekday } from '$lib/domain/types';

import type { PushMeta } from './types';

/**
 * 현재 구간이 있으면 알림용 메타를 만든다.
 *
 * 1. 프로그램 미선택(`currentStint` 가 null)이면 null — 자동 동기화는 조용히 넘긴다.
 * 2. 프로그램 한국어명은 `getProgram(catalog, programId).name.ko`.
 * 3. 각 요일마다 `planDay(state, catalog, programId, weekday).exercises` 로 그날의
 *    종목을 뽑는다 — 잠긴 종목과 빅6 밖 라벨(악력 · 종아리 · 목)이 미리 걸러진다.
 * 4. 종목이 없는 요일은 `days` 에 키를 넣지 않는다.
 */
export function buildMeta(
  state: AppState,
  catalog: Catalog,
  tz: string,
  notifyAt: string,
): PushMeta | null {
  const stint = currentStint(state);
  if (stint === null) return null;

  const programId = stint.programId;
  const program = getProgram(catalog, programId).name.ko;

  const days: Partial<Record<Weekday, string[]>> = {};
  for (const weekday of WEEKDAYS) {
    const plan = planDay(state, catalog, programId, weekday);
    if (plan.exercises.length === 0) continue;
    days[weekday] = plan.exercises.map((e) => getProgression(catalog, e.progressionId).name.ko);
  }

  return { v: 1, tz, notifyAt, program, days };
}
