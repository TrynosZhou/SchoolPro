import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum DisciplineKind {
  MERIT = 'merit',
  DEMERIT = 'demerit',
  INCIDENT = 'incident',
}

export enum IncidentStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
}

@Entity('discipline_incidents')
@Index(['studentId', 'date'])
@Index(['classId', 'termId'])
export class DisciplineIncident {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  studentId!: string;

  @Column({ nullable: true })
  classId?: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'varchar', length: 16 })
  kind!: DisciplineKind;

  /** e.g. punctuality, uniform, academics, behaviour, attendance, other */
  @Column({ type: 'varchar', length: 64 })
  category!: string;

  @Column({ type: 'text' })
  description!: string;

  /** Positive for merits, negative for demerits, 0 for plain incidents. */
  @Column({ type: 'int', default: 0 })
  points!: number;

  /** Sanction applied: warning, detention, suspension, community_service, none */
  @Column({ type: 'varchar', length: 32, default: 'none' })
  sanctionType!: string;

  @Column({ type: 'text', nullable: true })
  sanctionDetails?: string;

  @Column({ type: 'date', nullable: true })
  sanctionEndDate?: string;

  @Column({ type: 'varchar', length: 16, default: IncidentStatus.OPEN })
  status!: IncidentStatus;

  @Column({ nullable: true })
  termId?: string;

  @Column({ default: false })
  parentNotified!: boolean;

  @Column({ nullable: true })
  recordedById?: string;

  @Column({ nullable: true })
  recordedByName?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
