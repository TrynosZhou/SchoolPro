import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { FK_CASCADE } from './constraints';
import { Student } from './Student';
import { AttendanceStatus, AttendanceMode } from './enums';

@Entity('student_attendance')
@Unique(['studentId', 'date'])
export class StudentAttendance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Student, (s) => s.attendanceRecords, FK_CASCADE)
  @JoinColumn({ name: 'studentId' })
  student!: Student;

  @Column()
  studentId!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'enum', enum: AttendanceStatus })
  status!: AttendanceStatus;

  /** in_person (default) or remote for hybrid sessions. */
  @Column({ type: 'enum', enum: AttendanceMode, default: AttendanceMode.IN_PERSON })
  mode!: AttendanceMode;

  @Column({ nullable: true })
  markedById?: string;

  @Column({ nullable: true })
  remarks?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

