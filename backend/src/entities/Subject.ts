import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { ClassSubject } from './ClassSubject';
import { ExamMark } from './ExamMark';

@Entity('subjects')
export class Subject {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  code!: string;

  @Column()
  name!: string;

  /** Short label for timetables (e.g. Ma, CS, Eng). */
  @Column({ nullable: true, length: 16 })
  short?: string | null;

  @Column({ nullable: true })
  description?: string;

  @OneToMany(() => ClassSubject, (cs) => cs.subject)
  classSubjects!: ClassSubject[];

  @OneToMany(() => ExamMark, (m) => m.subject)
  examMarks!: ExamMark[];
}

