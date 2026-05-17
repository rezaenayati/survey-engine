import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import {
    WebhookService,
    WebhookPayload,
} from '../../../src/webhooks/webhook.service';
import {
    WebhookDelivery,
    WebhookDeliveryStatus,
} from '../../../src/webhooks/entities/webhook-delivery.entity';
import type { SurveySettings } from '../../../src/surveys/entities/survey.entity';

const samplePayload: WebhookPayload = {
    event: 'response.completed',
    timestamp: '2026-01-01T00:00:00.000Z',
    surveyId: 'survey-1',
    responseId: 'response-1',
    respondentId: 'user-1',
    answersJson: { q1: 'answer' },
};

/** Minimal in-memory stand-in for an EntityManager. */
function makeManager() {
    const created: Partial<WebhookDelivery>[] = [];
    const saved: Partial<WebhookDelivery>[] = [];
    return {
        created,
        saved,
        manager: {
            create: jest.fn((_entity, data) => {
                created.push(data);
                return data;
            }),
            save: jest.fn(async (_entity, data) => {
                saved.push(data);
                return data;
            }),
        } as unknown as EntityManager,
    };
}

function buildModule(webhookSecret?: string): Promise<TestingModule> {
    return Test.createTestingModule({
        providers: [
            WebhookService,
            {
                provide: ConfigService,
                useValue: { get: (_: string) => webhookSecret },
            },
        ],
    }).compile();
}

describe('WebhookService.enqueue', () => {
    let service: WebhookService;

    beforeEach(async () => {
        const module = await buildModule();
        service = module.get(WebhookService);
    });

    it('does nothing when webhookUrl is not set', async () => {
        const m = makeManager();
        await service.enqueue(m.manager, {} as SurveySettings, samplePayload);
        expect(m.saved).toHaveLength(0);
    });

    it('does nothing when the event is not in the allow-list', async () => {
        const m = makeManager();
        const settings: SurveySettings = {
            allowAnonymous: true,
            requireAuth: false,
            accessTokenRequired: false,
            webhookUrl: 'https://example.com/hook',
            webhookEvents: ['response.started'],
        };
        await service.enqueue(m.manager, settings, samplePayload);
        expect(m.saved).toHaveLength(0);
    });

    it('inserts a PENDING row with payload, url, and secret', async () => {
        const m = makeManager();
        const settings: SurveySettings = {
            allowAnonymous: true,
            requireAuth: false,
            accessTokenRequired: false,
            webhookUrl: 'https://example.com/hook',
            webhookSecret: 'per-survey-secret',
        };
        await service.enqueue(m.manager, settings, samplePayload);
        expect(m.saved).toHaveLength(1);
        expect(m.saved[0]).toMatchObject({
            event: 'response.completed',
            surveyId: 'survey-1',
            responseId: 'response-1',
            url: 'https://example.com/hook',
            secret: 'per-survey-secret',
            payload: samplePayload,
            status: WebhookDeliveryStatus.PENDING,
            attempts: 0,
        });
        expect(m.saved[0].nextAttemptAt).toBeInstanceOf(Date);
    });

    it('falls back to global WEBHOOK_SECRET when no per-survey secret is set', async () => {
        const module = await buildModule('global-secret');
        const svcWithGlobal = module.get<WebhookService>(WebhookService);
        const m = makeManager();
        const settings: SurveySettings = {
            allowAnonymous: true,
            requireAuth: false,
            accessTokenRequired: false,
            webhookUrl: 'https://example.com/hook',
        };
        await svcWithGlobal.enqueue(m.manager, settings, samplePayload);
        expect(m.saved[0].secret).toBe('global-secret');
    });

    it('stores secret=null when neither per-survey nor global is set', async () => {
        const m = makeManager();
        const settings: SurveySettings = {
            allowAnonymous: true,
            requireAuth: false,
            accessTokenRequired: false,
            webhookUrl: 'https://example.com/hook',
        };
        await service.enqueue(m.manager, settings, samplePayload);
        expect(m.saved[0].secret).toBeNull();
    });

    it('defaults the event allow-list to all events when not provided', async () => {
        const m = makeManager();
        const settings: SurveySettings = {
            allowAnonymous: true,
            requireAuth: false,
            accessTokenRequired: false,
            webhookUrl: 'https://example.com/hook',
        };
        await service.enqueue(m.manager, settings, {
            ...samplePayload,
            event: 'response.started',
        });
        expect(m.saved).toHaveLength(1);
    });
});
