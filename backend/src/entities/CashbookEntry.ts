import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { CashbookEntryType, PaymentMethod } from './enums';
import { User } from './User';

@Entity('cashbook_entries')
export class CashbookEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'date' })
  entryDate!: string;

  @Column({ type: 'enum', enum: CashbookEntryType })
  type!: CashbookEntryType;

  @Column()
  description!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  moneyIn!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  moneyOut!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  balance!: number;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod?: PaymentMethod;

  @Column({ nullable: true })
  reference?: string;

  @Column({ nullable: true })
  studentId?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'recordedById' })
  recordedBy?: User;

  @Column({ nullable: true })
  recordedById?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

