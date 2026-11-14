import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { FK_CASCADE, FK_RESTRICT, FK_SET_NULL } from './constraints';
import { GlReferenceType } from './enums';
import { ChartOfAccount } from './ChartOfAccount';
import { User } from './User';

@Entity('general_ledger_entries')
@Index('idx_gl_entry_transaction_date', ['transactionDate'])
@Index('idx_gl_entry_account_id', ['accountId'])
@Index('idx_gl_entry_reference_type', ['referenceType'])
@Index('idx_gl_entry_journal_batch', ['journalBatchId'])
export class GeneralLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'date' })
  transactionDate!: string;

  @Column({ type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => ChartOfAccount, { ...FK_RESTRICT })
  @JoinColumn({ name: 'accountId' })
  account?: ChartOfAccount;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  debitAmount!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  creditAmount!: number;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'enum', enum: GlReferenceType })
  referenceType!: GlReferenceType;

  @Column({ type: 'uuid', nullable: true })
  referenceId?: string;

  /** Links paired debit/credit lines from the same journal posting. */
  @Column({ type: 'uuid' })
  journalBatchId!: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  runningBalance!: number;

  @Column({ type: 'uuid' })
  createdById!: string;

  @ManyToOne(() => User, { ...FK_RESTRICT })
  @JoinColumn({ name: 'createdById' })
  createdBy?: User;

  @Column({ default: false })
  isReversed!: boolean;

  @Column({ type: 'uuid', nullable: true })
  reversalOfEntryId?: string;

  @ManyToOne(() => GeneralLedgerEntry, { nullable: true, ...FK_SET_NULL })
  @JoinColumn({ name: 'reversalOfEntryId' })
  reversalOfEntry?: GeneralLedgerEntry;

  @CreateDateColumn()
  createdAt!: Date;
}
