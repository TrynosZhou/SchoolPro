import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('student_health_profiles')
export class StudentHealthProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  studentId!: string;

  @Column({ type: 'varchar', length: 8, nullable: true })
  bloodGroup?: string;

  /** Free-text / comma-separated allergy list. */
  @Column({ type: 'text', nullable: true })
  allergies?: string;

  @Column({ type: 'text', nullable: true })
  chronicConditions?: string;

  @Column({ type: 'text', nullable: true })
  currentMedications?: string;

  @Column({ nullable: true })
  doctorName?: string;

  @Column({ nullable: true })
  doctorPhone?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('student_immunisations')
@Index(['studentId'])
export class StudentImmunisation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  studentId!: string;

  @Column()
  vaccine!: string;

  @Column({ type: 'date' })
  dateGiven!: string;

  @Column({ nullable: true })
  batchNumber?: string;

  @Column({ type: 'date', nullable: true })
  nextDueDate?: string;

  @Column({ nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('sickbay_visits')
@Index(['studentId', 'date'])
export class SickbayVisit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  studentId!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'time', nullable: true })
  time?: string;

  @Column({ type: 'text', nullable: true })
  symptoms?: string;

  @Column({ type: 'text', nullable: true })
  diagnosis?: string;

  @Column({ type: 'text', nullable: true })
  treatment?: string;

  @Column({ type: 'text', nullable: true })
  medicationGiven?: string;

  @Column({ default: false })
  sentHome!: boolean;

  @Column({ default: false })
  parentNotified!: boolean;

  @Column({ nullable: true })
  recordedById?: string;

  @Column({ nullable: true })
  recordedByName?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('student_emergency_contacts')
@Index(['studentId'])
export class StudentEmergencyContact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  studentId!: string;

  @Column()
  name!: string;

  @Column()
  relationship!: string;

  @Column()
  phone!: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ type: 'int', default: 1 })
  priority!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
