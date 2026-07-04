import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/** Types of auditable actions. */
export type AuditActionType = 'create' | 'update' | 'delete';

/** A single field change captured in an audit entry. */
export interface AuditFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * Immutable audit trail entry. Rows are append-only — no updates or deletes
 * are exposed through the application layer (Phase 3 viewer is read-only).
 */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column()
  userId!: string;

  @Column({ length: 32 })
  userRole!: string;

  @Column({ nullable: true, length: 160 })
  userEmail?: string;

  @Column({ type: 'varchar', length: 16 })
  action!: AuditActionType;

  @Index()
  @Column({ length: 64 })
  module!: string;

  @Index()
  @Column({ length: 64 })
  recordId!: string;

  /** Optional human-readable label (e.g. student name or admission number). */
  @Column({ nullable: true, length: 255 })
  recordLabel?: string;

  /** Field-level before/after values for update actions. */
  @Column({ type: 'jsonb', nullable: true })
  changes?: AuditFieldChange[];

  @Index()
  @CreateDateColumn()
  createdAt!: Date;
}
