// progressions.json 로더 (Phase 2 stub).
//
// Phase 2 에서는 `readProgramIds()` 로 subscribe body 의 programId 검증에만 쓴다.
// Phase 3 에서 요일 → 종목 매칭 (`schedule`) 을 이 파일이 확장한다.
//
// ADR-30: 사본을 만들지 않는다. 앱 원본 (`src/lib/data/progressions.json`) 을 상대
// 경로로 그대로 읽는다. 앱과 서버가 자동 동기화된다.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_JSON_PATH = join(HERE, '..', '..', 'src', 'lib', 'data', 'progressions.json');

interface ProgramsDoc {
	programs: Array<{ id: string; [k: string]: unknown }>;
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

// 테스트에서 재시작 없이 다른 파일을 쓰고 싶을 때만 사용.
export function _resetProgressionsCache(): void {
	cache = null;
}
