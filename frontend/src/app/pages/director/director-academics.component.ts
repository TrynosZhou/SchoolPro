import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { AuthService } from '../../core/services/auth.service';
import { executivePortalForRole, executiveAcademicModules } from '../../core/utils/executive-portal.util';

@Component({
  selector: 'app-director-academics',
  standalone: true,
  imports: [PortalLayoutComponent, RouterLink],
  templateUrl: './director-academics.component.html',
  styleUrl: './director-academics.component.scss',
})
export class DirectorAcademicsComponent {
  private auth = inject(AuthService);

  readonly portal = computed(() => executivePortalForRole(this.auth.user()?.role));
  readonly modules = computed(() => executiveAcademicModules(this.portal().basePath));
}
