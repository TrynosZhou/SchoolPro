import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { SchoolYear } from './SchoolYear';

@Entity('terms')
export class Term {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'int' })
  termNumber!: number;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date' })
  endDate!: string;

  @Column({ default: false })
  isCurrent!: boolean;

  @ManyToOne(() => SchoolYear, (y) => y.terms, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolYearId' })
  schoolYear!: SchoolYear;

  @Column()
  schoolYearId!: string;

  @CreateDateColumn()
  createdAt!: Date;
}

