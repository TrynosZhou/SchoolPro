import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { FK_CASCADE, FK_RESTRICT } from './constraints';
import { SchoolClass } from './SchoolClass';
import { Subject } from './Subject';
import { Term } from './Term';
import { Staff } from './Staff';
import { LmsAssignmentStatus } from './enums';
import { LmsSubmission } from './LmsSubmission';

@Entity('lms_assignments')
@Index(['classId', 'subjectId', 'dueAt'])
export class LmsAssignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => SchoolClass, FK_CASCADE)
  @JoinColumn({ name: 'classId' })
  schoolClass!: SchoolClass;

  @Column()
  classId!: string;

  @ManyToOne(() => Subject, { nullable: true, ...FK_RESTRICT })
  @JoinColumn({ name: 'subjectId' })
  subject?: Subject;

  @Column({ nullable: true })
  subjectId?: string;

  @ManyToOne(() => Term, { nullable: true, ...FK_RESTRICT })
  @JoinColumn({ name: 'termId' })
  term?: Term;

  @Column({ nullable: true })
  termId?: string;

  @ManyToOne(() => Staff, FK_RESTRICT)
  @JoinColumn({ name: 'teacherId' })
  teacher!: Staff;

  @Column()
  teacherId!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'timestamptz', nullable: true })
  dueAt?: Date;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  maxScore?: string;

  @Column({ type: 'enum', enum: LmsAssignmentStatus, default: LmsAssignmentStatus.DRAFT })
  status!: LmsAssignmentStatus;

  /** Optional attachment stored via StorageService (local or S3). */
  @Column({ nullable: true })
  attachmentKey?: string;

  @Column({ nullable: true })
  attachmentOriginalName?: string;

  @Column({ nullable: true })
  attachmentMimeType?: string;

  @Column({ type: 'int', nullable: true })
  attachmentSize?: number;

  @OneToMany(() => LmsSubmission, (s) => s.assignment)
  submissions?: LmsSubmission[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
