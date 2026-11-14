import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FK_CASCADE, FK_RESTRICT } from './constraints';
import { SchoolClass } from './SchoolClass';
import { Subject } from './Subject';
import { Term } from './Term';
import { Staff } from './Staff';

@Entity('homework_assignments')
export class HomeworkAssignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => SchoolClass, FK_CASCADE)
  @JoinColumn({ name: 'classId' })
  schoolClass!: SchoolClass;

  @Column()
  classId!: string;

  @ManyToOne(() => Subject, { nullable: true, ...FK_RESTRICT })
  @JoinColumn({ name: 'subjectId' })
  subject?: Subject;

  @Column({ nullable: true })
  subjectId?: string;

  @ManyToOne(() => Term, FK_RESTRICT)
  @JoinColumn({ name: 'termId' })
  term!: Term;

  @Column()
  termId!: string;

  @ManyToOne(() => Staff, FK_RESTRICT)
  @JoinColumn({ name: 'teacherId' })
  teacher!: Staff;

  @Column()
  teacherId!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  instructions?: string;

  @Column()
  originalFileName!: string;

  @Column()
  storedFileName!: string;

  @Column()
  mimeType!: string;

  @Column({ type: 'int' })
  fileSize!: number;

  @Column({ type: 'date', nullable: true })
  dueDate?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
