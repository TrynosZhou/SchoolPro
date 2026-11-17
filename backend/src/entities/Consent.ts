import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('consent_forms')
export class ConsentForm {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  /** trip | media | policy | medical | general */
  @Column({ type: 'varchar', length: 24, default: 'general' })
  type!: string;

  @Column({ type: 'text' })
  body!: string;

  /** Optional trip/event this consent relates to. */
  @Column({ nullable: true })
  eventId?: string;

  @Column({ nullable: true })
  termId?: string;

  @Column({ default: true })
  requiresSignature!: boolean;

  /** draft | published | archived */
  @Column({ type: 'varchar', length: 16, default: 'published' })
  status!: string;

  @Column({ type: 'date', nullable: true })
  dueDate?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('consent_submissions')
@Index(['formId', 'parentId', 'studentId'])
@Index(['studentId', 'status'])
export class ConsentSubmission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  formId!: string;

  @Column()
  parentId!: string;

  @Column({ nullable: true })
  studentId?: string;

  /** pending | signed | declined */
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: string;

  @Column({ nullable: true })
  signatureName?: string;

  @Column({ type: 'timestamp', nullable: true })
  signedAt?: Date;

  @Column({ nullable: true })
  ipAddress?: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
