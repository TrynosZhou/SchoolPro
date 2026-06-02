import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Student } from './Student';
import { Term } from './Term';
import { Invoice } from './Invoice';

/** Per-student, per-term opening/closing invoice balance including carry-forward and prepaid credit. */
@Entity('student_term_balances')
@Unique(['studentId', 'termId'])
export class StudentTermBalance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student!: Student;

  @Column()
  studentId!: string;

  @ManyToOne(() => Term, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'termId' })
  term!: Term;

  @Column()
  termId!: string;

  /** Signed: positive = arrears brought forward, negative = prepaid credit brought forward. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  openingBalance!: number;

  /** Prepaid credit from negative opening applied to this term's invoices. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  prepaidApplied!: number;

  /** Prepaid credit accumulated from overpayments during this term. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  overpaymentPrepaid!: number;

  /** Portion of overpaymentPrepaid applied to this term's invoices. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  overpaymentPrepaidApplied!: number;

  @ManyToOne(() => Invoice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'carryForwardInvoiceId' })
  carryForwardInvoice?: Invoice | null;

  @Column({ nullable: true })
  carryForwardInvoiceId?: string | null;

  /** Cached net closing balance (+ owes, − prepaid credit). */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  closingBalance?: number | null;

  @Column({ default: false })
  initialized!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
