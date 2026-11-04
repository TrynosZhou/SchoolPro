import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FK_CASCADE } from './constraints';
import { TuitionExemptionType } from './enums';
import { Student } from './Student';

@Entity('tuition_exemptions')
export class TuitionExemption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  studentId!: string;

  @ManyToOne(() => Student, { ...FK_CASCADE })
  @JoinColumn({ name: 'studentId' })
  student?: Student;

  @Column({ type: 'varchar', length: 16 })
  exemptionType!: TuitionExemptionType;

  /** Percentage (0–100) or fixed currency amount, depending on exemptionType. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  value!: number;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
