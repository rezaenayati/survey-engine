import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import {
    WebhookService,
    WebhookPayload,
} from '../../../src/webhooks/webhook.service';
import type { SurveySettings } from '../../../src/surveys/entities/survey.entity';

const samplePayload: WebhookPayload = {
    event: 'response.completed',
    timestamp: '2026-01-01T00:00:00.000Z',
    surveyId: 'survey-1',
    responseId: 'response-1',
    respondentId: 'user-1',
    answersJson: { q1: 'answer' },
};

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

describe('WebhookService', () => {
    let service: WebhookService;
    let fetchMock: jest.Mock;

    beforeEach(async () => {
        fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
        global.fetch = fetchMock as unknown as typeof fetch;

        const module = await buildModule();
        service = module.get<WebhookService>(WebhookService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('fire()', () => {
        it('does nothing when webhookUrl is not set', async () => {
            const settings: Partial<SurveySettings> = {};
            service.fire(settings as SurveySettings, samplePayload);
            await new Promise((r) => setTimeout(r, 10));
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('fires a POST request to the configured URL', async () => {
            const settings: Partial<SurveySettings> = {
                webhookUrl: 'https://example.com/hook',
            };
            service.fire(settings as SurveySettings, samplePayload);
            await new Promise((r) => setTimeout(r, 10));

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, options] = fetchMock.mock.calls[0] as [
                string,
                RequestInit,
            ];
            expect(url).toBe('https://example.com/hook');
            expect(options.method).toBe('POST');
            expect(JSON.parse(options.body as string)).toMatchObject({
                event: 'response.completed',
            });
        });

        it('sets X-Survey-Engine-Event and X-Survey-Engine-Delivery headers', async () => {
            const settings: Partial<SurveySettings> = {
                webhookUrl: 'https://example.com/hook',
            };
            service.fire(settings as SurveySettings, samplePayload);
            await new Promise((r) => setTimeout(r, 10));

            const [, options] = fetchMock.mock.calls[0] as [
                string,
                RequestInit,
            ];
            const headers = options.headers as Record<string, string>;
            expect(headers['X-Survey-Engine-Event']).toBe('response.completed');
            expect(headers['X-Survey-Engine-Delivery']).toBe('response-1');
        });

        it('signs payload with per-survey secret', async () => {
            const secret = 'per-survey-secret';
            const settings: Partial<SurveySettings> = {
                webhookUrl: 'https://example.com/hook',
                webhookSecret: secret,
            };
            service.fire(settings as SurveySettings, samplePayload);
            await new Promise((r) => setTimeout(r, 10));

            const [, options] = fetchMock.mock.calls[0] as [
                string,
                RequestInit,
            ];
            const body = options.body as string;
            const headers = options.headers as Record<string, string>;
            const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
            expect(headers['X-Survey-Engine-Signature']).toBe(expected);
        });

        it('skips events not in webhookEvents filter', async () => {
            const settings: Partial<SurveySettings> = {
                webhookUrl: 'https://example.com/hook',
                webhookEvents: ['response.started'], // only started, not completed
            };
            service.fire(settings as SurveySettings, samplePayload); // samplePayload is response.completed
            await new Promise((r) => setTimeout(r, 10));
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('delivers response.started event when included in webhookEvents', async () => {
            const settings: Partial<SurveySettings> = {
                webhookUrl: 'https://example.com/hook',
                webhookEvents: ['response.started'],
            };
            service.fire(settings as SurveySettings, {
                ...samplePayload,
                event: 'response.started',
            });
            await new Promise((r) => setTimeout(r, 10));
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('sends no signature header when no secret is configured', async () => {
            const settings: Partial<SurveySettings> = {
                webhookUrl: 'https://example.com/hook',
            };
            service.fire(settings as SurveySettings, samplePayload);
            await new Promise((r) => setTimeout(r, 10));

            const [, options] = fetchMock.mock.calls[0] as [
                string,
                RequestInit,
            ];
            const headers = options.headers as Record<string, string>;
            expect(headers['X-Survey-Engine-Signature']).toBeUndefined();
        });
    });

    describe('retry logic', () => {
        it('retries on non-OK responses and ultimately gives up', async () => {
            fetchMock.mockResolvedValue({ ok: false, status: 500 });
            jest.useFakeTimers();

            const settings: Partial<SurveySettings> = {
                webhookUrl: 'https://example.com/hook',
            };
            service.fire(settings as SurveySettings, samplePayload);

            // Let delivery start and hit first failure
            await Promise.resolve();
            jest.runAllTimersAsync().catch(() => undefined);

            // Restore real timers to flush all pending promises
            jest.useRealTimers();
            await new Promise((r) => setTimeout(r, 8000));

            expect(fetchMock.mock.calls.length).toBe(3); // MAX_RETRIES
        }, 15000);
    });
});
