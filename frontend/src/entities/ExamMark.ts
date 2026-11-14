import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { FK_CASCADE, FK_RESTRICT, FK_SET_NULL } from './constraints';
import { Student } from './Student';
import { Subject } from './Subject';
import { ExamType } from './ExamType';
import { Term } from './Term';
import { SchoolClass } from './SchoolClass';
import { Staff } from './Staff';

@Entity('exam_marks')
@Unique(['studentId', 'subjectId', 'examTypeId', 'termId'])
export class ExamMark {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Student, (s) => s.examMarks, FK_CASCADE)
  @JoinColumn({ name: 'studentId' })
  student!: Student;

  @Column()
  studentId!: string;

  @ManyToOne(() => Subject, (s) => s.examMarks, FK_RESTRICT)
  @JoinColumn({ name: 'subjectId' })
  subject!: Subject;

  @Column()
  subjectId!: string;

  @ManyToOne(() => ExamType, FK_RESTRICT)
  @JoinColumn({ name: 'examTypeId' })
  examType!: ExamType;

  @Column()
  examTypeId!: string;

  @ManyToOne(() => Term, FK_RESTRICT)
  @JoinColumn({ name: 'termId' })
  term!: Term;

  @Column()
  termId!: string;

  /** Class at time of entry (snapshot FK — not derivable if student transfers mid-term) */
  @ManyToOne(() => SchoolClass, FK_RESTRICT)
  @JoinColumn({ name: 'classId' })
  schoolClass!: SchoolClass;

  @Column()
  classId!: string;

  @Column({ type: 'decimal', precision: 6, scale: 2 })
  marks!: number;

  @Column({ nullable: true })
  grade?: string;

  @Column({ nullable: true })
  remarks?: string;

  @ManyToOne(() => Staff, { ...FK_SET_NULL, nullable: true })
  @JoinColumn({ name: 'enteredById' })
  enteredBy?: Staff;

  @Column({ nullable: true })
  enteredById?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

