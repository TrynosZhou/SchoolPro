import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserRole } from './enums';
import { Student } from './Student';
import { Staff } from './Staff';
import { Parent } from './Parent';
import { SchoolRole } from './SchoolRole';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ unique: true, nullable: true })
  username?: string | null;

  @Column()
  passwordHash!: string;

  @Column()
  firstName!: string;

  @Column()
  lastName!: string;

  @Column({ nullable: true })
  phone?: string;

  /** Personal details kept on the account itself (admins/principals may have no staff profile). */
  @Column({ type: 'varchar', length: 16, nullable: true })
  gender?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  maritalStatus?: string | null;

  @Column({ type: 'boolean', default: false })
  usesMaidenName!: boolean;

  /** Optional explicit courtesy title: Dr, Prof, Rev, Eng, Hon… */
  @Column({ type: 'varchar', length: 16, nullable: true })
  salutation?: string | null;

  @Column({ type: 'enum', enum: UserRole })
  role!: UserRole;

  @Column({ nullable: true })
  schoolRoleId?: string;

  @ManyToOne(() => SchoolRole, (schoolRole) => schoolRole.users, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'schoolRoleId' })
  schoolRole?: SchoolRole;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'int', default: 0 })
  failedLoginAttempts!: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil?: Date | null;

  @Column({ nullable: true })
  passwordResetTokenHash?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  passwordResetExpires?: Date | null;

  @Column({ nullable: true })
  avatarUrl?: string;

  /** When false, student portal sign-in uses date of birth; when true, uses passwordHash only. */
  @Column({ default: false })
  portalPasswordCustomized!: boolean;

  @Column({ default: false })
  twoFactorEnabled!: boolean;

  @Column({ type: 'varchar', nullable: true })
  twoFactorSecret?: string | null;

  @Column({ type: 'varchar', nullable: true })
  twoFactorPendingSecret?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  twoFactorBackupCodes?: string[] | null;

  @Column({ type: 'timestamptz', nullable: true })
  twoFactorEnabledAt?: Date | null;

  @OneToOne(() => Student, (s) => s.user)
  studentProfile?: Student;

  @OneToOne(() => Staff, (s) => s.user)
  staffProfile?: Staff;

  @OneToOne(() => Parent, (p) => p.user)
  parentProfile?: Parent;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

