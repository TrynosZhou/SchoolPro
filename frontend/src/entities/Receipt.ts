import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Payment } from './Payment';

@Entity('receipts')
export class Receipt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  receiptNumber!: string;

  @OneToOne(() => Payment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paymentId' })
  payment!: Payment;

  @Column()
  paymentId!: string;

  @Column({ nullable: true })
  pdfPath?: string;

  @Column({ default: false })
  emailedToParent!: boolean;

  @CreateDateColumn()
  issuedAt!: Date;
}

