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
import { DayOfWeek } from './enums';
import { Timetable } from './Timetable';
import { Staff } from './Staff';
import { Subject } from './Subject';
import { SchoolClass } from './SchoolClass';

@Entity('teacher_allocations')
@Unique('UQ_teacher_allocations_timetable_entry', ['timetableEntryId'])
// NOTE: a teacher may be allocated to 2+ classes in the same slot (double-booking is
// allowed via the timetable "Ignore conflicts" flow), so there is intentionally no
// unique constraint on (teacherId, dayOfWeek, startTime, endTime).
export class TeacherAllocation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Timetable, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'timetableEntryId' })
  timetableEntry!: Timetable;

  @Column()
  timetableEntryId!: string;

  @ManyToOne(() => Staff)
  @JoinColumn({ name: 'teacherId' })
  teacher!: Staff;

  @Column()
  teacherId!: string;

  @ManyToOne(() => Subject)
  @JoinColumn({ name: 'subjectId' })
  subject!: Subject;

  @Column()
  subjectId!: string;

  @ManyToOne(() => SchoolClass, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'classId' })
  schoolClass!: SchoolClass;

  @Column()
  classId!: string;

  @Column({ type: 'enum', enum: DayOfWeek })
  dayOfWeek!: DayOfWeek;

  @Column({ type: 'varchar', length: 8 })
  startTime!: string;

  @Column({ type: 'varchar', length: 8 })
  endTime!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
