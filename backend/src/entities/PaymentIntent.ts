import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { FK_CASCADE, FK_SET_NULL } from './constraints';
import { Student } from './Student';
import { Invoice } from './Invoice';
import { User } from './User';

/** Channel the parent selected at checkout. `visa` is the Paynow web/card redirect flow. */
export type PaymentIntentMethod = 'ecocash' | 'onemoney' | 'visa';
export type PaymentIntentStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';

/**
 * Tracks an online (Paynow) payment attempt before it becomes a real Payment.
 * A row is created when the parent starts checkout and is finalised by the
 * Paynow webhook, at which point `paymentId` links to the posted Payment.
 */
@Entity('payment_intents')
@Index('idx_payment_intents_student', ['studentId'])
@Index('idx_payment_intents_status', ['status'])
export class PaymentIntent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Internal reference sent to Paynow and echoed back on the webhook. */
  @Column({ unique: true })
  reference!: string;

  @ManyToOne(() => Student, { ...FK_CASCADE })
  @JoinColumn({ name: 'studentId' })
  student?: Student;

  @Column()
  studentId!: string;

  @ManyToOne(() => Invoice, { nullable: true, ...FK_SET_NULL })
  @JoinColumn({ name: 'invoiceId' })
  invoice?: Invoice;

  @Column({ nullable: true })
  invoiceId?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 16 })
  method!: PaymentIntentMethod;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: PaymentIntentStatus;

  /** Paynow's own transaction reference. */
  @Column({ type: 'varchar', nullable: true })
  paynowReference?: string;

  @Column({ type: 'text', nullable: true })
  pollUrl?: string;

  @Column({ type: 'text', nullable: true })
  browserUrl?: string;

  @Column({ type: 'uuid', nullable: true })
  createdById?: string;

  @ManyToOne(() => User, { nullable: true, ...FK_SET_NULL })
  @JoinColumn({ name: 'createdById' })
  createdBy?: User;

  /** Set once the webhook finalises the payment. */
  @Column({ type: 'uuid', nullable: true })
  paymentId?: string;

  /** Raw webhook payload, kept for auditing/reconciliation. */
  @Column({ type: 'jsonb', nullable: true })
  payload?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
