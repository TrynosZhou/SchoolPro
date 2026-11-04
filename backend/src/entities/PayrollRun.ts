import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PayrollRunStatus } from './enums';

@Entity('payroll_runs')
export class PayrollRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  reference!: string;

  @Column()
  year!: number;

  @Column()
  month!: number;

  @Column()
  periodLabel!: string;

  @Column({ type: 'date' })
  periodStart!: string;

  @Column({ type: 'date' })
  periodEnd!: string;

  @Column({ type: 'date', nullable: true })
  payDate?: string;

  @Column({ type: 'enum', enum: PayrollRunStatus, default: PayrollRunStatus.DRAFT })
  status!: PayrollRunStatus;

  @Column({ default: 0 })
  staffCount!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalGross!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalDeductions!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalNet!: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ nullable: true })
  createdByUserId?: string;

  @Column({ nullable: true })
  processedByUserId?: string;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt?: Date;

  @Column({ nullable: true })
  paidByUserId?: string;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
