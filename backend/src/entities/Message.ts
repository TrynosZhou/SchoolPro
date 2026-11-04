import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from './User';
import { Student } from './Student';
import { MessageAttachment } from './MessageAttachment';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Stable conversation key for the parent↔teacher (or any two-user) pair,
   * derived from the two sorted user ids. Groups a threaded conversation view.
   */
  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  threadId?: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'senderId' })
  sender!: User;

  @Column()
  senderId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'recipientId' })
  recipient!: User;

  @Column()
  recipientId!: string;

  @ManyToOne(() => Student, { nullable: true })
  @JoinColumn({ name: 'studentId' })
  student?: Student;

  @Column({ nullable: true })
  studentId?: string;

  @Column()
  subject!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ default: false })
  isRead!: boolean;

  @OneToMany(() => MessageAttachment, (attachment) => attachment.message)
  attachments!: MessageAttachment[];

  @CreateDateColumn()
  sentAt!: Date;
}

