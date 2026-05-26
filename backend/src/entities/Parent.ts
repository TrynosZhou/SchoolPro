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

  @Column({ nullable: true })
  address?: string;

  @Column({ default: true })
  receivesWhatsApp!: boolean;

  @OneToMany(() => Guardian, (g) => g.parent)
  guardianships!: Guardian[];
}

