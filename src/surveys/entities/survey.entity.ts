import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { SurveyVersion } from './survey-version.entity';
import { SurveyStatus } from '../../common/constants/status.constants';

export type WebhookEvent = 'response.started' | 'response.completed';

export interface SurveySettings {
  allowAnonymous: boolean;
  requireAuth: boolean;
  accessTokenRequired: boolean;
  startDate?: string;
  endDate?: string;
  maxResponses?: number;
  /** URL to POST webhook events to */
  webhookUrl?: string;
  /**
   * HMAC-SHA256 secret used to sign webhook payloads.
   * Falls back to the WEBHOOK_SECRET environment variable when not set.
   */
  webhookSecret?: string;
  /**
   * Events to deliver. Defaults to all events when webhookUrl is set.
   * Supported: "response.started", "response.completed"
   */
  webhookEvents?: WebhookEvent[];
}

@Entity('surveys')
@Index(['status'])
@Index(['createdAt'])
export class Survey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** User ID of the creator (optional — set by the caller's gateway) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  createdBy: string | null;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: SurveyStatus,
    default: SurveyStatus.DRAFT,
  })
  status: SurveyStatus;

  @Column('uuid', { nullable: true })
  activeVersionId: string | null;

  @ManyToOne(() => SurveyVersion, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'activeVersionId' })
  activeVersion: SurveyVersion | null;

  @OneToMany(() => SurveyVersion, (version) => version.survey)
  versions: SurveyVersion[];

  /** Draft schema — working copy before publishing */
  @Column('jsonb', { nullable: true })
  draftSchemaJson: Record<string, unknown> | null;

  /** Draft logic rules — working copy before publishing */
  @Column('jsonb', { nullable: true })
  draftLogicJson: Record<string, unknown> | null;

  @Column('jsonb', {
    default: {
      allowAnonymous: true,
      requireAuth: false,
      accessTokenRequired: false,
    },
  })
  settings: SurveySettings;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
