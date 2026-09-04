import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// 기본은 node 다. 도메인 테스트는 브라우저 API 를 쓰지 않는다.
		// localStorage 를 만지는 테스트만 파일 첫 줄에
		//   // @vitest-environment happy-dom
		// 을 달아 개별적으로 올린다. 전역을 happy-dom 으로 올리면 도메인 테스트가
		// 브라우저 전역을 볼 수 있게 되어 NFR-3(순수 TS) 위반을 잡지 못한다.
		environment: 'node',
		include: ['tests/unit/**/*.test.ts']
	}
});
