import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FK_CASCADE } from './constraints';
import { EnrollmentStatus } from './enums';
import { Student } from './Student';
import { SchoolYear } from './SchoolYear';

/**
 * Per-academic-year snapshot of a student's enrollment. One row per (student, school year).
 * This is the historical backbone for year-over-year retention & dropout analytics — the
 * live `Student` record only holds the current state, so without these snapshots we cannot
 * tell whether a student who was on the roll last year re-enrolled this year.
 *
 * `formName` / `className` are denormalised labels so historical reports remain meaningful
 * even if the class/form is later renamed or deleted.
 */
@Entity('student_enrollments')
@Unique('UQ_enrollment_student_year', ['studentId', 'schoolYearId'])
export class StudentEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Student, { ...FK_CASCADE })
  @JoinColumn({ name: 'studentId' })
  student?: Student;

  @Index()
  @Column()
  studentId!: string;

  @ManyToOne(() => SchoolYear, { ...FK_CASCADE })
  @JoinColumn({ name: 'schoolYearId' })
  schoolYear?: SchoolYear;

  @Index()
  @Column()
  schoolYearId!: string;

  /** Snapshot of the form/grade the student sat in for this year (no FK — keep history). */
  @Column({ nullable: true })
  formId?: string;

  @Column({ nullable: true, length: 120 })
  formName?: string;

  @Column({ nullable: true })
  classId?: string;

  @Column({ nullable: true, length: 120 })
  className?: string;

  @Column({ type: 'varchar', length: 24, default: EnrollmentStatus.ENROLLED })
  status!: string;

  @Column({ type: 'date', nullable: true })
  startDate?: string;

  @Column({ type: 'date', nullable: true })
  endDate?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
