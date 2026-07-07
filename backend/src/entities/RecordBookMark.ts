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
import { Term } from './Term';
import { SchoolClass } from './SchoolClass';
import { Student } from './Student';
import { Staff } from './Staff';
import { Subject } from './Subject';

@Entity('record_book_marks')
@Unique(['termId', 'classId', 'ownerKey', 'subjectId', 'studentId', 'columnKey'])
export class RecordBookMark {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Term, FK_RESTRICT)
  @JoinColumn({ name: 'termId' })
  term!: Term;

  @Column()
  termId!: string;

  @ManyToOne(() => SchoolClass, FK_CASCADE)
  @JoinColumn({ name: 'classId' })
  schoolClass!: SchoolClass;

  @Column()
  classId!: string;

  @ManyToOne(() => Subject, FK_RESTRICT)
  @JoinColumn({ name: 'subjectId' })
  subject!: Subject;

  @Column()
  subjectId!: string;

  @Column()
  ownerKey!: string;

  @ManyToOne(() => Student, FK_CASCADE)
  @JoinColumn({ name: 'studentId' })
  student!: Student;

  @Column()
  studentId!: string;

  @Column()
  columnKey!: string;

  @Column({ type: 'decimal', precision: 6, scale: 2 })
  marks!: number;

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
