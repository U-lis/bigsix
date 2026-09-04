import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	// .svelte 와 .svelte.ts(룬 파일) 를 처리하기 위해 svelte 플러그인이 필요하다.
	// 이 설정이 없으면 룬($state 등)이 정의되지 않은 채로 실행돼 참조 오류가 난다.
	plugins: [svelte()],
	test: {
		// 기본은 node 다. 도메인 테스트는 브라우저 API 를 쓰지 않는다.
		// localStorage 를 만지는 테스트만 파일 첫 줄에
		//   // @vitest-environment happy-dom
		// 을 달아 개별적으로 올린다. 전역을 happy-dom 으로 올리면 도메인 테스트가
		// 브라우저 전역을 볼 수 있게 되어 NFR-3(순수 TS) 위반을 잡지 못한다.
		environment: 'node',
		include: ['tests/unit/**/*.test.ts'],
		server: {
			deps: {
				// 룬 컴파일이 필요한 파일들은 inline 처리해서 vite 변환을 태운다.
				inline: [/\.svelte(\.ts)?$/]
			}
		}
	}
});
