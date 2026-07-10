import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { FK_CASCADE, FK_RESTRICT } from './constraints';
import { SchoolClass } from './SchoolClass';
import { Subject } from './Subject';
import { Term } from './Term';
import { Staff } from './Staff';
import { LessonContentType } from './enums';

@Entity('lesson_contents')
@Index(['classId', 'subjectId', 'publishedAt'])
export class LessonContent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => SchoolClass, { nullable: true, ...FK_CASCADE })
  @JoinColumn({ name: 'classId' })
  schoolClass?: SchoolClass;

  @Column({ nullable: true })
  classId?: string;

  @ManyToOne(() => Subject, FK_RESTRICT)
  @JoinColumn({ name: 'subjectId' })
  subject!: Subject;

  @Column()
  subjectId!: string;

  @ManyToOne(() => Term, { nullable: true, ...FK_RESTRICT })
  @JoinColumn({ name: 'termId' })
  term?: Term;

  @Column({ nullable: true })
  termId?: string;

  @ManyToOne(() => Staff, FK_RESTRICT)
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy!: Staff;

  @Column()
  uploadedById!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: LessonContentType, default: LessonContentType.NOTE })
  contentType!: LessonContentType;

  /** External URL (YouTube, Drive, etc.) when contentType is link/video. */
  @Column({ type: 'text', nullable: true })
  externalUrl?: string;

  /** Stored file key when uploading notes/documents/videos. */
  @Column({ nullable: true })
  fileKey?: string;

  @Column({ nullable: true })
  fileOriginalName?: string;

  @Column({ nullable: true })
  fileMimeType?: string;

  @Column({ type: 'int', nullable: true })
  fileSize?: number;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ default: true })
  isPublished!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
