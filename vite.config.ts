import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
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
	plugins: [sveltekit()]
});
