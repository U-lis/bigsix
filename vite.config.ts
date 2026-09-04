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
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
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
			workbox: {
				// json 을 빠뜨리면 오프라인에서 카탈로그 로드가 통째로 죽는다 (NFR-6).
				globPatterns: ['**/*.{js,css,html,json,svg,png,woff2}'],
				// 프리캐시 매칭에서 쿼리 파라미터를 전부 무시한다 (cube-study 사고 대응).
				// 기본값(utm_* / fbclid 만 무시)은 이 앱의 쿼리를 프리캐시와 매칭하지 못해
				// navigateFallback 으로 떨어진다. /.*/ 로 전부 무시해 안전하게 만든다.
				ignoreURLParametersMatching: [/.*/],
				navigateFallback: '/'
			}
		})
	]
});
