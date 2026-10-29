import { fromJSON, withCustomPrograms } from '$lib/domain';
import type { AppState, Catalog } from '$lib/domain/types';
import raw from './progressions.json';

/**
 * 앱 전용 카탈로그 로더 (FR-10).
 *
 * vite 가 progressions.json 을 정적 번들로 심으므로 파일 시스템 접근이 없다.
 * 카탈로그는 앱 버전과 함께 배포되는 읽기 전용 정적 데이터이며 localStorage 에
 * 저장하지 않는다 (FR-10.3).
 *
 * 적재 지점은 여기 한 곳이다. 컴포넌트가 각자 JSON 을 import 하지 않는다 (FR-10.2).
 * 테스트도 같은 로더를 쓴다 (FR-10.4).
 */
let cached: Catalog | null = null;

export function loadCatalog(): Catalog {
	if (cached === null) cached = fromJSON(raw);
	return cached;
}

/**
 * 사용자의 커스텀 프로그램까지 합친 카탈로그 (#13).
 *
 * 프로그램을 id 로 찾는 자리(오늘 화면 · 프로그램 · 기록 · 알림 meta)는 전부 이것을 쓴다.
 * 종목 · 단계만 보는 자리는 `loadCatalog()` 로 충분하다.
 *
 * 같은 `customPrograms` 배열이면 같은 객체를 돌려준다 — `$derived` 가 매번 새 카탈로그로
 * 하위 컴포넌트를 다시 그리지 않게 하기 위함이다.
 */
let lastCustom: AppState['customPrograms'] | null = null;
let lastMerged: Catalog | null = null;

export function catalogFor(state: AppState): Catalog {
	if (lastMerged !== null && state.customPrograms === lastCustom) return lastMerged;
	lastCustom = state.customPrograms;
	lastMerged = withCustomPrograms(loadCatalog(), state);
	return lastMerged;
}
