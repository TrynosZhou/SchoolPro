import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';
import { Staff } from './Staff';

@Entity('staff_leave_balances')
export class StaffLeaveBalance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToOne(() => Staff, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staffId' })
  staff!: Staff;

  @Column({ unique: true })
  staffId!: string;

  /** Annual leave entitlement in days (default 12). */
  @Column({ type: 'decimal', precision: 6, scale: 2, default: 12 })
  annualEntitlementDays!: number;

  /** Current available leave balance in days. */
  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  balanceDays!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
