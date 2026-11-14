import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Student } from './Student';
import { Subject } from './Subject';
import { Term } from './Term';
import { Staff } from './Staff';

@Entity('weekly_assessments')
export class WeeklyAssessment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student!: Student;

  @Column()
  studentId!: string;

  @ManyToOne(() => Subject)
  @JoinColumn({ name: 'subjectId' })
  subject!: Subject;

  @Column()
  subjectId!: string;

  @ManyToOne(() => Term)
  @JoinColumn({ name: 'termId' })
  term!: Term;

  @Column()
  termId!: string;

  @Column({ type: 'date' })
  weekStart!: string;

  @Column()
  topic!: string;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  score?: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  maxScore?: number;

  @Column({ nullable: true })
  remarks?: string;

  @ManyToOne(() => Staff, { nullable: true })
  @JoinColumn({ name: 'teacherId' })
  teacher?: Staff;

  @Column({ nullable: true })
  teacherId?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

