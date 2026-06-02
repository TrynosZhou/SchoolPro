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

