import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A saved custom-report definition for the report builder. `config` holds the full
 * builder state (dataset, selected fields, filters and grouping) so a report can be
 * re-run or exported later without re-configuring it.
 */
export interface ReportTemplateConfig {
  /** Which base dataset the report is built from, e.g. 'students' | 'attendance' | 'grades' | 'fees'. */
  dataset: string;
  /** Ordered list of field keys to include as columns. */
  fields: string[];
  /** Filter values keyed by filter id (classId, formId, status, dateFrom, dateTo, termId, schoolYearId...). */
  filters?: Record<string, string | number | boolean | null | undefined>;
  /** Optional field key to group/aggregate rows by. */
  groupBy?: string | null;
  /** Optional sort field key + direction. */
  sortBy?: string | null;
  sortDir?: 'asc' | 'desc' | null;
}

@Entity('report_templates')
export class ReportTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb' })
  config!: ReportTemplateConfig;

  @Column({ nullable: true })
  createdById?: string;

  @Column({ nullable: true, length: 160 })
  createdByName?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
