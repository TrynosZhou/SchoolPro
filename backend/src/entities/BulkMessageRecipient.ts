import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { FK_CASCADE } from './constraints';
import { BulkMessage } from './BulkMessage';

/** Per-recipient delivery record for a {@link BulkMessage} (the delivery log). */
@Entity('bulk_message_recipients')
export class BulkMessageRecipient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  bulkMessageId!: string;

  @ManyToOne(() => BulkMessage, (m) => m.recipients, { ...FK_CASCADE })
  @JoinColumn({ name: 'bulkMessageId' })
  bulkMessage!: BulkMessage;

  /** The related student (audience context), if any. */
  @Column({ nullable: true })
  studentId?: string;

  /** The recipient's user account, if they have one. */
  @Column({ nullable: true })
  userId?: string;

  @Column()
  recipientName!: string;

  /** 'parent' | 'student' */
  @Column({ type: 'varchar', length: 16, default: 'parent' })
  recipientType!: string;

  /** 'email' | 'sms' */
  @Column({ type: 'varchar', length: 16 })
  channel!: string;

  /** Destination address (email or phone) actually used. */
  @Column({ nullable: true })
  destination?: string;

  /** 'sent' | 'failed' | 'skipped' | 'mock' */
  @Column({ type: 'varchar', length: 16 })
  status!: string;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
