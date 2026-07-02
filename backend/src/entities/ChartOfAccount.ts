import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { FK_SET_NULL } from './constraints';
import { GlAccountType } from './enums';

@Entity('chart_of_accounts')
@Index('idx_chart_of_accounts_type', ['accountType'])
export class ChartOfAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, length: 32 })
  accountCode!: string;

  @Column({ length: 128 })
  accountName!: string;

  @Column({ type: 'enum', enum: GlAccountType })
  accountType!: GlAccountType;

  @Column({ type: 'uuid', nullable: true })
  parentAccountId?: string;

  @ManyToOne(() => ChartOfAccount, (a) => a.subAccounts, { nullable: true, ...FK_SET_NULL })
  @JoinColumn({ name: 'parentAccountId' })
  parentAccount?: ChartOfAccount;

  @OneToMany(() => ChartOfAccount, (a) => a.parentAccount)
  subAccounts!: ChartOfAccount[];

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
