import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { FK_CASCADE, FK_RESTRICT } from './constraints';
import { Term } from './Term';
import { SchoolClass } from './SchoolClass';
import { Subject } from './Subject';

@Entity('record_book_columns')
@Unique(['termId', 'classId', 'ownerKey', 'subjectId', 'columnKey'])
export class RecordBookColumn {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Term, FK_RESTRICT)
  @JoinColumn({ name: 'termId' })
  term!: Term;

  @Column()
  termId!: string;

  @ManyToOne(() => SchoolClass, FK_CASCADE)
  @JoinColumn({ name: 'classId' })
  schoolClass!: SchoolClass;

  @Column()
  classId!: string;

  @ManyToOne(() => Subject, FK_RESTRICT)
  @JoinColumn({ name: 'subjectId' })
  subject!: Subject;

  @Column()
  subjectId!: string;

  /** Staff id for teachers, or `user:{userId}` for other roles. */
  @Column()
  ownerKey!: string;

  @Column()
  columnKey!: string;

  @Column()
  label!: string;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
