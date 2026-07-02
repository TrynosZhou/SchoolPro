import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Column,
  Unique,
} from 'typeorm';
import { FK_CASCADE, FK_RESTRICT, FK_SET_NULL } from './constraints';
import { LessonLength } from './enums';
import { SchoolClass } from './SchoolClass';
import { Subject } from './Subject';
import { Staff } from './Staff';

@Entity('class_subjects')
@Unique(['classId', 'subjectId'])
export class ClassSubject {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => SchoolClass, (c) => c.classSubjects, FK_CASCADE)
  @JoinColumn({ name: 'classId' })
  schoolClass!: SchoolClass;

  @Column()
  classId!: string;

  @ManyToOne(() => Subject, (s) => s.classSubjects, FK_RESTRICT)
  @JoinColumn({ name: 'subjectId' })
  subject!: Subject;

  @Column()
  subjectId!: string;

  @ManyToOne(() => Staff, { ...FK_SET_NULL, nullable: true })
  @JoinColumn({ name: 'teacherId' })
  teacher?: Staff;

  @Column({ nullable: true })
  teacherId?: string;

  /** Planned weekly lesson count when set from Teacher Load (used when no timetable slots exist yet). */
  @Column({ type: 'int', default: 0 })
  weeklyPeriods!: number;

  /** Whether each weekly lesson is a single, double, or triple period block. */
  @Column({ type: 'varchar', length: 16, default: LessonLength.SINGLE })
  lessonLength!: LessonLength;
}

