import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FK_CASCADE, FK_RESTRICT, FK_SET_NULL } from './constraints';
import { LessonLength, TeacherAssignmentRole } from './enums';
import { Staff } from './Staff';
import { SchoolClass } from './SchoolClass';
import { Section } from './Section';
import { Subject } from './Subject';
import { TimetableSlot } from './TimetableSlot';

@Entity('teacher_assignments')
export class TeacherAssignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Staff, FK_RESTRICT)
  @JoinColumn({ name: 'teacherId' })
  teacher!: Staff;

  @Column()
  teacherId!: string;

  @ManyToOne(() => SchoolClass, FK_CASCADE)
  @JoinColumn({ name: 'classId' })
  schoolClass!: SchoolClass;

  @Column()
  classId!: string;

  @ManyToOne(() => Section, { ...FK_SET_NULL, nullable: true })
  @JoinColumn({ name: 'sectionId' })
  section?: Section | null;

  @Column({ nullable: true })
  sectionId?: string | null;

  @ManyToOne(() => Subject, { ...FK_SET_NULL, nullable: true })
  @JoinColumn({ name: 'subjectId' })
  subject?: Subject | null;

  /** Null when role is class_teacher (homeroom). */
  @Column({ nullable: true })
  subjectId?: string | null;

  @Column({ type: 'varchar', length: 32 })
  role!: TeacherAssignmentRole;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date', nullable: true })
  endDate?: string | null;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'int', default: 0 })
  weeklyPeriods!: number;

  @Column({ type: 'varchar', length: 16, default: LessonLength.SINGLE })
  lessonLength!: LessonLength;

  /** Allow multiple active subject teachers for the same class/subject (split/shared class). */
  @Column({ default: false })
  isSharedSplit!: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => TimetableSlot, (slot) => slot.assignment)
  timetableSlots!: TimetableSlot[];

  /** Set when listing — Staff → Teacher Load no longer matches this row. */
  loadOutOfSync?: boolean;
}
