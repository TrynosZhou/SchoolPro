import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('visitor_logs')
@Index(['date'])
export class VisitorLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  visitorName!: string;

  @Column({ nullable: true })
  idNumber?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  organization?: string;

  @Column({ type: 'text', nullable: true })
  purpose!: string;

  @Column({ nullable: true })
  personVisited?: string;

  @Column({ nullable: true })
  vehicleRegistration?: string;

  @Column({ type: 'time', nullable: true })
  signInTime?: string;

  @Column({ type: 'time', nullable: true })
  signOutTime?: string;

  @Column({ nullable: true })
  badgeNumber?: string;

  @Column({ type: 'varchar', length: 16, default: 'inside' })
  status!: string; // inside | signed_out

  @Column({ nullable: true })
  loggedById?: string;

  @Column({ nullable: true })
  loggedByName?: string;

  @Column({ type: 'date' })
  date!: string;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('authorized_pickups')
@Index(['studentId', 'isActive'])
export class AuthorizedPickup {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  studentId!: string;

  @Column()
  name!: string;

  @Column()
  relationship!: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  idNumber?: string;

  @Column({ type: 'date', nullable: true })
  validFrom?: string;

  @Column({ type: 'date', nullable: true })
  validTo?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('early_leave_requests')
@Index(['studentId', 'status'])
export class EarlyLeaveRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  studentId!: string;

  /** parent user id or guardian id that requested it */
  @Column({ nullable: true })
  requestedById?: string;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'time' })
  time!: string;

  /** pending | approved | rejected | completed */
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: string;

  @Column({ nullable: true })
  approvedById?: string;

  @Column({ type: 'text', nullable: true })
  decisionNote?: string;

  @Column({ type: 'time', nullable: true })
  departedAt?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
