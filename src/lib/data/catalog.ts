import { fromJSON } from '../domain/catalog.ts';
import type { Catalog } from '../domain/types.ts';
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
