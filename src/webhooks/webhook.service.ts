import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
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
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 10_000;

@Injectable()
export class WebhookService {
    private readonly logger = new Logger(WebhookService.name);
    private readonly globalSecret: string | undefined;

    constructor(private readonly config: ConfigService) {
        this.globalSecret = this.config.get<string>('WEBHOOK_SECRET');
    }

    /**
     * Fire a webhook for a survey event.
     * Runs entirely in the background — the calling request is never blocked
     * or failed by webhook delivery issues.
     */
    fire(settings: SurveySettings, payload: WebhookPayload): void {
        const url = settings.webhookUrl;
        if (!url) return;

        const allowedEvents = settings.webhookEvents ?? DEFAULT_EVENTS;
        if (!allowedEvents.includes(payload.event)) return;

        const secret = settings.webhookSecret ?? this.globalSecret;

        // Intentionally not awaited — delivery is best-effort
        void this.deliver(url, payload, secret);
    }

    private async deliver(
        url: string,
        payload: WebhookPayload,
        secret: string | undefined,
    ): Promise<void> {
        const body = JSON.stringify(payload);
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'survey-engine-webhooks/1.0',
            'X-Survey-Engine-Event': payload.event,
            'X-Survey-Engine-Delivery': payload.responseId,
        };

        if (secret) {
            headers['X-Survey-Engine-Signature'] =
                `sha256=${this.sign(body, secret)}`;
        }

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(
                    () => controller.abort(),
                    FETCH_TIMEOUT_MS,
                );
                let res: globalThis.Response;
                try {
                    res = await fetch(url, {
                        method: 'POST',
                        headers,
                        body,
                        signal: controller.signal,
                    });
                } finally {
                    clearTimeout(timer);
                }

                if (res.ok) {
                    this.logger.log(
                        `Webhook delivered: event=${payload.event} surveyId=${payload.surveyId} responseId=${payload.responseId} status=${res.status}`,
                    );
                    return;
                }

                this.logger.warn(
                    `Webhook attempt ${attempt}/${MAX_RETRIES} failed: event=${payload.event} url=${url} status=${res.status}`,
                );
            } catch (err) {
                this.logger.warn(
                    `Webhook attempt ${attempt}/${MAX_RETRIES} error: event=${payload.event} url=${url} error=${String(err)}`,
                );
            }

            if (attempt < MAX_RETRIES) {
                await this.sleep(BASE_DELAY_MS * 2 ** (attempt - 1)); // 1s, 2s, 4s
            }
        }

        this.logger.error(
            `Webhook permanently failed after ${MAX_RETRIES} attempts: event=${payload.event} surveyId=${payload.surveyId} responseId=${payload.responseId} url=${url}`,
        );
    }

    private sign(body: string, secret: string): string {
        return createHmac('sha256', secret).update(body).digest('hex');
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
