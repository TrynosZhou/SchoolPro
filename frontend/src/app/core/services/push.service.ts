import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export type PushState = 'unsupported' | 'unavailable' | 'denied' | 'off' | 'on';

/** Browser push (PWA) subscription management for the signed-in user. */
@Injectable({ providedIn: 'root' })
export class PushService {
  private swPush = inject(SwPush);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly state = signal<PushState>('off');
  readonly busy = signal(false);
  private listening = false;

  /** Call after sign-in: resolves current state and wires notification-click navigation. */
  async init(): Promise<void> {
    if (!this.swPush.isEnabled) {
      this.state.set('unsupported');
      return;
    }
    this.listenForClicks();
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      this.state.set('denied');
      return;
    }
    const sub = await firstValueFrom(this.swPush.subscription);
    this.state.set(sub ? 'on' : 'off');
    if (sub) this.syncSubscription(sub).catch(() => undefined);
  }

  async enable(): Promise<boolean> {
    if (!this.swPush.isEnabled) {
      this.state.set('unsupported');
      return false;
    }
    this.busy.set(true);
    try {
      const cfg = await firstValueFrom(
        this.api.get<{ publicKey: string; enabled: boolean }>('/communication/push/public-key'),
      );
      if (!cfg.enabled || !cfg.publicKey) {
        this.state.set('unavailable');
        return false;
      }
      const sub = await this.swPush.requestSubscription({ serverPublicKey: cfg.publicKey });
      await this.syncSubscription(sub);
      this.state.set('on');
      return true;
    } catch {
      this.state.set(
        typeof Notification !== 'undefined' && Notification.permission === 'denied' ? 'denied' : 'off',
      );
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async disable(): Promise<void> {
    this.busy.set(true);
    try {
      const sub = await firstValueFrom(this.swPush.subscription);
      if (sub) {
        await firstValueFrom(this.api.post('/communication/push/unsubscribe', { endpoint: sub.endpoint }));
        await this.swPush.unsubscribe();
      }
      this.state.set('off');
    } finally {
      this.busy.set(false);
    }
  }

  async sendTest(): Promise<boolean> {
    try {
      await firstValueFrom(this.api.post('/communication/push/test', {}));
      return true;
    } catch {
      return false;
    }
  }

  private syncSubscription(sub: PushSubscription) {
    return firstValueFrom(this.api.post('/communication/push/subscribe', sub.toJSON()));
  }

  private listenForClicks() {
    if (this.listening) return;
    this.listening = true;
    this.swPush.notificationClicks.subscribe(({ notification }) => {
      const url = (notification?.data as { url?: string } | undefined)?.url;
      if (!url) return;
      const role = (this.auth.user()?.role || 'parent').toLowerCase();
      const target = url.startsWith('/' + role) ? url : `/${role}${url}`;
      void this.router.navigateByUrl(target);
    });
  }
}
