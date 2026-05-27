import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToOne,
  CreateDateColumn,
} from 'typeorm';
import { Student } from './Student';
import { Invoice } from './Invoice';
import { PaymentMethod } from './enums';
import { Receipt } from './Receipt';
import { User } from './User';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  paymentReference!: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student!: Student;

  @Column()
  studentId!: string;

  @ManyToOne(() => Invoice, (i) => i.payments, { nullable: true })
  @JoinColumn({ name: 'invoiceId' })
  invoice?: Invoice;

  @Column({ nullable: true })
  invoiceId?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: number;

  @Column({ type: 'enum', enum: PaymentMethod })
  method!: PaymentMethod;

  @Column({ type: 'varchar', length: 64, default: 'other' })
  feeType!: string;

  @Column()
  label!: string;

  @Column({ nullable: true })
  notes?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'recordedById' })
  recordedBy?: User;

  @Column({ nullable: true })
  recordedById?: string;

  @OneToOne(() => Receipt, (r) => r.payment)
  receipt?: Receipt;

  @CreateDateColumn()
  paidAt!: Date;
}

