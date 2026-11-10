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
import { FK_CASCADE } from './constraints';
import { Staff } from './Staff';

export type LeaveType =
  | 'annual'
  | 'sick'
  | 'maternity'
  | 'paternity'
  | 'compassionate'
  | 'study'
  | 'unpaid';

export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

@Entity('leave_requests')
@Index('idx_leave_requests_staff', ['staffId'])
@Index('idx_leave_requests_status', ['status'])
@Index('idx_leave_requests_dates', ['startDate', 'endDate'])
export class LeaveRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Staff, FK_CASCADE)
  @JoinColumn({ name: 'staffId' })
  staff!: Staff;

  @Column()
  staffId!: string;

  @Column({ type: 'varchar', length: 24 })
  leaveType!: LeaveType;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date' })
  endDate!: string;

  /** Working days (Mon–Fri) between startDate and endDate, inclusive. */
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    transformer: { to: (v?: number) => v, from: (v?: string | null) => (v == null ? 0 : Number(v)) },
  })
  days!: number;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: LeaveRequestStatus;

  /** User who captured the request (admin recording on behalf of staff). */
  @Column({ type: 'uuid', nullable: true })
  requestedById?: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedById?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  reviewNote?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
