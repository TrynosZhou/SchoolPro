import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('surveys')
@Index(['status'])
export class Survey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  /** parent | staff | student | all */
  @Column({ type: 'varchar', length: 16, default: 'all' })
  audience!: string;

  /** draft | published | closed */
  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: string;

  @Column({ type: 'date', nullable: true })
  closesAt?: string;

  @Column({ nullable: true })
  createdById?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('survey_questions')
@Index(['surveyId', 'order'])
export class SurveyQuestion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  surveyId!: string;

  @Column({ type: 'int', default: 0 })
  order!: number;

  @Column({ type: 'text' })
  text!: string;

  /** rating | text | single_choice | multi_choice */
  @Column({ type: 'varchar', length: 24, default: 'rating' })
  type!: string;

  /** JSON array of options for choice types; rating uses min/max. */
  @Column({ type: 'jsonb', nullable: true })
  options?: unknown;

  @Column({ type: 'int', default: 1 })
  minRating!: number;

  @Column({ type: 'int', default: 5 })
  maxRating!: number;

  @Column({ default: true })
  required!: boolean;
}

@Entity('survey_responses')
@Index(['surveyId', 'userId'], { unique: true })
export class SurveyResponse {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  surveyId!: string;

  @Column()
  userId!: string;

  /** [{ questionId, answer }] */
  @Column({ type: 'jsonb' })
  answers!: Array<Record<string, unknown>>;

  @CreateDateColumn()
  createdAt!: Date;
}
