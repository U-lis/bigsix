/**
 * 타임존 무관성 검증용 자식 프로세스 스크립트 (FR-6.3).
 *
 * `calendar.test.ts` 가 `TZ` 를 바꿔 가며 이 파일을 실행하고 stdout 의 JSON 을 비교한다.
 * 테스트 파일이 아니므로 `test/*.test.ts` glob 에 잡히지 않는다.
 */
import { readFileSync } from 'node:fs';
import { fromJSON } from '../../src/lib/domain/catalog.ts';
import { planOn, reviewRange } from '../../src/lib/domain/calendar.ts';
import { initialState, selectProgram } from '../../src/lib/domain/index.ts';
import { dateRange } from '../../src/lib/domain/date.ts';

// 여기서만 fs 로 읽는다. 이 파일은 vitest 가 아니라 `node --experimental-strip-types` 로
// 직접 실행되며(TZ 를 프로세스 시작 시점에 박아야 하므로), 그 런타임은 vite 의 JSON
// import 를 이해하지 못한다. FR-10.4 의 "테스트는 같은 로더를 쓴다" 에 대한 유일한
// 예외이고, 테스트가 아니라 자식 프로세스 프로브라 성립한다.
const catalog = fromJSON(JSON.parse(readFileSync(
  new URL('../../src/lib/data/progressions.json', import.meta.url).pathname, 'utf-8',
)));
const state = selectProgram(initialState(2), catalog, 'good_behavior', '2026-09-07');

const agendas = dateRange('2026-09-07', '2026-09-13').map((d) => {
  const a = planOn(state, catalog, d);
  return a.kind === 'no-program'
    ? { date: a.date, kind: a.kind }
    : {
        date: a.date,
        kind: a.kind,
        weekday: a.weekday,
        dayNumber: a.dayNumber,
        rest: a.rest,
        exercises: a.exercises.map((e) => `${e.progressionId}:${e.step}`),
        locked: a.locked.map((l) => l.progressionId),
      };
});

const reviews = reviewRange(state, catalog, '2026-09-07', '2026-09-13')
  .map((r) => ({ date: r.date, status: r.status, dayNumber: r.dayNumber, planned: r.planned }));

process.stdout.write(JSON.stringify({ agendas, reviews }));
