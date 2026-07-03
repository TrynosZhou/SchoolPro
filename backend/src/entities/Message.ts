import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from './User';
import { Student } from './Student';
import { MessageAttachment } from './MessageAttachment';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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

