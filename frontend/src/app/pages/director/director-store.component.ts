import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { AuthService } from '../../core/services/auth.service';
import { executivePortalForRole } from '../../core/utils/executive-portal.util';
import { ApiService } from '../../core/services/api.service';

interface TuckshopItem {
  id: string;
  name: string;
  category?: string;
  unitPrice: number;
  stockQuantity: number;
  reorderLevel: number;
  isActive: boolean;
}

@Component({
  selector: 'app-director-store',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, RouterLink],
  templateUrl: './director-store.component.html',
  styleUrl: './director-store.component.scss',
})
export class DirectorStoreComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly portal = computed(() => executivePortalForRole(this.auth.user()?.role));

  items = signal<TuckshopItem[]>([]);
  loading = signal(true);
  search = signal('');
  filter = signal<'all' | 'low' | 'out'>('all');

  filteredItems = computed(() => {
    const q = this.search().trim().toLowerCase();
    let rows = this.items();
    if (this.filter() === 'low') {
      rows = rows.filter((i) => i.stockQuantity <= i.reorderLevel && i.stockQuantity > 0);
    } else if (this.filter() === 'out') {
      rows = rows.filter((i) => i.stockQuantity === 0);
    }
    if (!q) return rows;
    return rows.filter((i) => `${i.name} ${i.category ?? ''}`.toLowerCase().includes(q));
  });

  stats = computed(() => {
    const rows = this.items();
    return {
      total: rows.length,
      low: rows.filter((i) => i.stockQuantity <= i.reorderLevel && i.stockQuantity > 0).length,
      out: rows.filter((i) => i.stockQuantity === 0).length,
      value: rows.reduce((sum, i) => sum + Number(i.unitPrice) * i.stockQuantity, 0),
    };
  });

  ngOnInit() {
    this.api.get<TuckshopItem[]>('/admin/tuckshop/items').subscribe({
      next: (rows) => {
        this.items.set(rows.filter((i) => i.isActive !== false));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  stockStatus(item: TuckshopItem): 'ok' | 'low' | 'out' {
    if (item.stockQuantity === 0) return 'out';
    if (item.stockQuantity <= item.reorderLevel) return 'low';
    return 'ok';
  }
}
