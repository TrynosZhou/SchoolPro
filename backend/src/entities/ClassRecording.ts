import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { FK_CASCADE } from './constraints';
import { VirtualClass } from './VirtualClass';

@Entity('class_recordings')
@Index(['virtualClassId', 'recordedAt'])
export class ClassRecording {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => VirtualClass, (v) => v.recordings, FK_CASCADE)
  @JoinColumn({ name: 'virtualClassId' })
  virtualClass!: VirtualClass;

  @Column()
  virtualClassId!: string;

  @Column()
  title!: string;

  /** Playback URL from Zoom/Meet or manually uploaded recording. */
  @Column({ type: 'text' })
  recordingUrl!: string;

  @Column({ nullable: true })
  fileKey?: string;

  @Column({ type: 'int', nullable: true })
  durationSeconds?: number;

  @Column({ type: 'timestamptz', nullable: true })
  recordedAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  providerMeta?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
