import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

// 배포된 것이 어느 커밋인지 화면에서 확인할 수 있어야 한다. 빌드 시점에 박는다.
function commitHash(): string {
	try {
		return execSync('git rev-parse --short=8 HEAD', { encoding: 'utf8' }).trim();
	} catch {
		return 'unknown';
	}
}

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
		__COMMIT_HASH__: JSON.stringify(commitHash())
	},
	// SPEC4 FR-32.4 / ADR-32: dev 서버는 5173 에 고정한다. 다른 프로세스가 선점했을 때
	// Vite 가 자동으로 다른 포트로 넘어가면 dev 릴레이에 등록된 Origin(`http://localhost:5173`) 과
	// 어긋나 `origin-not-allowed` 가 난다 (EC-86). preview(기본 4173) 는 영향 없음.
	server: {
		port: 5173,
		strictPort: true
	},
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			// FR-31 · GLOBAL ADR-35: generateSW → injectManifest 전환.
			// `ignoreURLParametersMatching` · `navigateFallback` 은 injectManifest 의
			// build-time 옵션이 아니라 SW 코드(src/pwa-sw.ts)에서 재구성한다 (NFR-30.b · c).
			//
			// SW 소스 위치(`src/pwa-sw`)는 `svelte.config.js` 의 `kit.files.serviceWorker`
			// 로 SvelteKit 에 알린다. 이 플러그인은 SvelteKit 이 컴파일한
			// `.svelte-kit/output/client/service-worker.js` 를 그대로 읽어 매니페스트를
			// 심고 아래 `filename` 으로 파일명을 바꾼다.
			strategies: 'injectManifest',
			registerType: 'autoUpdate',
			// injectManifest 기본 filename 은 `service-worker.js` 라 그대로 두면
			// `sw.svelte.ts:54` 의 `/sw.js` 하드코딩이 어긋난다 (FR-31.3). 명시적으로 지정.
			filename: 'sw.js',
			manifest: {
				// D-15 한국어 고정. 홈 화면 라벨은 short_name 이 쓰인다.
				name: 'bigsix',
				short_name: 'bigsix',
				description: '죄수 운동법 빅6 진행 앱',
				lang: 'ko',
				start_url: '/',
				display: 'standalone',
				background_color: '#111113',
				theme_color: '#111113',
				icons: [
					{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
					{
						src: '/icon-maskable.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			injectManifest: {
				// json 을 빠뜨리면 오프라인에서 카탈로그 로드가 통째로 죽는다 (NFR-6 · NFR-30.a).
				globPatterns: ['**/*.{js,css,html,json,svg,png,woff2}']
			}
		})
	]
});
