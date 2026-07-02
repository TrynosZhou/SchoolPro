import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SchoolClass } from './SchoolClass';
import { Subject } from './Subject';
import { Staff } from './Staff';

@Entity('timetables')
export class Timetable {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => SchoolClass, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'classId' })
  schoolClass!: SchoolClass;

  @Column()
  classId!: string;

  @Column({ type: 'int' })
  dayOfWeek!: number;

  @Column()
  startTime!: string;

  @Column()
  endTime!: string;

  @ManyToOne(() => Subject)
  @JoinColumn({ name: 'subjectId' })
  subject!: Subject;

  @Column()
  subjectId!: string;

  @ManyToOne(() => Staff, { nullable: true })
  @JoinColumn({ name: 'teacherId' })
  teacher?: Staff;

  @Column({ nullable: true })
  teacherId?: string;

  @Column({ nullable: true })
  room?: string;

  @Column({ type: 'boolean', default: false })
  isLocked!: boolean;
}

