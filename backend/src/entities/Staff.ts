import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from './User';

@Entity('staff')
export class Staff {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  employeeNumber!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  title?: string | null;

  /** 'male' | 'female' (nullable for existing/unspecified records). */
  @Column({ type: 'varchar', length: 16, nullable: true })
  gender?: string | null;

  /** 'single' | 'married' – drives the Miss / Mrs / Ms greeting. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  maritalStatus?: string | null;

  /** A married woman who still uses her maiden name is addressed as Ms. */
  @Column({ type: 'boolean', default: false })
  usesMaidenName!: boolean;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: string;

  @Column({ nullable: true })
  department?: string;

  @Column({ nullable: true })
  qualification?: string;

  @Column({ type: 'date', nullable: true })
  hireDate?: string;

  @Column({ default: true })
  isActive!: boolean;

  /** Optional per-teacher weekly period cap (overrides school default). */
  @Column({ type: 'int', nullable: true })
  maxWeeklyPeriods?: number | null;

  @CreateDateColumn()
  createdAt!: Date;
}

