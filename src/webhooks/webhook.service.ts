import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import {
    WebhookDelivery,
    WebhookDeliveryStatus,
} from './entities/webhook-delivery.entity';
import type {
    SurveySettings,
    WebhookEvent,
} from '../surveys/entities/survey.entity';

export interface WebhookPayload {
    /** Event type */
    event: WebhookEvent;
    /** ISO-8601 timestamp */
    timestamp: string;
    surveyId: string;
    responseId: string;
    respondentId: string | null;
    /** Full answer state at the time of the event */
    answersJson: Record<string, unknown>;
}

const DEFAULT_EVENTS: WebhookEvent[] = [
    'response.started',
    'response.completed',
];

/**
 * Caller-facing webhook API. Writes a `WebhookDelivery` row inside the
 * caller's transaction so the outbound event is committed atomically with
 * the response state change it represents. Actual HTTP delivery is performed
 * later by `WebhookDispatcherService`.
 */
@Injectable()
export class WebhookService {
    private readonly globalSecret: string | undefined;

    constructor(private readonly config: ConfigService) {
        this.globalSecret = this.config.get<string>('WEBHOOK_SECRET');
    }

    /**
     * Enqueue a webhook delivery. Must be called inside an active transaction —
     * pass the same `EntityManager` you used to persist the response so the
     * outbox row and the response state change commit together (or not at all).
     *
     * No-ops when the survey has no `webhookUrl` configured, or when the event
     * isn't in the configured event allow-list.
     */
    async enqueue(
        manager: EntityManager,
        settings: SurveySettings,
        payload: WebhookPayload,
    ): Promise<void> {
        const url = settings.webhookUrl;
        if (!url) return;

        const allowedEvents = settings.webhookEvents ?? DEFAULT_EVENTS;
        if (!allowedEvents.includes(payload.event)) return;

        const delivery = manager.create(WebhookDelivery, {
            event: payload.event,
            surveyId: payload.surveyId,
            responseId: payload.responseId,
            respondentId: payload.respondentId,
            url,
            secret: settings.webhookSecret ?? this.globalSecret ?? null,
            payload,
            status: WebhookDeliveryStatus.PENDING,
            attempts: 0,
            // Earliest poll cycle picks it up.
            nextAttemptAt: new Date(),
        });

        await manager.save(WebhookDelivery, delivery);
    }
}
