import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { FK_CASCADE } from './constraints';
import { InvoiceAdjustmentType } from './enums';
import { Student } from './Student';

@Entity('invoice_adjustments')
export class InvoiceAdjustment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  noteNumber!: string;

  @Column({ type: 'uuid' })
  studentId!: string;

  @ManyToOne(() => Student, { ...FK_CASCADE })
  @JoinColumn({ name: 'studentId' })
  student?: Student;

  @Column({ type: 'varchar', length: 16 })
  type!: InvoiceAdjustmentType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: number;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ type: 'uuid', nullable: true })
  recordedById?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
