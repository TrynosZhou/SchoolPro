import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FK_CASCADE, FK_SET_NULL } from './constraints';
import { StudentType, StudentStatus } from './enums';
import { User } from './User';
import { SchoolClass } from './SchoolClass';
import { Form } from './Form';
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

  @Column({ type: 'varchar', length: 32, default: StudentType.DAY_SCHOLAR })
  studentType!: string;

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

  @ManyToOne(() => Form, { nullable: true, ...FK_SET_NULL })
  @JoinColumn({ name: 'formId' })
  form?: Form;

  @Column({ nullable: true })
  formId?: string;

  @Column({ default: true })
  isActive!: boolean;

  /**
   * Lifecycle status on the roll. `active` students are `isActive = true`; any exit
   * (graduated / transferred / withdrawn) is recorded here with `exitDate`/`exitReason`
   * for retention & dropout analytics. `isActive` is kept in sync for backward compat.
   */
  @Column({ type: 'varchar', length: 24, default: StudentStatus.ACTIVE })
  status!: string;

  @Column({ type: 'date', nullable: true })
  exitDate?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  exitReason?: string;

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

  @UpdateDateColumn()
  updatedAt!: Date;
}

