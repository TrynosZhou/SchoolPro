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
import { Staff } from './Staff';
import { AttendanceStatus } from './enums';

@Entity('staff_attendance')
@Unique(['staffId', 'date'])
export class StaffAttendance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Staff, FK_CASCADE)
  @JoinColumn({ name: 'staffId' })
  staff!: Staff;

  @Column()
  staffId!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'enum', enum: AttendanceStatus })
  status!: AttendanceStatus;

  @Column({ nullable: true })
  markedById?: string;

  @Column({ nullable: true })
  remarks?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

