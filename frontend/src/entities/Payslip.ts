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
import { PayrollRun } from './PayrollRun';
import { Staff } from './Staff';
import { PayslipStatus, PayrollPaymentMethod } from './enums';

@Entity('payslips')
@Unique(['payrollRunId', 'staffId'])
export class Payslip {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => PayrollRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payrollRunId' })
  payrollRun!: PayrollRun;

  @Column()
  payrollRunId!: string;

  @ManyToOne(() => Staff, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staffId' })
  staff!: Staff;

  @Column()
  staffId!: string;

  @Column()
  employeeNumber!: string;

  @Column()
  staffName!: string;

  @Column({ nullable: true })
  department?: string;

  @Column({ nullable: true })
  jobTitle?: string;

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
  grossPay!: number;

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

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalDeductions!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  netPay!: number;

  @Column({ type: 'enum', enum: PayrollPaymentMethod, default: PayrollPaymentMethod.BANK_TRANSFER })
  paymentMethod!: PayrollPaymentMethod;

  @Column({ nullable: true })
  bankName?: string;

  @Column({ nullable: true })
  bankAccount?: string;

  @Column({ type: 'enum', enum: PayslipStatus, default: PayslipStatus.PENDING })
  status!: PayslipStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 12 })
  annualLeaveEntitlement!: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 1 })
  monthlyLeaveAccrual!: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  leaveOpeningBalance!: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
  leaveTakenDays!: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  leaveClosingBalance!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
