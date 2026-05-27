import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SchoolClass } from './SchoolClass';
import { FK_CASCADE, FK_RESTRICT } from './constraints';

@Entity('class_promotion_rules')
export class ClassPromotionRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => SchoolClass, { ...FK_CASCADE })
  @JoinColumn({ name: 'fromClassId' })
  fromClass!: SchoolClass;

  @Column({ unique: true })
  fromClassId!: string;

  /** Null when completionLabel is set (student exits the school ladder). */
  @ManyToOne(() => SchoolClass, FK_RESTRICT)
  @JoinColumn({ name: 'toClassId' })
  toClass?: SchoolClass;

  @Column({ nullable: true })
  toClassId?: string;

  /**
   * Used instead of toClassId when the student completes a level rather than
   * moving to another class. E.g. "Ordinary Level Completed".
   */
  @Column({ nullable: true, length: 128 })
  completionLabel?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
