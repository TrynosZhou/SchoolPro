import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type AppLocale = 'en' | 'sn' | 'fr';

export interface LocaleOption {
  code: AppLocale;
  nativeLabel: string;
}

const LOCALE_KEY = 'school_pro_locale';
const SUPPORTED: AppLocale[] = ['en', 'sn', 'fr'];

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly http = inject(HttpClient);

  readonly locale = signal<AppLocale>(this.readInitialLocale());
  readonly ready = signal(false);
  private catalogs = signal<Record<string, Record<string, string>>>({});

  readonly locales: LocaleOption[] = [
    { code: 'en', nativeLabel: 'English' },
    { code: 'sn', nativeLabel: 'ChiShona' },
    { code: 'fr', nativeLabel: 'Français' },
  ];

  readonly localeLabel = computed(() => {
    const code = this.locale();
    return this.locales.find((l) => l.code === code)?.nativeLabel ?? code;
  });

  async init(): Promise<void> {
    await this.loadLocale(this.locale());
    this.applyDocumentLang(this.locale());
    this.ready.set(true);
  }

  async setLocale(code: AppLocale): Promise<void> {
    if (!SUPPORTED.includes(code)) return;
    await this.loadLocale(code);
    this.locale.set(code);
    this.applyDocumentLang(code);
    try {
      localStorage.setItem(LOCALE_KEY, code);
    } catch {
      /* ignore */
    }
  }

  /** Translate a key. Falls back to English catalog, then the key itself. */
  t(key: string, params?: Record<string, string | number>): string {
    const locale = this.locale();
    const catalogs = this.catalogs();
    const raw =
      catalogs[locale]?.[key] ??
      catalogs['en']?.[key] ??
      key;
    if (!params) return raw;
    return raw.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
      params[name] !== undefined && params[name] !== null ? String(params[name]) : `{{${name}}}`,
    );
  }

  /** Nav labels: look up `nav.<English label>` then fall back to the English label. */
  nav(label: string): string {
    const key = `nav.${label}`;
    const translated = this.t(key);
    return translated === key ? label : translated;
  }

  private async loadLocale(code: AppLocale): Promise<void> {
    if (this.catalogs()[code]) return;
    try {
      const data = await firstValueFrom(
        this.http.get<Record<string, string>>(`/i18n/${code}.json`),
      );
      this.catalogs.update((c) => ({ ...c, [code]: data }));
      if (code !== 'en' && !this.catalogs()['en']) {
        await this.loadLocale('en');
      }
    } catch {
      if (code !== 'en') {
        await this.loadLocale('en');
      }
    }
  }

  private applyDocumentLang(code: AppLocale): void {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = code === 'sn' ? 'sn' : code;
  }

  private readInitialLocale(): AppLocale {
    try {
      const stored = localStorage.getItem(LOCALE_KEY);
      if (stored && SUPPORTED.includes(stored as AppLocale)) {
        return stored as AppLocale;
      }
    } catch {
      /* ignore */
    }
    return this.detectBrowserLocale();
  }

  private detectBrowserLocale(): AppLocale {
    if (typeof navigator === 'undefined') return 'en';
    const candidates = [
      ...(navigator.languages ?? []),
      navigator.language,
    ]
      .filter(Boolean)
      .map((l) => l.toLowerCase());

    for (const lang of candidates) {
      if (lang.startsWith('sn') || lang.startsWith('shi')) return 'sn';
      if (lang.startsWith('fr')) return 'fr';
      if (lang.startsWith('en')) return 'en';
    }
    return 'en';
  }
}
