import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { FK_CASCADE, FK_RESTRICT } from './constraints';
import { Student } from './Student';
import { ExamType } from './ExamType';

/** Delivery log for WhatsApp/SMS result notifications sent to guardians. */
@Entity('notification_logs')
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Student, { ...FK_CASCADE })
  @JoinColumn({ name: 'studentId' })
  student!: Student;

  @Column()
  studentId!: string;

  @ManyToOne(() => ExamType, { ...FK_RESTRICT })
  @JoinColumn({ name: 'examId' })
  examType!: ExamType;

  @Column()
  examId!: string;

  @Column({ type: 'varchar', length: 32 })
  phone!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  messageSid?: string;

  /** queued | sent | delivered | failed | undelivered */
  @Column({ type: 'varchar', length: 24, default: 'queued' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
