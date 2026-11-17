import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('dormitories')
export class Dormitory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  /** boys | girls | mixed */
  @Column({ type: 'varchar', length: 16, default: 'mixed' })
  type!: string;

  @Column({ type: 'int', default: 0 })
  capacity!: number;

  @Column({ nullable: true })
  wardenStaffId?: string;

  @Column({ nullable: true })
  location?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('dorm_beds')
@Index(['dormitoryId', 'bedNumber'])
export class DormBed {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  dormitoryId!: string;

  @Column()
  bedNumber!: string;

  @Column({ nullable: true })
  roomLabel?: string;

  /** null = vacant */
  @Column({ nullable: true })
  studentId?: string;

  @Column({ type: 'varchar', length: 16, default: 'vacant' })
  status!: string; // vacant | occupied | maintenance

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('boarding_roll_calls')
@Index(['dormitoryId', 'date'])
export class BoardingRollCall {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  dormitoryId!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'time', nullable: true })
  time?: string;

  /** [{ bedId, studentId, status: 'present'|'absent'|'sick', note? }] */
  @Column({ type: 'jsonb' })
  entries!: Array<Record<string, unknown>>;

  @Column({ nullable: true })
  conductedById?: string;

  @Column({ nullable: true })
  conductedByName?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('exeat_passes')
@Index(['studentId'])
@Index(['status'])
export class ExeatPass {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  studentId!: string;

  @Column()
  destination!: string;

  @Column({ type: 'timestamp' })
  departureAt!: Date;

  @Column({ type: 'timestamp' })
  returnAt!: Date;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  /** requested | approved | rejected | returned | overdue */
  @Column({ type: 'varchar', length: 16, default: 'requested' })
  status!: string;

  @Column({ nullable: true })
  requestedById?: string;

  @Column({ nullable: true })
  approvedById?: string;

  @Column({ type: 'text', nullable: true })
  approvalNote?: string;

  @Column({ type: 'timestamp', nullable: true })
  returnedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('hostel_items')
export class HostelItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  /** bedding | furniture | kitchen | laundry | other */
  @Column({ type: 'varchar', length: 32, default: 'other' })
  category!: string;

  @Column({ type: 'int', default: 0 })
  quantity!: number;

  @Column({ type: 'int', default: 0 })
  condition!: number; // 0-100

  @Column({ nullable: true })
  dormitoryId?: string;

  @Column({ nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
