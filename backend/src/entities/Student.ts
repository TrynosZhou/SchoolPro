import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { FK_CASCADE, FK_SET_NULL } from './constraints';
import { User } from './User';
import { SchoolClass } from './SchoolClass';
import { Guardian } from './Guardian';
import { StudentAttendance } from './StudentAttendance';
import { ExamMark } from './ExamMark';
import { Invoice } from './Invoice';
import { LedgerEntry } from './LedgerEntry';

@Entity('students')
export class Student {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  admissionNumber!: string;

  @OneToOne(() => User, { nullable: true, ...FK_SET_NULL })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ nullable: true })
  userId?: string;

  @Column()
  firstName!: string;

  @Column()
  lastName!: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth?: string;

  @Column({ nullable: true })
  gender?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  previousSchool?: string;

  @Column({ nullable: true })
  photoUrl?: string;

  @ManyToOne(() => SchoolClass, (c) => c.students, { nullable: true, ...FK_SET_NULL })
  @JoinColumn({ name: 'classId' })
  schoolClass?: SchoolClass;

  @Column({ nullable: true })
  classId?: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'date', nullable: true })
  enrollmentDate?: string;

  @OneToMany(() => Guardian, (g) => g.student)
  guardians!: Guardian[];

  @OneToMany(() => StudentAttendance, (a) => a.student)
  attendanceRecords!: StudentAttendance[];

  @OneToMany(() => ExamMark, (m) => m.student)
  examMarks!: ExamMark[];

  @OneToMany(() => Invoice, (i) => i.student)
  invoices!: Invoice[];

  @OneToMany(() => LedgerEntry, (l) => l.student)
  ledgerEntries!: LedgerEntry[];

  @CreateDateColumn()
  createdAt!: Date;
}

