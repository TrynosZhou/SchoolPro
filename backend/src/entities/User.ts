import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
} from 'typeorm';
import { UserRole } from './enums';
import { Student } from './Student';
import { Staff } from './Staff';
import { Parent } from './Parent';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

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

  @Column({ default: true })
  isActive!: boolean;

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

