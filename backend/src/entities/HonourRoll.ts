import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { Student } from './Student';
import { Term } from './Term';
import { SchoolClass } from './SchoolClass';
import { FK_CASCADE, FK_RESTRICT } from './constraints';

/** formId removed — derived via class.form (3NF) */
@Entity('honour_rolls')
@Unique(['studentId', 'termId'])
export class HonourRoll {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Student, FK_CASCADE)
  @JoinColumn({ name: 'studentId' })
  student!: Student;

  @Column()
  studentId!: string;

  @ManyToOne(() => Term, FK_RESTRICT)
  @JoinColumn({ name: 'termId' })
  term!: Term;

  @Column()
  termId!: string;

  @ManyToOne(() => SchoolClass, { ...FK_RESTRICT, nullable: true })
  @JoinColumn({ name: 'classId' })
  schoolClass?: SchoolClass;

  @Column({ nullable: true })
  classId?: string;

  @Column({ type: 'decimal', precision: 6, scale: 2 })
  averageMark!: number;

  @Column({ type: 'int' })
  classPosition!: number;

  @Column({ type: 'int' })
  formPosition!: number;

  @Column({ type: 'int' })
  overallRank!: number;

  @Column({ nullable: true })
  award?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

