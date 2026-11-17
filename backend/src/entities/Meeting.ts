import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('meeting_slots')
@Index(['teacherId', 'date'])
export class MeetingSlot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Staff/user id of the teacher hosting the slot. */
  @Column()
  teacherId!: string;

  @Column({ nullable: true })
  teacherName?: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'time' })
  startTime!: string;

  @Column({ type: 'time' })
  endTime!: string;

  @Column({ nullable: true })
  location?: string;

  @Column({ type: 'text', nullable: true })
  topic?: string;

  /** Max simultaneous bookings; null = unlimited. */
  @Column({ type: 'int', nullable: true })
  maxBookings?: number;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: string; // open | closed | cancelled

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('meeting_bookings')
@Index(['slotId'])
@Index(['parentId'])
export class MeetingBooking {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  slotId!: string;

  @Column()
  parentId!: string;

  /** Optional specific child the meeting concerns. */
  @Column({ nullable: true })
  studentId?: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @Column({ type: 'varchar', length: 16, default: 'confirmed' })
  status!: string; // confirmed | cancelled | completed

  @Column({ type: 'time', nullable: true })
  arrivedAt?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
