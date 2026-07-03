import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Form } from './Form';
import { SchoolClass } from './SchoolClass';
import { FK_RESTRICT } from './constraints';

@Entity('sections')
export class Section {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  code?: string;

  @ManyToOne(() => Form, FK_RESTRICT)
  @JoinColumn({ name: 'formId' })
  form!: Form;

  @Column()
  formId!: string;

  @Column({ default: true })
  isActive!: boolean;

  @OneToMany(() => SchoolClass, (c) => c.section)
  classes!: SchoolClass[];
}
