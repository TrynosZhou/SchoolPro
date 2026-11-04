import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('school_fees')
export class SchoolFee {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Stable key used on invoices and payments (e.g. tuition, bus_levy). */
  @Column({ unique: true, length: 64 })
  code!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  defaultAmount!: number;

  @Column({ nullable: true, length: 16 })
  icon?: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
