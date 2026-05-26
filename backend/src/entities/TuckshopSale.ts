import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Student } from './Student';
import { TuckshopItem } from './TuckshopItem';

@Entity('tuckshop_sales')
export class TuckshopSale {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Student, { nullable: true })
  @JoinColumn({ name: 'studentId' })
  student?: Student;

  @Column({ nullable: true })
  studentId?: string;

  @ManyToOne(() => TuckshopItem)
  @JoinColumn({ name: 'itemId' })
  item!: TuckshopItem;

  @Column()
  itemId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount!: number;

  @CreateDateColumn()
  soldAt!: Date;
}

