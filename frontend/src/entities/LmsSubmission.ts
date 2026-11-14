import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import { FK_CASCADE, FK_SET_NULL } from './constraints';
import { LmsAssignment } from './LmsAssignment';
import { Student } from './Student';
import { Staff } from './Staff';
import { LmsSubmissionStatus } from './enums';

@Entity('lms_submissions')
@Unique(['assignmentId', 'studentId'])
@Index(['studentId', 'submittedAt'])
export class LmsSubmission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => LmsAssignment, (a) => a.submissions, FK_CASCADE)
  @JoinColumn({ name: 'assignmentId' })
  assignment!: LmsAssignment;

  @Column()
  assignmentId!: string;

  @ManyToOne(() => Student, FK_CASCADE)
  @JoinColumn({ name: 'studentId' })
  student!: Student;

  @Column()
  studentId!: string;

  @Column({ type: 'text', nullable: true })
  textAnswer?: string;

  @Column({ nullable: true })
  fileKey?: string;

  @Column({ nullable: true })
  fileOriginalName?: string;

  @Column({ nullable: true })
  fileMimeType?: string;

  @Column({ type: 'int', nullable: true })
  fileSize?: number;

  @Column({ type: 'enum', enum: LmsSubmissionStatus, default: LmsSubmissionStatus.SUBMITTED })
  status!: LmsSubmissionStatus;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  grade?: string;

  @Column({ type: 'text', nullable: true })
  feedback?: string;

  @ManyToOne(() => Staff, { nullable: true, ...FK_SET_NULL })
  @JoinColumn({ name: 'gradedById' })
  gradedBy?: Staff;

  @Column({ nullable: true })
  gradedById?: string;

  @Column({ type: 'timestamptz', nullable: true })
  gradedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
