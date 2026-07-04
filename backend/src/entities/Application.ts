import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApplicationStatus } from './enums';
import { ApplicationDocument } from './ApplicationDocument';

/**
 * A prospective student's online admission application. Created by the public
 * (unauthenticated) application form and moved through the admission pipeline
 * (applied → shortlisted → admitted → rejected) by admin staff.
 */
@Entity('applications')
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Human-friendly public reference used by the applicant to track status. */
  @Column({ unique: true })
  referenceNumber!: string;

  @Column()
  studentFirstName!: string;

  @Column()
  studentLastName!: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  gender?: string | null;

  @Column({ nullable: true })
  previousSchool?: string | null;

  /** Grade / form / class the applicant is applying to (free text). */
  @Column()
  classAppliedFor!: string;

  @Column()
  guardianName!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  guardianRelationship?: string | null;

  @Column()
  contactPhone!: string;

  @Column()
  contactEmail!: string;

  @Column({ type: 'text', nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', length: 32, default: ApplicationStatus.APPLIED })
  status!: string;

  /** Optional note from admin, included in the status-change notification. */
  @Column({ type: 'text', nullable: true })
  statusNote?: string | null;

  @OneToMany(() => ApplicationDocument, (d) => d.application)
  documents!: ApplicationDocument[];

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt?: Date | null;

  @CreateDateColumn()
  submittedAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
