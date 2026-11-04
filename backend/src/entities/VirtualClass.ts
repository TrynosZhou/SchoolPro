import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { FK_CASCADE, FK_RESTRICT } from './constraints';
import { SchoolClass } from './SchoolClass';
import { Subject } from './Subject';
import { Staff } from './Staff';
import { VirtualClassProvider, VirtualClassStatus } from './enums';
import { ClassRecording } from './ClassRecording';

@Entity('virtual_classes')
@Index(['classId', 'startsAt'])
export class VirtualClass {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => SchoolClass, FK_CASCADE)
  @JoinColumn({ name: 'classId' })
  schoolClass!: SchoolClass;

  @Column()
  classId!: string;

  @ManyToOne(() => Subject, { nullable: true, ...FK_RESTRICT })
  @JoinColumn({ name: 'subjectId' })
  subject?: Subject;

  @Column({ nullable: true })
  subjectId?: string;

  @ManyToOne(() => Staff, FK_RESTRICT)
  @JoinColumn({ name: 'teacherId' })
  teacher!: Staff;

  @Column()
  teacherId!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'timestamptz' })
  startsAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endsAt?: Date;

  @Column({ type: 'enum', enum: VirtualClassProvider, default: VirtualClassProvider.MANUAL })
  provider!: VirtualClassProvider;

  @Column({ type: 'enum', enum: VirtualClassStatus, default: VirtualClassStatus.SCHEDULED })
  status!: VirtualClassStatus;

  /** Student/teacher join URL (manual paste or Zoom/Meet API). */
  @Column({ type: 'text', nullable: true })
  joinUrl?: string;

  @Column({ type: 'text', nullable: true })
  hostUrl?: string;

  /** Provider meeting id (Zoom meeting id, Google event id, etc.). */
  @Column({ nullable: true })
  externalMeetingId?: string;

  @Column({ type: 'jsonb', nullable: true })
  providerMeta?: Record<string, unknown>;

  @OneToMany(() => ClassRecording, (r) => r.virtualClass)
  recordings?: ClassRecording[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
