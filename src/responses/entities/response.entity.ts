import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Survey } from '../../surveys/entities/survey.entity';
import { SurveyVersion } from '../../surveys/entities/survey-version.entity';
import { ResponseStatus } from '../../common/constants/status.constants';

@Entity('responses')
@Index(['surveyId', 'status'])
@Index(['surveyVersionId'])
export class Response {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  surveyId: string;

  @ManyToOne(() => Survey, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'surveyId' })
  survey: Survey;

  @Column('uuid')
  surveyVersionId: string;

  @ManyToOne(() => SurveyVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'surveyVersionId' })
  surveyVersion: SurveyVersion;

  /** Respondent user ID (optional — null for anonymous responses) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  respondentId: string | null;

  /** Collected answers as a question-id → answer map */
  @Column('jsonb', { default: {} })
  answersJson: Record<string, unknown>;

  /** Optional metadata from the caller (browser, IP hash, etc.) */
  @Column('jsonb', { default: {} })
  metadata: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: ResponseStatus,
    default: ResponseStatus.STARTED,
  })
  status: ResponseStatus;

  @CreateDateColumn()
  startedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;
}
