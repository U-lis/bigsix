/**
 * 하단 3탭을 경로에서 계산한다.
 *
 * 이전에는 `+layout.svelte` 안에 `<a href="/">오늘</a>` 3줄이 마크업으로 굳어
 * 있었다. 소속과 순서와 라벨 셋을 마크업에 섞어 두면 탭이 바뀌거나 하나가 늘
 * 때 마크업과 활성 판정을 두 곳에서 손으로 맞춰야 한다 — cube-study 가 겪은
 * 것과 같은 함정이다.
 *
 * bigsix 의 탭은 3개 고정이고 계층도 없어서 큐브의 `SIBLING_GROUPS` 트리 계산
 * 까지는 필요 없다. 하지만 소속·순서·라벨을 이 한 곳으로 모으고, 활성 판정도
 * 여기서 하면 마크업은 결과를 그리기만 하면 된다.
 *
 * 룬을 쓰지 않는 순수 함수다. `pathname` 만 받으므로 `localStorage` 나 브라우저
 * 상태에 닿지 않는다 — 서버가 그린 탭과 하이드레이션한 탭이 같아야 한다.
 *
 * 참고: `~/Documents/cube-study/src/lib/ui/nav.ts` 의 설계 원칙(소속을 경로에서
 * 읽는다, 룬 없음, 순수 함수)만 가져왔다. 큐브의 `tabsFor(pathname, routeId)` 는
 * 라우트 id 로 부모 형제군을 찾는 트리 함수인데, bigsix 는 트리가 없어서 3개
 * 상수를 단순히 훑고 활성만 표시한다.
 */

export interface NavTab {
	href: string;
	label: string;
	active: boolean;
}

/**
 * 3탭. 순서는 이 배열이 정한다.
 *
 * href 는 그 화면의 정확한 경로다. 활성 판정은 정확 일치 — bigsix 는 아직 상세
 * 화면이 없어서 부분 일치를 할 필요가 없다. 상세 화면(`/steps/[id]` 등)이 생기면
 * 큐브처럼 부모 경로 검사로 확장한다.
 */
const TABS: readonly { href: string; label: string }[] = [
	{ href: '/', label: '오늘' },
	{ href: '/programs', label: '프로그램' },
	{ href: '/steps', label: '단계' },
];

export function tabsFor(pathname: string): NavTab[] {
	return TABS.map((t) => ({
		href: t.href,
		label: t.label,
		active: pathname === t.href,
	}));
}
