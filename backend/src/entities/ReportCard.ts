import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { FK_CASCADE, FK_RESTRICT } from './constraints';
import { Student } from './Student';
import { Term } from './Term';
import { ExamType } from './ExamType';

@Entity('report_cards')
@Unique(['studentId', 'termId', 'examTypeId'])
export class ReportCard {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Student, FK_CASCADE)
  @JoinColumn({ name: 'studentId' })
  student!: Student;

  @Column()
  studentId!: string;

  @ManyToOne(() => Term, FK_RESTRICT)
  @JoinColumn({ name: 'termId' })
  term!: Term;

  @Column()
  termId!: string;

  @ManyToOne(() => ExamType, { nullable: true, ...FK_RESTRICT })
  @JoinColumn({ name: 'examTypeId' })
  examType?: ExamType;

  @Column({ nullable: true })
  examTypeId?: string;

  @Column({ type: 'jsonb' })
  subjectResults!: Record<string, unknown>[];

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  averageMark?: number;

  @Column({ nullable: true })
  overallGrade?: string;

  @Column({ type: 'int', nullable: true })
  classPosition?: number;

  @Column({ type: 'int', nullable: true })
  formPosition?: number;

  /** Active students enrolled in the learner's class (ranking denominator). */
  @Column({ type: 'int', nullable: true })
  classTotal?: number;

  /** Active students enrolled in the learner's form/grade (ranking denominator). */
  @Column({ type: 'int', nullable: true })
  formTotal?: number;

  /** Subjects at or above the pass threshold (default 50%). */
  @Column({ type: 'int', nullable: true })
  subjectsPassed?: number;

  @Column({ type: 'int', nullable: true })
  totalSubjects?: number;

  @Column({ nullable: true })
  classTeacherRemarks?: string;

  @Column({ nullable: true })
  principalRemarks?: string;

  /** Behaviour rating used to generate class-teacher remarks. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  behaviorRating?: string;

  /** Attitude rating used to generate class-teacher remarks. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  attitudeRating?: string;

  @Column({ nullable: true })
  conduct?: string;

  @Column({ default: false })
  isPublished!: boolean;

  @Column({ nullable: true })
  pdfUrl?: string;

  @CreateDateColumn()
  generatedAt!: Date;
}

