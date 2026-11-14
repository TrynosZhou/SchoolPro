import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import { FK_CASCADE } from './constraints';
import { Parent } from './Parent';
import { Student } from './Student';
import { Term } from './Term';
import { ExamType } from './ExamType';

/**
 * Records that a parent has opened (viewed/downloaded) a linked child's report card
 * for a given term + exam type. One row per parent/child/term/exam type.
 */
@Entity('report_card_views')
@Unique(['parentId', 'studentId', 'termId', 'examTypeId'])
@Index(['termId', 'examTypeId'])
export class ReportCardView {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Parent, FK_CASCADE)
  @JoinColumn({ name: 'parentId' })
  parent!: Parent;

  @Column()
  parentId!: string;

  @ManyToOne(() => Student, FK_CASCADE)
  @JoinColumn({ name: 'studentId' })
  student!: Student;

  @Column()
  studentId!: string;

  @ManyToOne(() => Term, FK_CASCADE)
  @JoinColumn({ name: 'termId' })
  term!: Term;

  @Column()
  termId!: string;

  @ManyToOne(() => ExamType, FK_CASCADE)
  @JoinColumn({ name: 'examTypeId' })
  examType!: ExamType;

  @Column()
  examTypeId!: string;

  @CreateDateColumn()
  firstViewedAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  lastViewedAt!: Date;

  @Column({ type: 'int', default: 1 })
  viewCount!: number;
}
