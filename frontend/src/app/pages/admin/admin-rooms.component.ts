import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

export interface MasterRoom {
  id: string;
  name: string;
  code?: string | null;
  capacity?: number | null;
}

interface RoomDraft {
  name: string;
  code: string;
  /** Number inputs bound with ngModel give a number (or null when cleared), so accept either. */
  capacity: string | number | null;
}

const emptyDraft = (): RoomDraft => ({ name: '', code: '', capacity: null });

@Component({
  selector: 'app-admin-rooms',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  templateUrl: './admin-rooms.component.html',
  styleUrl: './admin-rooms.component.scss',
})
export class AdminRoomsComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;

  rooms = signal<MasterRoom[]>([]);
  loading = signal(true);
  loadError = signal(false);
  saving = signal(false);
  search = signal('');
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  draft: RoomDraft = emptyDraft();
  editingId = signal<string | null>(null);
  editDraft: RoomDraft = emptyDraft();
  confirmDeleteId = signal<string | null>(null);

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.rooms();
    return this.rooms().filter(
      (r) => r.name.toLowerCase().includes(q) || (r.code || '').toLowerCase().includes(q),
    );
  });

  /** Presentation only: total seats across all rooms, for the summary card. */
  readonly totalCapacity = computed(() => this.rooms().reduce((sum, r) => sum + (Number(r.capacity) || 0), 0));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<MasterRoom[]>('/timetable/rooms').subscribe({
      next: (rows) => {
        this.rooms.set(rows ?? []);
        this.loadError.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  private payload(d: RoomDraft) {
    const capacity = String(d.capacity ?? '').trim();
    return {
      name: String(d.name ?? '').trim(),
      code: String(d.code ?? '').trim() || null,
      capacity: capacity === '' ? null : Number(capacity),
    };
  }

  add(): void {
    if (!String(this.draft.name ?? '').trim()) {
      this.showToast('error', 'Enter a room name.');
      return;
    }
    this.saving.set(true);
    this.api.post<MasterRoom>('/timetable/rooms', this.payload(this.draft)).subscribe({
      next: (room) => {
        this.rooms.set([...this.rooms(), room].sort((a, b) => a.name.localeCompare(b.name)));
        this.draft = emptyDraft();
        this.saving.set(false);
        this.showToast('success', `Added ${room.name}.`);
      },
      error: (e) => {
        this.saving.set(false);
        this.showToast('error', e?.error?.message || 'Could not add the room.');
      },
    });
  }

  startEdit(room: MasterRoom): void {
    this.confirmDeleteId.set(null);
    this.editingId.set(room.id);
    this.editDraft = {
      name: room.name,
      code: room.code || '',
      capacity: room.capacity ?? null,
    };
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  saveEdit(room: MasterRoom): void {
    if (!String(this.editDraft.name ?? '').trim()) {
      this.showToast('error', 'Room name cannot be empty.');
      return;
    }
    this.saving.set(true);
    this.api.patch<MasterRoom>(`/timetable/rooms/${room.id}`, this.payload(this.editDraft)).subscribe({
      next: (updated) => {
        this.rooms.set(
          this.rooms()
            .map((r) => (r.id === updated.id ? updated : r))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        this.editingId.set(null);
        this.saving.set(false);
        this.showToast('success', `Saved ${updated.name}.`);
      },
      error: (e) => {
        this.saving.set(false);
        this.showToast('error', e?.error?.message || 'Could not save the room.');
      },
    });
  }

  /** First click asks for confirmation; second click deletes. */
  askDelete(room: MasterRoom): void {
    this.confirmDeleteId.set(room.id);
  }

  remove(room: MasterRoom): void {
    this.api.delete(`/timetable/rooms/${room.id}`).subscribe({
      next: () => {
        this.rooms.set(this.rooms().filter((r) => r.id !== room.id));
        this.confirmDeleteId.set(null);
        this.showToast('success', `Deleted ${room.name}.`);
      },
      error: (e) => {
        this.confirmDeleteId.set(null);
        this.showToast('error', e?.error?.message || 'Could not delete the room.');
      },
    });
  }

  private showToastTimer: ReturnType<typeof setTimeout> | null = null;

  private showToast(type: 'success' | 'error', msg: string): void {
    if (this.showToastTimer) clearTimeout(this.showToastTimer);
    this.toast.set({ type, msg });
    this.showToastTimer = setTimeout(() => this.toast.set(null), 4000);
  }
}
