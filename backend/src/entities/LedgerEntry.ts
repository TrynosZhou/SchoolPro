import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Student } from './Student';
import { Term } from './Term';

@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Student, (s) => s.ledgerEntries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student!: Student;

  @Column()
  studentId!: string;

  @ManyToOne(() => Term, { nullable: true })
  @JoinColumn({ name: 'termId' })
  term?: Term;

  @Column({ nullable: true })
  termId?: string;

  @Column({ type: 'date' })
  entryDate!: string;

  @Column()
  description!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  debit!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  credit!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  balance!: number;

  @Column({ nullable: true })
  referenceType?: string;

  @Column({ nullable: true })
  referenceId?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

