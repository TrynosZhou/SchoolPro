import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { SchoolClass } from './SchoolClass';

@Entity('forms')
export class Form {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'int' })
  level!: number;

  @OneToMany(() => SchoolClass, (c) => c.form)
  classes!: SchoolClass[];
}

