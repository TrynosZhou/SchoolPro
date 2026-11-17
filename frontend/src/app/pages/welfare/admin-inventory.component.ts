import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface Item { id: string; name: string; category: string; unit?: string; unitCost: number; quantity: number; reorderLevel: number; location?: string; supplier?: Supplier; isActive: boolean }
interface Supplier { id: string; name: string; contactPerson?: string; phone?: string; email?: string }
interface Movement { id: string; itemId: string; item?: Item; type: string; quantity: number; reason?: string; date: string }
interface PO { id: string; poNumber: string; supplier?: Supplier; status: string; orderDate?: string; total?: number; lines?: any[] }
interface Asset { id: string; name: string; category?: string; purchaseDate?: string; purchaseCost: number; bookValue: number; accumulatedDepreciation: number; usefulLifeYears: number; isActive: boolean }

const TABS = [
  { key: 'items', label: 'Stock Items' },
  { key: 'movements', label: 'Movements' },
  { key: 'pos', label: 'Purchase Orders' },
  { key: 'assets', label: 'Assets' },
];

@Component({
  selector: 'app-admin-inventory',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe],
  template: `
<app-portal-layout portalTitle="Admin Portal" pageTitle="Inventory &amp; Assets" [navSections]="adminNav">
<div class="inv-page">

  <section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">Stores &amp; Fixed Assets</p>
      <h2>Inventory &amp; Assets</h2>
      <p class="hero-sub">Track consumables, suppliers and purchase orders, and keep a clear register of school assets and their book value.</p>
    </div>
    <div class="kpi-grid">
      <div class="kpi"><span>Stock items</span><strong>{{ items.length }}</strong><small>Registered in the store</small></div>
      <div class="kpi" [class.bad]="lowStockCount > 0"><span>Low stock</span><strong>{{ lowStockCount }}</strong><small>At or below reorder level</small></div>
      <div class="kpi"><span>Stock value</span><strong>{{ stockValue | number:'1.2-2' }}</strong><small>Quantity × unit cost</small></div>
      <div class="kpi"><span>Asset book value</span><strong>{{ assetBookValue | number:'1.2-2' }}</strong><small>{{ assets.length }} registered {{ assets.length === 1 ? 'asset' : 'assets' }}</small></div>
    </div>
  </section>

  <div class="shell">
    <div class="tab-bar" role="tablist">
      @for (t of tabs; track t.key) {
        <button type="button" role="tab" [class.active]="tab()===t.key" [attr.aria-selected]="tab()===t.key" (click)="tab.set(t.key)">
          {{ t.label }}<span class="tab-count">{{ tabCount(t.key) }}</span>
        </button>
      }
    </div>

    <div class="tab-body">

      @if (tab() === 'items') {
        <div class="panel-head">
          <div><h3>Stock items</h3><p>Everything held in the store, with reorder alerts.</p></div>
          <div class="actions">
            <button class="btn-primary" (click)="showItemForm=!showItemForm">+ Item</button>
            <button class="btn-outline" (click)="showSupplierForm=!showSupplierForm">+ Supplier</button>
            <button class="btn-outline" (click)="showMoveForm=!showMoveForm">+ Stock movement</button>
          </div>
        </div>

        @if (showItemForm) {
          <div class="form-panel">
            <h4>New stock item</h4>
            <div class="fields">
              <div class="field"><label>Name *</label><input [(ngModel)]="item.name" placeholder="e.g. Exercise books" /></div>
              <div class="field"><label>Category</label><select [(ngModel)]="item.category"><option value="textbook">Textbook</option><option value="stationery">Stationery</option><option value="equipment">Equipment</option><option value="uniform">Uniform</option><option value="other">Other</option></select></div>
              <div class="field"><label>Unit</label><input [(ngModel)]="item.unit" placeholder="e.g. box, each" /></div>
              <div class="field"><label>Unit cost</label><input [(ngModel)]="item.unitCost" type="number" placeholder="0.00" /></div>
              <div class="field"><label>Quantity</label><input [(ngModel)]="item.quantity" type="number" placeholder="0" /></div>
              <div class="field"><label>Reorder level</label><input [(ngModel)]="item.reorderLevel" type="number" placeholder="0" /></div>
              <div class="field"><label>Location</label><input [(ngModel)]="item.location" placeholder="e.g. Main store" /></div>
              <div class="field"><label>Supplier</label><select [(ngModel)]="item.supplierId"><option value="">Supplier…</option>@for (s of suppliers; track s.id) { <option [value]="s.id">{{ s.name }}</option> }</select></div>
            </div>
            <div class="form-actions"><button class="btn-primary" (click)="saveItem()">Save</button><button class="btn-outline" (click)="showItemForm=false">Cancel</button></div>
          </div>
        }
        @if (showSupplierForm) {
          <div class="form-panel">
            <h4>New supplier</h4>
            <div class="fields">
              <div class="field"><label>Name *</label><input [(ngModel)]="supplier.name" placeholder="Supplier name" /></div>
              <div class="field"><label>Contact person</label><input [(ngModel)]="supplier.contactPerson" placeholder="Contact" /></div>
              <div class="field"><label>Phone</label><input [(ngModel)]="supplier.phone" placeholder="Phone" /></div>
              <div class="field"><label>Email</label><input [(ngModel)]="supplier.email" placeholder="Email" /></div>
            </div>
            <div class="form-actions"><button class="btn-primary" (click)="saveSupplier()">Save</button><button class="btn-outline" (click)="showSupplierForm=false">Cancel</button></div>
          </div>
        }
        @if (showMoveForm) {
          <div class="form-panel">
            <h4>Record stock movement</h4>
            <div class="fields">
              <div class="field"><label>Item</label><select [(ngModel)]="movement.itemId"><option value="">Item…</option>@for (i of items; track i.id) { <option [value]="i.id">{{ i.name }} ({{ i.quantity }} {{ i.unit || '' }})</option> }</select></div>
              <div class="field"><label>Type</label><select [(ngModel)]="movement.type"><option value="in">Stock in</option><option value="out">Stock out</option><option value="adjust">Adjust</option></select></div>
              <div class="field"><label>Quantity (+/-)</label><input [(ngModel)]="movement.quantity" type="number" placeholder="0" /></div>
              <div class="field"><label>Reason</label><input [(ngModel)]="movement.reason" placeholder="Reason" /></div>
            </div>
            <div class="form-actions"><button class="btn-primary" (click)="saveMovement()">Record</button><button class="btn-outline" (click)="showMoveForm=false">Cancel</button></div>
          </div>
        }

        <div class="table-wrap">
          <table class="data-table"><thead><tr><th>Name</th><th>Category</th><th class="num">Qty</th><th class="num">Reorder</th><th class="num">Unit cost</th><th>Supplier</th><th>Location</th></tr></thead><tbody>
            @for (i of items; track i.id) {
              <tr><td class="name-cell">{{ i.name }}</td><td><span class="pill cat">{{ i.category }}</span></td>
                <td class="num"><span class="qty" [class.text-red]="i.quantity<=i.reorderLevel">{{ i.quantity }}@if (i.quantity<=i.reorderLevel) { <span class="pill low">Low</span> }</span></td>
                <td class="num">{{ i.reorderLevel }}</td><td class="num">{{ i.unitCost | number:'1.2-2' }}</td>
                <td [class.muted]="!i.supplier?.name">{{ i.supplier?.name || '—' }}</td><td [class.muted]="!i.location">{{ i.location || '—' }}</td></tr>
            } @empty { <tr><td colspan="7" class="empty-cell"><span class="empty-icon">▤</span><strong>No stock items yet</strong><span>Use “+ Item” to add the first one.</span></td></tr> }
          </tbody></table>
        </div>
      }

      @if (tab() === 'movements') {
        <div class="panel-head"><div><h3>Stock movements</h3><p>The most recent receipts, issues and adjustments.</p></div></div>
        <div class="table-wrap">
          <table class="data-table"><thead><tr><th>Date</th><th>Item</th><th>Type</th><th class="num">Qty</th><th>Reason</th></tr></thead><tbody>
            @for (m of movements; track m.id) {
              <tr><td>{{ m.date }}</td><td class="name-cell">{{ m.item?.name || m.itemId }}</td><td><span class="pill" [class]="'pill ' + m.type">{{ m.type }}</span></td>
                <td class="num" [class.pos]="m.quantity>0" [class.neg]="m.quantity<0">{{ m.quantity }}</td><td [class.muted]="!m.reason">{{ m.reason || '—' }}</td></tr>
            } @empty { <tr><td colspan="5" class="empty-cell"><span class="empty-icon">⇄</span><strong>No movements recorded</strong><span>Stock in, out and adjustments will appear here.</span></td></tr> }
          </tbody></table>
        </div>
      }

      @if (tab() === 'pos') {
        <div class="panel-head">
          <div><h3>Purchase orders</h3><p>Orders placed with suppliers and their receipt status.</p></div>
          <div class="actions"><button class="btn-primary" (click)="showPoForm=!showPoForm">+ New PO</button></div>
        </div>
        @if (showPoForm) {
          <div class="form-panel">
            <h4>New purchase order</h4>
            <div class="fields">
              <div class="field"><label>Supplier</label><select [(ngModel)]="po.supplierId"><option value="">Supplier…</option>@for (s of suppliers; track s.id) { <option [value]="s.id">{{ s.name }}</option> }</select></div>
              <div class="field"><label>Item</label><input [(ngModel)]="poLine.itemId" placeholder="Select item" list="items-list" /></div>
              <datalist id="items-list">@for (i of items; track i.id) { <option [value]="i.id">{{ i.name }}</option> }</datalist>
              <div class="field"><label>Quantity</label><input [(ngModel)]="poLine.quantity" type="number" placeholder="0" /></div>
              <div class="field"><label>Unit cost</label><input [(ngModel)]="poLine.unitCost" type="number" placeholder="0.00" /></div>
              <div class="field"><label>&nbsp;</label><button class="btn-outline" (click)="addPoLine()">+ Line</button></div>
            </div>
            @if (poLines.length) {
              <ul class="po-lines">
                @for (l of poLines; track $index) { <li><strong>{{ itemName(l.itemId) }}</strong><span>{{ l.quantity }} × {{ l.unitCost | number:'1.2-2' }}</span></li> }
              </ul>
            }
            <div class="form-actions"><button class="btn-primary" (click)="savePo()">Create PO</button><button class="btn-outline" (click)="showPoForm=false">Cancel</button></div>
          </div>
        }
        <div class="table-wrap">
          <table class="data-table"><thead><tr><th>PO #</th><th>Supplier</th><th>Date</th><th class="num">Total</th><th>Status</th><th></th></tr></thead><tbody>
            @for (p of pos; track p.id) {
              <tr><td class="name-cell">{{ p.poNumber }}</td><td>{{ p.supplier?.name || '—' }}</td><td>{{ p.orderDate || '—' }}</td><td class="num">{{ p.total | number:'1.2-2' }}</td><td><span class="pill" [class]="'pill st-' + p.status">{{ p.status }}</span></td>
                <td class="num">@if (p.status!=='received' && p.status!=='cancelled') { <button class="btn-outline btn-sm" (click)="receive(p)">Receive</button> }</td></tr>
            } @empty { <tr><td colspan="6" class="empty-cell"><span class="empty-icon">✎</span><strong>No purchase orders</strong><span>Create a PO to order stock from a supplier.</span></td></tr> }
          </tbody></table>
        </div>
      }

      @if (tab() === 'assets') {
        <div class="panel-head">
          <div><h3>Asset register</h3><p>Fixed assets with accumulated depreciation and current book value.</p></div>
          <div class="actions"><button class="btn-primary" (click)="showAssetForm=!showAssetForm">+ Asset</button></div>
        </div>
        @if (showAssetForm) {
          <div class="form-panel">
            <h4>New asset</h4>
            <div class="fields">
              <div class="field"><label>Name *</label><input [(ngModel)]="asset.name" placeholder="Asset name" /></div>
              <div class="field"><label>Category</label><input [(ngModel)]="asset.category" placeholder="Category" /></div>
              <div class="field"><label>Purchase date</label><input [(ngModel)]="asset.purchaseDate" type="date" /></div>
              <div class="field"><label>Cost</label><input [(ngModel)]="asset.purchaseCost" type="number" placeholder="0.00" /></div>
              <div class="field"><label>Salvage value</label><input [(ngModel)]="asset.salvageValue" type="number" placeholder="0.00" /></div>
              <div class="field"><label>Useful life (years)</label><input [(ngModel)]="asset.usefulLifeYears" type="number" placeholder="5" /></div>
            </div>
            <div class="form-actions"><button class="btn-primary" (click)="saveAsset()">Save</button><button class="btn-outline" (click)="showAssetForm=false">Cancel</button></div>
          </div>
        }
        <div class="table-wrap">
          <table class="data-table"><thead><tr><th>Name</th><th>Category</th><th>Purchased</th><th class="num">Cost</th><th class="num">Depreciation</th><th class="num">Book value</th></tr></thead><tbody>
            @for (a of assets; track a.id) {
              <tr><td class="name-cell">{{ a.name }}</td><td>@if (a.category) { <span class="pill cat">{{ a.category }}</span> } @else { <span class="muted">—</span> }</td><td [class.muted]="!a.purchaseDate">{{ a.purchaseDate || '—' }}</td><td class="num">{{ a.purchaseCost | number:'1.2-2' }}</td>
                <td class="num">{{ a.accumulatedDepreciation | number:'1.2-2' }}</td><td class="num"><b>{{ a.bookValue | number:'1.2-2' }}</b></td></tr>
            } @empty { <tr><td colspan="6" class="empty-cell"><span class="empty-icon">◈</span><strong>No assets registered</strong><span>Use “+ Asset” to start the register.</span></td></tr> }
          </tbody></table>
        </div>
      }

    </div>
  </div>
</div>
</app-portal-layout>`,
  styleUrl: './admin-inventory.component.scss',
})
export class AdminInventoryComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;

  tabs = TABS;
  tab = signal('items');

  items: Item[] = [];
  suppliers: Supplier[] = [];
  movements: Movement[] = [];
  pos: PO[] = [];
  assets: Asset[] = [];

  showItemForm = false; showSupplierForm = false; showMoveForm = false;
  showPoForm = false; showAssetForm = false;
  item: any = { category: 'other' }; supplier: any = {}; movement: any = {};
  po: any = {}; poLine: any = {}; poLines: any[] = [];
  asset: any = { usefulLifeYears: 5 };

  ngOnInit() { this.load(); }

  // ── Presentation helpers (read-only; no behaviour change) ──
  get lowStockCount(): number { return this.items.filter((i) => i.quantity <= i.reorderLevel).length; }
  get stockValue(): number { return this.items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0), 0); }
  get assetBookValue(): number { return this.assets.reduce((sum, a) => sum + (Number(a.bookValue) || 0), 0); }
  itemName(id: string): string { return this.items.find((i) => i.id === id)?.name || id; }
  tabCount(key: string): number {
    switch (key) {
      case 'items': return this.items.length;
      case 'movements': return this.movements.length;
      case 'pos': return this.pos.length;
      case 'assets': return this.assets.length;
      default: return 0;
    }
  }

  load() {
    this.api.get<Item[]>('/inventory/items').subscribe({ next: (r) => (this.items = r || []), error: () => {} });
    this.api.get<Supplier[]>('/inventory/suppliers').subscribe({ next: (r) => (this.suppliers = r || []), error: () => {} });
    this.api.get<Movement[]>('/inventory/movements', { limit: '100' }).subscribe({ next: (r) => (this.movements = r || []), error: () => {} });
    this.api.get<PO[]>('/inventory/purchase-orders').subscribe({ next: (r) => (this.pos = r || []), error: () => {} });
    this.api.get<Asset[]>('/inventory/assets').subscribe({ next: (r) => (this.assets = r || []), error: () => {} });
  }

  saveItem() {
    const req = this.item.id ? this.api.patch(`/inventory/items/${this.item.id}`, this.item) : this.api.post('/inventory/items', this.item);
    req.subscribe({ next: () => { this.showItemForm = false; this.item = { category: 'other' }; this.load(); }, error: () => {} });
  }

  saveSupplier() {
    this.api.post('/inventory/suppliers', this.supplier).subscribe({ next: () => { this.showSupplierForm = false; this.supplier = {}; this.load(); }, error: () => {} });
  }

  saveMovement() {
    if (!this.movement.itemId || !this.movement.type) return;
    this.api.post('/inventory/movements', this.movement).subscribe({ next: () => { this.showMoveForm = false; this.movement = {}; this.load(); }, error: () => {} });
  }

  addPoLine() {
    if (!this.poLine.itemId || !this.poLine.quantity) return;
    this.poLines.push({ ...this.poLine, unitCost: Number(this.poLine.unitCost) || 0, quantity: Number(this.poLine.quantity) });
    this.poLine = {};
  }

  savePo() {
    if (!this.po.supplierId || !this.poLines.length) return;
    this.api.post('/inventory/purchase-orders', { ...this.po, lines: this.poLines }).subscribe({
      next: () => { this.showPoForm = false; this.po = {}; this.poLines = []; this.load(); }, error: () => {},
    });
  }

  receive(p: PO) {
    this.api.post(`/inventory/purchase-orders/${p.id}/receive`, {}).subscribe({ next: () => this.load(), error: () => {} });
  }

  saveAsset() {
    this.api.post('/inventory/assets', this.asset).subscribe({ next: () => { this.showAssetForm = false; this.asset = { usefulLifeYears: 5 }; this.load(); }, error: () => {} });
  }
}
