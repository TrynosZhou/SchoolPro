import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User';

/** A single browser/PWA push endpoint subscribed by a user. */
@Entity('push_subscriptions')
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column()
  userId!: string;

  /** The push service endpoint URL supplied by the browser. */
  @Column({ type: 'text', unique: true })
  endpoint!: string;

  /** Client public key (base64url) used to encrypt the payload. */
  @Column()
  p256dh!: string;

  /** Client auth secret (base64url) used to encrypt the payload. */
  @Column()
  auth!: string;

  /** Optional user-agent string, handy for troubleshooting stale devices. */
  @Column({ nullable: true })
  userAgent?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
