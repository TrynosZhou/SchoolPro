import { Injectable, signal, computed, effect } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';
export type FontScale = 'normal' | 'large' | 'xlarge';

const THEME_KEY = 'school_pro_theme';
const FONT_KEY = 'school_pro_font_scale';

const FONT_SCALE_MAP: Record<FontScale, string> = {
  normal: '100%',
  large: '112.5%',
  xlarge: '125%',
};

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly themeMode = signal<ThemeMode>(this.readTheme());
  readonly fontScale = signal<FontScale>(this.readFontScale());

  readonly resolvedTheme = computed<'light' | 'dark'>(() => {
    const mode = this.themeMode();
    if (mode === 'system') return this.systemPrefersDark() ? 'dark' : 'light';
    return mode;
  });

  readonly isDark = computed(() => this.resolvedTheme() === 'dark');

  private mediaQuery?: MediaQueryList;
  private mediaListener?: (e: MediaQueryListEvent) => void;

  constructor() {
    if (typeof window !== 'undefined') {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.mediaListener = () => {
        if (this.themeMode() === 'system') this.applyDom();
      };
      this.mediaQuery.addEventListener('change', this.mediaListener);
    }

    effect(() => {
      // Track signals so DOM stays in sync.
      this.themeMode();
      this.fontScale();
      this.applyDom();
    });
  }

  setTheme(mode: ThemeMode): void {
    this.themeMode.set(mode);
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      /* ignore quota / private mode */
    }
  }

  cycleTheme(): void {
    const order: ThemeMode[] = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(this.themeMode()) + 1) % order.length];
    this.setTheme(next);
  }

  setFontScale(scale: FontScale): void {
    this.fontScale.set(scale);
    try {
      localStorage.setItem(FONT_KEY, scale);
    } catch {
      /* ignore */
    }
  }

  themeLabel(): string {
    switch (this.themeMode()) {
      case 'dark':
        return 'Dark';
      case 'system':
        return 'System';
      default:
        return 'Light';
    }
  }

  private applyDom(): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const theme = this.resolvedTheme();
    root.setAttribute('data-theme', theme);
    root.style.fontSize = FONT_SCALE_MAP[this.fontScale()];

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#0f0f10' : '#0b1120');
    }
  }

  private systemPrefersDark(): boolean {
    return !!this.mediaQuery?.matches;
  }

  private readTheme(): ThemeMode {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
    } catch {
      /* ignore */
    }
    return 'system';
  }

  private readFontScale(): FontScale {
    try {
      const raw = localStorage.getItem(FONT_KEY);
      if (raw === 'normal' || raw === 'large' || raw === 'xlarge') return raw;
    } catch {
      /* ignore */
    }
    return 'normal';
  }
}
