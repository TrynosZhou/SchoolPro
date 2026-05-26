import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Term } from './Term';

@Entity('school_years')
export class SchoolYear {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date' })
  endDate!: string;

  @Column({ default: false })
  isCurrent!: boolean;

  @OneToMany(() => Term, (t) => t.schoolYear)
  terms!: Term[];

  @CreateDateColumn()
  createdAt!: Date;
}

