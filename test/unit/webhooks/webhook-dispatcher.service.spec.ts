import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
    WebhookDelivery,
    WebhookDeliveryStatus,
} from '../../../src/webhooks/entities/webhook-delivery.entity';
import { WebhookDispatcherService } from '../../../src/webhooks/webhook-dispatcher.service';
import type { WebhookPayload } from '../../../src/webhooks/webhook.service';

interface UpdateCall {
    id: string;
    patch: Partial<WebhookDelivery>;
}

const samplePayload: WebhookPayload = {
    event: 'response.completed',
    timestamp: '2026-01-01T00:00:00.000Z',
    surveyId: 'survey-1',
    responseId: 'response-1',
    respondentId: 'user-1',
    answersJson: { q1: 'answer' },
};

function makeRow(overrides: Partial<WebhookDelivery> = {}): WebhookDelivery {
    return {
        id: 'd1',
        event: 'response.completed',
        surveyId: 'survey-1',
        responseId: 'response-1',
        respondentId: 'user-1',
        url: 'https://example.com/hook',
        secret: null,
        payload: samplePayload,
        status: WebhookDeliveryStatus.PENDING,
        attempts: 0,
        nextAttemptAt: new Date(),
        lastAttemptAt: null,
        lastResponseStatus: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    } as WebhookDelivery;
}

function buildDispatcher(opts: {
    row?: WebhookDelivery;
    maxAttempts?: number;
}) {
    const updates: UpdateCall[] = [];
    const dataSource = {
        manager: {
            findOne: jest.fn().mockResolvedValue(opts.row ?? null),
            update: jest.fn(
                (_entity, id: string, patch: Partial<WebhookDelivery>) => {
                    updates.push({ id, patch });
                    return Promise.resolve({ affected: 1 });
                },
            ),
        },
        transaction: jest.fn(),
    };

    const config = {
        get: (key: string, fallback?: unknown) => {
            if (key === 'WEBHOOK_MAX_ATTEMPTS') return opts.maxAttempts ?? 3;
            if (key === 'WEBHOOK_BATCH_SIZE') return 10;
            if (key === 'WEBHOOK_FETCH_TIMEOUT_MS') return 100;
            if (key === 'WEBHOOK_POLL_INTERVAL_MS') return 1000;
            return fallback;
        },
    } as unknown as ConfigService;

    const scheduler = new SchedulerRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dispatcher = new WebhookDispatcherService(
        dataSource as never,
        scheduler,
        config,
    );

    return { dispatcher, updates, dataSource };
}

describe('WebhookDispatcherService.processRow', () => {
    let fetchMock: jest.Mock;

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('marks the row DELIVERED on a 2xx response', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200 });
        const { dispatcher, updates } = buildDispatcher({ row: makeRow() });

        // processRow is private — exercise it via the typed accessor.
        await (
            dispatcher as unknown as {
                processRow: (id: string) => Promise<void>;
            }
        ).processRow('d1');

        expect(updates).toHaveLength(1);
        expect(updates[0].patch).toMatchObject({
            status: WebhookDeliveryStatus.DELIVERED,
            attempts: 1,
            lastResponseStatus: 200,
            lastError: null,
        });
    });

    it('reschedules with backoff when the receiver returns 5xx and attempts remain', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 500 });
        const { dispatcher, updates } = buildDispatcher({
            row: makeRow({ attempts: 0 }),
            maxAttempts: 3,
        });

        const before = Date.now();
        await (
            dispatcher as unknown as {
                processRow: (id: string) => Promise<void>;
            }
        ).processRow('d1');
        const after = Date.now();

        expect(updates).toHaveLength(1);
        expect(updates[0].patch.status).toBeUndefined();
        expect(updates[0].patch.attempts).toBe(1);
        expect(updates[0].patch.lastResponseStatus).toBe(500);
        expect(updates[0].patch.lastError).toBe('HTTP 500');
        // attempt 1 → backoff 1000ms; nextAttemptAt should be ≈ now + 1s
        const next = updates[0].patch.nextAttemptAt as Date;
        expect(next.getTime() - before).toBeGreaterThanOrEqual(1000);
        expect(next.getTime() - after).toBeLessThanOrEqual(1500);
    });

    it('marks the row FAILED when attempts hit the cap', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 500 });
        const { dispatcher, updates } = buildDispatcher({
            row: makeRow({ attempts: 2 }), // next attempt will be #3
            maxAttempts: 3,
        });

        await (
            dispatcher as unknown as {
                processRow: (id: string) => Promise<void>;
            }
        ).processRow('d1');

        expect(updates).toHaveLength(1);
        expect(updates[0].patch).toMatchObject({
            status: WebhookDeliveryStatus.FAILED,
            attempts: 3,
            lastResponseStatus: 500,
            lastError: 'HTTP 500',
        });
    });

    it('captures network errors with no HTTP status', async () => {
        fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
        const { dispatcher, updates } = buildDispatcher({
            row: makeRow({ attempts: 0 }),
            maxAttempts: 3,
        });

        await (
            dispatcher as unknown as {
                processRow: (id: string) => Promise<void>;
            }
        ).processRow('d1');

        expect(updates[0].patch.lastResponseStatus).toBeNull();
        expect(updates[0].patch.lastError).toBe('connect ECONNREFUSED');
        expect(updates[0].patch.status).toBeUndefined(); // rescheduled, not FAILED
    });

    it('signs the body with HMAC-SHA256 when the row has a secret', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200 });
        const { dispatcher } = buildDispatcher({
            row: makeRow({ secret: 'shhh' }),
        });

        await (
            dispatcher as unknown as {
                processRow: (id: string) => Promise<void>;
            }
        ).processRow('d1');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, init] = fetchMock.mock.calls[0];
        const headers = init.headers as Record<string, string>;
        expect(headers['X-Survey-Engine-Signature']).toMatch(
            /^sha256=[0-9a-f]{64}$/,
        );
    });

    it('skips delivery when the row is no longer PENDING (idempotency guard)', async () => {
        const { dispatcher, updates } = buildDispatcher({
            row: makeRow({ status: WebhookDeliveryStatus.DELIVERED }),
        });

        await (
            dispatcher as unknown as {
                processRow: (id: string) => Promise<void>;
            }
        ).processRow('d1');

        expect(fetchMock).not.toHaveBeenCalled();
        expect(updates).toHaveLength(0);
    });
});
