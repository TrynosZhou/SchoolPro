import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Student } from './Student';
import { Parent } from './Parent';
import { FK_CASCADE, FK_SET_NULL } from './constraints';

@Entity('guardians')
export class Guardian {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Student, (s) => s.guardians, FK_CASCADE)
  @JoinColumn({ name: 'studentId' })
  student!: Student;

  @Column()
  studentId!: string;

  @ManyToOne(() => Parent, (p) => p.guardianships, { ...FK_SET_NULL, nullable: true })
  @JoinColumn({ name: 'parentId' })
  parent?: Parent;

  @Column({ nullable: true })
  parentId?: string;

  /** Required only when parentId is null (contact not in parents table) */
  @Column({ nullable: true })
  fullName?: string;

  @Column({ nullable: true })
  relationship?: string;

  @Column({ nullable: true })
  phone?: string;

  /** Guardian phone in E.164 format for WhatsApp/SMS notifications. */
  @Column({ nullable: true })
  guardianPhone?: string;

  /** Explicit opt-in for WhatsApp result notifications. */
  @Column({ default: false })
  guardianWhatsappConsent!: boolean;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ default: false })
  isPrimary!: boolean;

  @Column({ default: false })
  isEmergencyContact!: boolean;
}

