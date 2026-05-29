import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { UserRole } from './enums';
import { User } from './User';

@Entity('school_roles')
export class SchoolRole {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: UserRole })
  baseRole!: UserRole;

  @Column('simple-array', { default: '' })
  permissions!: string[];

  @Column({ default: false })
  isSystem!: boolean;

  @OneToMany(() => User, (user) => user.schoolRole)
  users!: User[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
