import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

export type GlAccountType = 'REVENUE' | 'EXPENSE' | 'ASSET' | 'LIABILITY' | 'EQUITY';
export type GlReferenceType =
  | 'FEE_PAYMENT'
  | 'SALARY'
  | 'EXPENSE'
  | 'REFUND'
  | 'MANUAL_ADJUSTMENT'
  | 'OTHER';

export interface ChartOfAccountRow {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: GlAccountType;
  isActive: boolean;
}

export interface GlListRow {
  id: string;
  transactionDate: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: GlAccountType;
  description: string;
  debitAmount: number;
  creditAmount: number;
  runningBalance: number;
  referenceType: GlReferenceType;
  referenceId?: string;
  journalBatchId: string;
  isReversed: boolean;
  createdAt: string;
}

export interface GlListReport {
  generatedAt: string;
  filters: Record<string, unknown>;
  items: GlListRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { totalDebits: number; totalCredits: number; variance: number; balanced: boolean };
}

export interface GlListParams {
  startDate?: string;
  endDate?: string;
  accountId?: string;
  accountType?: GlAccountType | '';
  referenceType?: GlReferenceType | '';
  search?: string;
  page?: number;
  pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class GeneralLedgerService {
  private api = inject(ApiService);

  listAccounts() {
    return this.api.get<ChartOfAccountRow[]>('/chart-of-accounts');
  }

  listEntries(params: GlListParams) {
    const query: Record<string, string> = {};
    if (params.startDate) query['startDate'] = params.startDate;
    if (params.endDate) query['endDate'] = params.endDate;
    if (params.accountId) query['accountId'] = params.accountId;
    if (params.accountType) query['accountType'] = params.accountType;
    if (params.referenceType) query['referenceType'] = params.referenceType;
    if (params.search?.trim()) query['search'] = params.search.trim();
    if (params.page) query['page'] = String(params.page);
    if (params.pageSize) query['pageSize'] = String(params.pageSize);
    return this.api.get<GlListReport>('/general-ledger', query);
  }

  getAccountBalance(accountId: string) {
    return this.api.get<{ account: ChartOfAccountRow; runningBalance: number }>(
      `/general-ledger/${accountId}/balance`,
    );
  }

  checkIntegrity() {
    return this.api.get<{ balanced: boolean; totalDebits: number; totalCredits: number; variance: number }>(
      '/general-ledger/integrity',
    );
  }

  exportBlob(params: GlListParams, format: 'pdf' | 'csv', preview = false) {
    const query: Record<string, string> = { format };
    if (params.startDate) query['startDate'] = params.startDate;
    if (params.endDate) query['endDate'] = params.endDate;
    if (params.accountId) query['accountId'] = params.accountId;
    if (params.accountType) query['accountType'] = params.accountType;
    if (params.referenceType) query['referenceType'] = params.referenceType;
    if (params.search?.trim()) query['search'] = params.search.trim();
    if (preview) query['preview'] = 'true';
    return this.api.getBlob('/general-ledger/export', query);
  }
}
