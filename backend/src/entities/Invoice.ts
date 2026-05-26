import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Student } from './Student';
import { Term } from './Term';
import { InvoiceStatus, FeeType } from './enums';
import { InvoiceLine } from './InvoiceLine';
import { Payment } from './Payment';

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  invoiceNumber!: string;

  @ManyToOne(() => Student, (s) => s.invoices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student!: Student;

  @Column()
  studentId!: string;

  @ManyToOne(() => Term, { nullable: true })
  @JoinColumn({ name: 'termId' })
  term?: Term;

  @Column({ nullable: true })
  termId?: string;

  @Column({ type: 'enum', enum: FeeType })
  feeType!: FeeType;

  @Column()
  description!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalAmount!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountPaid!: number;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.SENT })
  status!: InvoiceStatus;

  @Column({ type: 'date' })
  dueDate!: string;

  @Column({ type: 'date', nullable: true })
  issuedDate?: string;

  @OneToMany(() => InvoiceLine, (l) => l.invoice, { cascade: true })
  lines!: InvoiceLine[];

  @OneToMany(() => Payment, (p) => p.invoice)
  payments!: Payment[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

