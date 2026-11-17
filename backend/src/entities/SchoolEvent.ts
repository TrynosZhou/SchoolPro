import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type SchoolEventType =
  | 'holiday'
  | 'exam'
  | 'event'
  | 'meeting'
  | 'deadline'
  | 'other';

@Entity('school_events')
@Index(['startDate'])
@Index(['type'])
export class SchoolEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 24, default: 'event' })
  type!: SchoolEventType;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date', nullable: true })
  endDate?: string;

  @Column({ default: true })
  allDay!: boolean;

  @Column({ nullable: true })
  location?: string;

  @Column({ nullable: true })
  termId?: string;

  /** Audience hint: all | parents | staff | students */
  @Column({ type: 'varchar', length: 16, default: 'all' })
  audience!: string;

  @Column({ nullable: true })
  createdById?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('event_rsvps')
@Index(['eventId'])
export class EventRsvp {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  eventId!: string;

  @Column()
  userId!: string;

  /** Optional child the RSVP is for. */
  @Column({ nullable: true })
  studentId?: string;

  /** attending | not_attending | maybe */
  @Column({ type: 'varchar', length: 16, default: 'attending' })
  response!: string;

  @Column({ type: 'int', default: 1 })
  guests!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
