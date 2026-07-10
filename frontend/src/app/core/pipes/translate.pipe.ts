import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from '../services/i18n.service';

/**
 * Usage: {{ 'shell.help' | t }}
 * With params: {{ 'shell.signOutTitle' | t:{ school: schoolName() } }}
 *
 * Marks itself impure so it re-evaluates when the locale signal changes
 * (Angular impure pipes run on every CD cycle; locale switches are rare).
 */
@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: string, params?: Record<string, string | number>): string {
    if (!key) return '';
    // Touch locale so CD picks up language changes.
    this.i18n.locale();
    return this.i18n.t(key, params);
  }
}
