import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ strict: true }),
		alias: { $lib: 'src/lib' },
		files: {
			// GLOBAL ADR-35: 커스텀 SW 소스 위치를 `src/pwa-sw` 로 옮긴다.
			// SvelteKit 이 이 파일을 컴파일해 `.svelte-kit/output/client/service-worker.js` 로
			// 내놓으면 vite-plugin-pwa 가 injectManifest 로 프리캐시를 심고 `sw.js` 로 옮긴다.
			serviceWorker: 'src/pwa-sw'
		},
		serviceWorker: {
			// 등록은 `src/lib/ui/shell/sw.svelte.ts` 가 `/sw.js` 로 직접 한다 (FR-31.3).
			// SvelteKit 자동 등록을 켜두면 `/service-worker.js` 로 이중 등록을 시도한다.
			register: false
		}
	}
};
