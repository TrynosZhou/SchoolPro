import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { SchoolClass } from './SchoolClass';
import { Subject } from './Subject';
import { Term } from './Term';
import { Staff } from './Staff';

@Entity('learning_schedules')
export class LearningSchedule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => SchoolClass)
  @JoinColumn({ name: 'classId' })
  schoolClass!: SchoolClass;

  @Column()
  classId!: string;

  @ManyToOne(() => Subject)
  @JoinColumn({ name: 'subjectId' })
  subject!: Subject;

  @Column()
  subjectId!: string;

  @ManyToOne(() => Term)
  @JoinColumn({ name: 'termId' })
  term!: Term;

  @Column()
  termId!: string;

  @Column({ type: 'date' })
  weekStart!: string;

  @Column({ type: 'date' })
  weekEnd!: string;

  @Column({ type: 'text' })
  topics!: string;

  @Column({ type: 'text', nullable: true })
  objectives?: string;

  @Column({ type: 'text', nullable: true })
  resources?: string;

  @ManyToOne(() => Staff, { nullable: true })
  @JoinColumn({ name: 'teacherId' })
  teacher?: Staff;

  @Column({ nullable: true })
  teacherId?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

