import { Directive, TemplateRef, ViewContainerRef, effect, inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/** Renders its template only when the current session is not a demo session. */
@Directive({
  selector: '[appUnlessDemo]',
  standalone: true,
})
export class UnlessDemoDirective {
  private readonly auth = inject(AuthService);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly view = inject(ViewContainerRef);

  constructor() {
    effect(() => {
      this.view.clear();
      if (!this.auth.isDemoSession()) {
        this.view.createEmbeddedView(this.template);
      }
    });
  }
}
