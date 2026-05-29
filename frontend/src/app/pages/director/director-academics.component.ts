import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { DIRECTOR_NAV_ITEMS } from '../../core/config/director-nav';

@Component({
  selector: 'app-director-academics',
  standalone: true,
  imports: [PortalLayoutComponent, RouterLink],
  templateUrl: './director-academics.component.html',
  styleUrl: './director-academics.component.scss',
})
export class DirectorAcademicsComponent {
  readonly nav = DIRECTOR_NAV_ITEMS;

  readonly modules = [
    {
      title: 'Exam Marks',
      description: 'Review and enter student examination marks by class, subject, and term.',
      path: '/director/exams',
      icon: '📝',
      tone: 'indigo',
    },
    {
      title: 'Report Cards',
      description: 'Generate, preview, and publish term report cards for students.',
      path: '/director/report-cards',
      icon: '📄',
      tone: 'blue',
    },
    {
      title: 'Mark Sheet',
      description: 'View consolidated class mark sheets across subjects.',
      path: '/director/mark-sheet',
      icon: '📑',
      tone: 'teal',
    },
    {
      title: 'Results Analysis',
      description: 'Analyse grade distribution and subject performance trends.',
      path: '/director/results-analysis',
      icon: '📈',
      tone: 'purple',
    },
    {
      title: 'Ranking',
      description: 'Review class and form rankings by examination session.',
      path: '/director/ranking',
      icon: '🏆',
      tone: 'amber',
    },
  ];
}
