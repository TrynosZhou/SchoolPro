import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('staff_contracts')
@Index(['staffId', 'status'])
export class StaffContract {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  staffId!: string;

  /** permanent | fixed_term | part_time | casual | probation */
  @Column({ type: 'varchar', length: 24, default: 'permanent' })
  contractType!: string;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date', nullable: true })
  endDate?: string;

  @Column({ nullable: true })
  position?: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  salary?: number;

  /** active | expired | terminated | renewed */
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: string;

  @Column({ nullable: true })
  documentUrl?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('staff_appraisals')
@Index(['staffId'])
export class StaffAppraisal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  staffId!: string;

  /** e.g. '2026 Term 1' or '2026' */
  @Column()
  period!: string;

  /** 1-5 overall rating */
  @Column({ type: 'int', nullable: true })
  rating?: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  score?: number;

  @Column({ type: 'text', nullable: true })
  strengths?: string;

  @Column({ type: 'text', nullable: true })
  areasForImprovement?: string;

  @Column({ type: 'text', nullable: true })
  goals?: string;

  @Column({ nullable: true })
  appraiserId?: string;

  @Column({ nullable: true })
  appraiserName?: string;

  @Column({ type: 'date', nullable: true })
  date?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('staff_development')
@Index(['staffId'])
export class StaffDevelopment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  staffId!: string;

  @Column()
  course!: string;

  @Column({ nullable: true })
  provider?: string;

  @Column({ type: 'date', nullable: true })
  date?: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  hours?: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  cost?: number;

  @Column({ nullable: true })
  certificateUrl?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('staff_documents')
@Index(['staffId', 'expiryDate'])
export class StaffDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  staffId!: string;

  /** qualification | license | passport | contract | clearance | other */
  @Column({ type: 'varchar', length: 32 })
  docType!: string;

  @Column()
  title!: string;

  @Column({ nullable: true })
  documentUrl?: string;

  @Column({ type: 'date', nullable: true })
  issueDate?: string;

  @Column({ type: 'date', nullable: true })
  expiryDate?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('job_postings')
@Index(['status'])
export class JobPosting {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  @Column({ nullable: true })
  department?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 24, default: 'open' })
  employmentType!: string; // full_time | part_time | contract

  /** open | closed | filled */
  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: string;

  @Column({ type: 'date', nullable: true })
  closingDate?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('job_applications')
@Index(['jobPostingId'])
export class JobApplication {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  jobPostingId!: string;

  @Column()
  applicantName!: string;

  @Column()
  email!: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  coverNote?: string;

  @Column({ nullable: true })
  cvUrl?: string;

  /** received | shortlisted | interviewed | hired | rejected */
  @Column({ type: 'varchar', length: 16, default: 'received' })
  status!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
