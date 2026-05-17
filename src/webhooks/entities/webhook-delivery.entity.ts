import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import type { WebhookEvent } from '../../surveys/entities/survey.entity';
import type { WebhookPayload } from '../webhook.service';

export enum WebhookDeliveryStatus {
    PENDING = 'pending',
    DELIVERED = 'delivered',
    FAILED = 'failed',
}

/**
 * Durable outbox row for an outbound webhook. Written inside the same
 * transaction that mutates response state, then drained asynchronously by
 * `WebhookDispatcherService`. The combination guarantees at-least-once
 * delivery — a crash between response save and webhook POST leaves a
 * PENDING row that the worker picks up on its next cycle.
 */
@Entity('webhook_deliveries')
// Worker poll lives on this index: status='pending' AND nextAttemptAt <= NOW().
@Index(['status', 'nextAttemptAt'])
@Index(['surveyId'])
@Index(['responseId'])
export class WebhookDelivery {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 64 })
    event: WebhookEvent;

    @Column('uuid')
    surveyId: string;

    @Column('uuid')
    responseId: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    respondentId: string | null;

    @Column({ type: 'varchar', length: 2048 })
    url: string;

    /** HMAC secret captured at enqueue time; null = unsigned delivery. */
    @Column({ type: 'varchar', length: 512, nullable: true })
    secret: string | null;

    /** Full payload sent to the webhook receiver. Stable across retries. */
    @Column('jsonb')
    payload: WebhookPayload;

    @Column({
        type: 'enum',
        enum: WebhookDeliveryStatus,
        default: WebhookDeliveryStatus.PENDING,
    })
    status: WebhookDeliveryStatus;

    @Column({ type: 'int', default: 0 })
    attempts: number;

    /** Earliest time the worker should retry. Updated on failure. */
    @Column({ type: 'timestamptz' })
    nextAttemptAt: Date;

    @Column({ type: 'timestamptz', nullable: true })
    lastAttemptAt: Date | null;

    /** HTTP status of the last attempt (null for network errors). */
    @Column({ type: 'int', nullable: true })
    lastResponseStatus: number | null;

    /** Last failure reason (truncated to 1024 chars). */
    @Column({ type: 'varchar', length: 1024, nullable: true })
    lastError: string | null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;
}
