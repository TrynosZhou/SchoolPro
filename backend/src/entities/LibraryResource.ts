import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { FK_RESTRICT, FK_SET_NULL } from './constraints';
import { Subject } from './Subject';
import { Form } from './Form';
import { User } from './User';
import { LibraryResourceType, UserRole } from './enums';
import { LibraryBookmark } from './LibraryBookmark';

@Entity('library_resources')
@Index(['subjectId', 'resourceType'])
@Index(['gradeFormId', 'resourceType'])
export class LibraryResource {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: LibraryResourceType, default: LibraryResourceType.PDF })
  resourceType!: LibraryResourceType;

  /** Stored object key (local/S3) when a file was uploaded. */
  @Column({ nullable: true })
  fileKey?: string;

  @Column({ nullable: true })
  fileOriginalName?: string;

  @Column({ nullable: true })
  fileMimeType?: string;

  @Column({ type: 'int', nullable: true })
  fileSize?: number;

  /** External link when resourceType is link/video. */
  @Column({ type: 'text', nullable: true })
  externalUrl?: string;

  @ManyToOne(() => Subject, { nullable: true, ...FK_SET_NULL })
  @JoinColumn({ name: 'subjectId' })
  subject?: Subject;

  @Column({ nullable: true })
  subjectId?: string;

  /** Optional form/grade level (e.g. Form 1). */
  @ManyToOne(() => Form, { nullable: true, ...FK_SET_NULL })
  @JoinColumn({ name: 'gradeFormId' })
  gradeForm?: Form;

  @Column({ nullable: true })
  gradeFormId?: string;

  @ManyToOne(() => User, FK_RESTRICT)
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy!: User;

  @Column()
  uploadedById!: string;

  /** Roles allowed to view/download; empty = all authenticated school roles. */
  @Column({ type: 'text', array: true, default: '{}' })
  accessRoles!: UserRole[];

  @Column({ default: true })
  isPublished!: boolean;

  @OneToMany(() => LibraryBookmark, (b) => b.resource)
  bookmarks?: LibraryBookmark[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
