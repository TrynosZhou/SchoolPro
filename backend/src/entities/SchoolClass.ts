import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Form } from './Form';
import { Student } from './Student';
import { ClassSubject } from './ClassSubject';
import { Staff } from './Staff';
import { FK_RESTRICT, FK_SET_NULL } from './constraints';

@Entity('classes')
export class SchoolClass {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @ManyToOne(() => Form, (f) => f.classes, FK_RESTRICT)
  @JoinColumn({ name: 'formId' })
  form!: Form;

  @Column()
  formId!: string;

  @ManyToOne(() => Staff, { ...FK_SET_NULL, nullable: true })
  @JoinColumn({ name: 'classTeacherId' })
  classTeacher?: Staff;

  @Column({ nullable: true })
  classTeacherId?: string;

  @Column({ type: 'int', default: 0 })
  capacity!: number;

  @OneToMany(() => Student, (s) => s.schoolClass)
  students!: Student[];

  @OneToMany(() => ClassSubject, (cs) => cs.schoolClass)
  classSubjects!: ClassSubject[];
}

