import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('houses')
export class House {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ nullable: true })
  color?: string;

  @Column({ nullable: true })
  motto?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('activities')
@Index(['type'])
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  /** sport | club | society | other */
  @Column({ type: 'varchar', length: 24, default: 'club' })
  type!: string;

  @Column({ nullable: true })
  coachStaffId?: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  termId?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('activity_members')
@Index(['activityId', 'studentId'])
export class ActivityMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  activityId!: string;

  @Column()
  studentId!: string;

  /** captain | member */
  @Column({ type: 'varchar', length: 16, default: 'member' })
  role!: string;

  @Column({ type: 'date', nullable: true })
  joinedDate?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('activity_points')
@Index(['studentId', 'date'])
export class ActivityPoints {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  studentId!: string;

  @Column({ nullable: true })
  activityId?: string;

  @Column({ nullable: true })
  competitionId?: string;

  @Column({ type: 'int' })
  points!: number;

  @Column({ type: 'text', nullable: true })
  reason!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ nullable: true })
  awardedById?: string;

  @Column({ nullable: true })
  awardedByName?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('competitions')
@Index(['activityId'])
export class Competition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  activityId?: string;

  @Column({ type: 'date', nullable: true })
  date?: string;

  @Column({ nullable: true })
  location?: string;

  @Column({ type: 'varchar', length: 32, default: 'upcoming' })
  status!: string; // upcoming | completed | cancelled

  /** [{ studentId, position, pointsAwarded }] */
  @Column({ type: 'jsonb', nullable: true })
  results?: Array<Record<string, unknown>>;

  @CreateDateColumn()
  createdAt!: Date;
}
