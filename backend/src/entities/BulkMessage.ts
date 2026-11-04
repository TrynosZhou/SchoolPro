import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { FK_SET_NULL } from './constraints';
import { User } from './User';
import { BulkMessageRecipient } from './BulkMessageRecipient';

/**
 * A bulk SMS/email campaign sent to a selected class, grade/form, or custom
 * group of students/parents. Keeps a delivery log via {@link BulkMessageRecipient}.
 */
@Entity('bulk_messages')
export class BulkMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { ...FK_SET_NULL, nullable: true })
  @JoinColumn({ name: 'senderId' })
  sender?: User;

  @Column({ nullable: true })
  senderId?: string;

  @Column()
  subject!: string;

  @Column({ type: 'text' })
  body!: string;

  /** Delivery channels used, e.g. ['email','sms']. */
  @Column({ type: 'jsonb' })
  channels!: string[];

  /** Snapshot of the audience filter used to build the recipient list. */
  @Column({ type: 'jsonb', nullable: true })
  audience?: Record<string, unknown>;

  /** Human-readable summary of the audience, e.g. "Form 1A · Parents". */
  @Column({ nullable: true })
  audienceLabel?: string;

  @Column({ type: 'int', default: 0 })
  totalRecipients!: number;

  @Column({ type: 'int', default: 0 })
  sentCount!: number;

  @Column({ type: 'int', default: 0 })
  failedCount!: number;

  @OneToMany(() => BulkMessageRecipient, (r) => r.bulkMessage)
  recipients!: BulkMessageRecipient[];

  @CreateDateColumn()
  createdAt!: Date;
}
