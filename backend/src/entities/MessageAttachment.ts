import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Message } from './Message';

@Entity('message_attachments')
export class MessageAttachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  messageId!: string;

  @ManyToOne(() => Message, (message) => message.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message!: Message;

  @Column()
  originalName!: string;

  @Column()
  storedName!: string;

  @Column()
  mimeType!: string;

  @Column({ type: 'int' })
  sizeBytes!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
