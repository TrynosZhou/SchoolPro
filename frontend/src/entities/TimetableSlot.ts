import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FK_CASCADE, FK_SET_NULL } from './constraints';
import { DayOfWeek } from './enums';
import { TeacherAssignment } from './TeacherAssignment';
import { Timetable } from './Timetable';

@Entity('timetable_slots')
export class TimetableSlot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => TeacherAssignment, (a) => a.timetableSlots, FK_CASCADE)
  @JoinColumn({ name: 'teacherAssignmentId' })
  assignment!: TeacherAssignment;

  @Column()
  teacherAssignmentId!: string;

  @ManyToOne(() => Timetable, { ...FK_SET_NULL, nullable: true })
  @JoinColumn({ name: 'timetableEntryId' })
  timetableEntry?: Timetable | null;

  @Column({ nullable: true })
  timetableEntryId?: string | null;

  @Column({ type: 'varchar', length: 16 })
  dayOfWeek!: DayOfWeek;

  @Column({ type: 'int' })
  periodNumber!: number;

  @Column({ type: 'varchar', length: 8 })
  startTime!: string;

  @Column({ type: 'varchar', length: 8 })
  endTime!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
