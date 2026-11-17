import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('student_id_cards')
export class StudentIdCard {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  studentId!: string;

  /** Random verification code embedded in the QR payload. */
  @Column({ unique: true })
  code!: string;

  @Column({ type: 'int', default: 0 })
  printCount!: number;

  @Column({ type: 'timestamp', nullable: true })
  lastPrintedAt?: Date;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/** Scan-based arrival/departure records (QR ID card scans). */
@Entity('attendance_scans')
@Index(['studentId', 'date'])
export class AttendanceScan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  studentId!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'time' })
  time!: string;

  /** arrival | departure */
  @Column({ type: 'varchar', length: 16 })
  direction!: string;

  @Column({ type: 'varchar', length: 16, default: 'qr' })
  method!: string;

  @Column({ nullable: true })
  scannedById?: string;

  @Column({ nullable: true })
  deviceLabel?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
