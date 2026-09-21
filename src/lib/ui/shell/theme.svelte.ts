/**
 * 테마 순환 — FR-16.3 / FR-16.4 / EC-36.
 *
 * CubeStudy 의 settings.svelte.ts 에서 theme 부분만 발췌 이식했다
 * (참조: ~/Documents/cube-study/src/lib/ui/settings.svelte.ts).
 * bigsix 에 없는 다른 설정 항목(mode/notation/quizInput/hideInverse) 은
 * 끌어오지 않았다 (FR-16.9).
 *
 * 상태 3종: 'system' | 'light' | 'dark'. 순환은 그 순서.
 * - 'system' 이면 documentElement.dataset.theme 삭제 → CSS `prefers-color-scheme` 이 답한다.
 * - 그 외에는 dataset.theme 설정 → CSS `[data-theme]` 이 이긴다 (FR-16.4).
 *
 * localStorage 저장은 try/catch (FR-16.8 / EC-36).
 */
// SSR / node 테스트 안전 브라우저 판정. `$app/environment` 는 vitest 에서 alias 미해석.
const browser: boolean = typeof window !== 'undefined' && typeof document !== 'undefined';

const KEY = 'bigsix.theme';

export type Theme = 'system' | 'light' | 'dark';

const ORDER: readonly Theme[] = ['system', 'light', 'dark'] as const;

function readTheme(): Theme {
  if (!browser) return 'system';
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // 저장소가 막혀 있어도 이번 세션에는 기본값 (EC-36).
  }
  return 'system';
}

class ThemeStore {
  value = $state<Theme>(readTheme());

  constructor() {
    if (!browser) return;
    // 초기값을 DOM 에 반영한다.
    this.#apply(this.value);
  }

  /** system → light → dark → system. */
  cycle(): void {
    const next = ORDER[(ORDER.indexOf(this.value) + 1) % ORDER.length];
    this.set(next);
  }

  set(theme: Theme): void {
    this.value = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // 저장 실패해도 이번 세션에는 적용된다 (EC-36).
    }
    this.#apply(theme);
  }

  #apply(theme: Theme): void {
    if (!browser) return;
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }
}

export const theme = new ThemeStore();

export const THEME_LABEL: Record<Theme, string> = {
  system: '시스템',
  light: '라이트',
  dark: '다크',
};
