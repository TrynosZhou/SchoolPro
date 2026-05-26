import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';
import type { GradeBoundary } from '../types/grade-boundaries';

@Entity('school_settings')
export class SchoolSettings {
  @PrimaryColumn({ type: 'varchar', length: 32, default: 'default' })
  id!: string;

  @Column({ default: 'School Pro Academy' })
  schoolName!: string;

  @Column({ nullable: true })
  tagline?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  website?: string;

  /** Public path e.g. /uploads/logos/school-logo.png */
  @Column({ nullable: true })
  logoUrl?: string;

  @Column({ default: 'USD' })
  currency!: string;

  @Column({ type: 'text', nullable: true })
  feeReminderTemplate?: string;

  /** Exam mark → letter grade bands (min % per grade). */
  @Column({ type: 'jsonb', nullable: true })
  gradeBoundaries?: GradeBoundary[];

  @UpdateDateColumn()
  updatedAt!: Date;
}
