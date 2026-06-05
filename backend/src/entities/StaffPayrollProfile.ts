import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Staff } from './Staff';
import { PayFrequency, PayrollPaymentMethod } from './enums';

@Entity('staff_payroll_profiles')
export class StaffPayrollProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToOne(() => Staff, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staffId' })
  staff!: Staff;

  @Column({ unique: true })
  staffId!: string;

  @Column({ nullable: true })
  jobTitle?: string;

  @Column({ type: 'enum', enum: PayFrequency, default: PayFrequency.MONTHLY })
  payFrequency!: PayFrequency;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  baseSalary!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  housingAllowance!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  transportAllowance!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  medicalAllowance!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  otherAllowances!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  payeAmount!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  nssaAmount!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  pensionAmount!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  loanDeduction!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  otherDeductions!: number;

  @Column({ nullable: true })
  bankName?: string;

  @Column({ nullable: true })
  bankAccount?: string;

  @Column({ nullable: true })
  bankBranch?: string;

  @Column({ nullable: true })
  taxReference?: string;

  @Column({ nullable: true })
  nssaNumber?: string;

  @Column({ type: 'enum', enum: PayrollPaymentMethod, default: PayrollPaymentMethod.BANK_TRANSFER })
  paymentMethod!: PayrollPaymentMethod;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  /** Annual leave entitlement; monthly accrual = annual / 12. */
  @Column({ type: 'decimal', precision: 6, scale: 2, default: 12 })
  annualLeaveDays!: number;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
