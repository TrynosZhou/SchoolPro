import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { ExamTypeName } from './enums';

@Entity('exam_types')
export class ExamType {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'enum', enum: ExamTypeName })
  code!: ExamTypeName;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 100 })
  maxMarks!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  weight!: number;
}

