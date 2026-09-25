// progressions.json 로더.
//
// Phase 2: `readProgramIds()` 로 subscribe body 의 programId 검증.
// Phase 3: 요일 → 종목 매칭 (`schedule`) 을 확장. 알림 본문 계산.
//
// ADR-30: 사본을 만들지 않는다. 앱 원본 (`src/lib/data/progressions.json`) 을 상대
// 경로로 그대로 읽는다. 앱과 서버가 자동 동기화된다.
//
// 서버가 아는 것은 `{ programId, notifyAt, tz }` 뿐. 종목명은 서버가
// `progressions.json` + programId + 요일로 직접 계산한다 (FR-34.2).
// 단계 번호는 알 수 없고 알림에도 넣지 않는다.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_JSON_PATH = join(HERE, '..', '..', 'src', 'lib', 'data', 'progressions.json');

/** progressions.json 의 `programs[].schedule` 이 쓰는 한글 요일. */
export type WeekdayKo = '월' | '화' | '수' | '목' | '금' | '토' | '일';

export const WEEKDAYS: readonly WeekdayKo[] = Object.freeze([
	'월',
	'화',
	'수',
	'목',
	'금',
	'토',
	'일'
]);

interface ProgramRow extends Array<string> {
	0: string; // 종목 한국어명
	1: string; // 세트 수 (알림 본문에 안 씀)
}

interface Program {
	id: string;
	name: { en?: string; ko: string };
	schedule: Record<WeekdayKo, ProgramRow[]>;
	[k: string]: unknown;
}

interface ProgramsDoc {
	programs: Program[];
}

export interface PushPayload {
	title: string;
	body: string;
	icon: string;
}

let cache: { path: string; doc: ProgramsDoc } | null = null;

function load(path: string): ProgramsDoc {
	if (cache !== null && cache.path === path) return cache.doc;
	const doc = JSON.parse(readFileSync(path, 'utf8')) as ProgramsDoc;
	cache = { path, doc };
	return doc;
}

export function readProgramIds(path: string = DEFAULT_JSON_PATH): Set<string> {
	return new Set(load(path).programs.map((p) => p.id));
}

/** 존재하지 않는 programId 는 null. */
export function programByIdOrNull(
	programId: string,
	path: string = DEFAULT_JSON_PATH
): Program | null {
	const doc = load(path);
	return doc.programs.find((p) => p.id === programId) ?? null;
}

/**
 * 해당 프로그램의 한국어 이름. 존재하지 않으면 null.
 * 예: `programName('good_behavior')` → `'모범수'`.
 */
export function programName(programId: string, path: string = DEFAULT_JSON_PATH): string | null {
	const p = programByIdOrNull(programId, path);
	return p?.name.ko ?? null;
}

/**
 * 해당 프로그램의 그날 종목 한국어명 배열.
 * 예: `progressionsForDay('good_behavior', '월')` → `['푸시업', '레그 레이즈']`.
 * 휴식일(빈 schedule) · 알 수 없는 programId → `[]`.
 */
export function progressionsForDay(
	programId: string,
	weekday: WeekdayKo,
	path: string = DEFAULT_JSON_PATH
): string[] {
	const p = programByIdOrNull(programId, path);
	if (p === null) return [];
	const rows = p.schedule[weekday] ?? [];
	return rows.map((r) => r[0]);
}

/**
 * 알림 본문 계산 (FR-34).
 *   title: '빅6'
 *   body:  '{프로그램 한국어명} · {종목1, 종목2, ...}'
 *   icon:  '/icon-192.png'
 *
 * 휴식일(그날 schedule 이 빔) · 알 수 없는 programId → `null` 을 돌려주고,
 * 스케줄러는 이 값을 발송 스킵 신호로 쓴다 (EC-83, FR-34.4).
 * 단계 번호는 포함하지 않는다 (FR-34.2).
 */
export function buildPayload(programId: string, weekday: WeekdayKo): PushPayload | null {
	const name = programName(programId);
	if (name === null) return null;
	const items = progressionsForDay(programId, weekday);
	if (items.length === 0) return null;
	return {
		title: '빅6',
		body: `${name} · ${items.join(', ')}`,
		icon: '/icon-192.png'
	};
}

// 테스트에서 재시작 없이 다른 파일을 쓰고 싶을 때만 사용.
export function _resetProgressionsCache(): void {
	cache = null;
}
