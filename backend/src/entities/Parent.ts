import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from './User';
import { Guardian } from './Guardian';

@Entity('parents')
export class Parent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: string;

  @Column({ nullable: true })
  occupation?: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  gender?: string | null;

  /** 'single' | 'married' – drives the Miss / Mrs / Ms greeting. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  maritalStatus?: string | null;

  /** A married woman who still uses her maiden name is addressed as Ms. */
  @Column({ type: 'boolean', default: false })
  usesMaidenName!: boolean;

  @Column({ nullable: true })
  address?: string;

  @Column({ default: true })
  receivesWhatsApp!: boolean;

  @OneToMany(() => Guardian, (g) => g.parent)
  guardianships!: Guardian[];
}

