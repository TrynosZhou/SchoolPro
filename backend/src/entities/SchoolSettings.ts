import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';
import type { GradeBoundary } from '../types/grade-boundaries';
import type { SecurityPolicy } from '../types/security-policy';
import type { IntegrationsConfig } from '../types/integrations-config';
import type { NotificationSettings } from '../types/notification-settings';

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

  @Column({ nullable: true })
  facebookPageUrl?: string;

  /** Public path e.g. /uploads/logos/school-logo.png */
  @Column({ nullable: true })
  logoUrl?: string;

  @Column({ default: 'USD' })
  currency!: string;

  @Column({ nullable: true })
  bankAccountName?: string;

  @Column({ nullable: true })
  bankName?: string;

  @Column({ nullable: true })
  bankBranch?: string;

  @Column({ nullable: true })
  bankAccountNumber?: string;

  @Column({ type: 'text', nullable: true })
  bankPaymentReferenceNote?: string;

  @Column({ type: 'text', nullable: true })
  feeReminderTemplate?: string;

  /** Exam mark → letter grade bands (min % per grade). */
  @Column({ type: 'jsonb', nullable: true })
  gradeBoundaries?: GradeBoundary[];

  /** Password policy, login lockout, session timeout, etc. */
  @Column({ type: 'jsonb', nullable: true })
  securityPolicy?: SecurityPolicy;

  /** Third-party API integrations (WhatsApp, email, webhooks, payments, etc.). */
  @Column({ type: 'jsonb', nullable: true })
  integrationsConfig?: IntegrationsConfig;

  /** Automated notification triggers: absence alerts, fee reminders, exam results. */
  @Column({ type: 'jsonb', nullable: true })
  notificationSettings?: NotificationSettings;

  /** Label shown on timetables, e.g. "1" in "Term 2 (2026) Version 1". */
  @Column({ type: 'varchar', length: 32, default: '1' })
  timetableVersion!: string;

  /** Default minimum weekly teaching periods before flagging underload. */
  @Column({ type: 'int', default: 0 })
  minWeeklyPeriods!: number;

  /** Default maximum weekly teaching periods before flagging overload. */
  @Column({ type: 'int', default: 30 })
  maxWeeklyPeriods!: number;

  @UpdateDateColumn()
  updatedAt!: Date;
}
