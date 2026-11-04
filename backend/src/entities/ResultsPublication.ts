import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { FK_RESTRICT } from './constraints';
import { Term } from './Term';
import { ExamType } from './ExamType';
import { User } from './User';

@Entity('results_publications')
@Unique(['termId', 'examTypeId'])
export class ResultsPublication {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Term, FK_RESTRICT)
  @JoinColumn({ name: 'termId' })
  term!: Term;

  @Column()
  termId!: string;

  @ManyToOne(() => ExamType, FK_RESTRICT)
  @JoinColumn({ name: 'examTypeId' })
  examType!: ExamType;

  @Column()
  examTypeId!: string;

  @Column({ type: 'timestamptz' })
  publishedAt!: Date;

  @ManyToOne(() => User, { nullable: true, ...FK_RESTRICT })
  @JoinColumn({ name: 'publishedByUserId' })
  publishedBy?: User;

  @Column({ nullable: true })
  publishedByUserId?: string;

  @Column({ type: 'int', default: 0 })
  reportCardCount!: number;

  @Column({ type: 'int', default: 0 })
  whatsappSent!: number;

  @Column({ type: 'int', default: 0 })
  smsSent!: number;

  @Column({ type: 'int', default: 0 })
  notificationsCreated!: number;
}
