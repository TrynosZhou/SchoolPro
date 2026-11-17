import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('alumni')
@Index(['graduationYear'])
export class Alumni {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Link back to the student record when available. */
  @Column({ nullable: true, unique: true })
  studentId?: string;

  @Column()
  firstName!: string;

  @Column()
  lastName!: string;

  @Column({ type: 'int', nullable: true })
  graduationYear?: number;

  @Column({ nullable: true })
  className?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  currentOccupation?: string;

  @Column({ nullable: true })
  location?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('alumni_events')
export class AlumniEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'timestamp', nullable: true })
  date?: Date;

  @Column({ nullable: true })
  venue?: string;

  /** reunion | fundraiser | networking | other */
  @Column({ type: 'varchar', length: 24, default: 'reunion' })
  type!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  fundraisingTarget?: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  amountRaised!: number;

  @Column({ type: 'varchar', length: 16, default: 'upcoming' })
  status!: string; // upcoming | completed | cancelled

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('alumni_donations')
@Index(['alumniId'])
export class AlumniDonation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  alumniId!: string;

  @Column({ nullable: true })
  eventId?: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 24, default: 'cash' })
  method!: string; // cash | bank | ecocash | onemoney | innbucks | other

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ nullable: true })
  recordedById?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
