import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHmac } from 'crypto';
import { DataSource } from 'typeorm';
import {
    WebhookDelivery,
    WebhookDeliveryStatus,
} from './entities/webhook-delivery.entity';

const INTERVAL_NAME = 'webhook-dispatcher';

/**
 * Drains `webhook_deliveries`: on a configurable interval, locks a small batch
 * of pending rows (`FOR UPDATE SKIP LOCKED`), attempts delivery to each, and
 * updates the row with the outcome. Failures get rescheduled with exponential
 * backoff; after `WEBHOOK_MAX_ATTEMPTS` failures the row is marked FAILED.
 *
 * Designed to run safely with multiple engine instances — `SKIP LOCKED` ensures
 * each row is processed by exactly one worker per cycle.
 */
@Injectable()
export class WebhookDispatcherService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(WebhookDispatcherService.name);

    private readonly pollIntervalMs: number;
    private readonly maxAttempts: number;
    private readonly batchSize: number;
    private readonly fetchTimeoutMs: number;
    private readonly enabled: boolean;

    private running = false;

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly scheduler: SchedulerRegistry,
        config: ConfigService,
    ) {
        this.pollIntervalMs = config.get<number>(
            'WEBHOOK_POLL_INTERVAL_MS',
            1000,
        );
        this.maxAttempts = config.get<number>('WEBHOOK_MAX_ATTEMPTS', 3);
        this.batchSize = config.get<number>('WEBHOOK_BATCH_SIZE', 10);
        this.fetchTimeoutMs = config.get<number>(
            'WEBHOOK_FETCH_TIMEOUT_MS',
            10_000,
        );
        this.enabled =
            config.get<string>('WEBHOOK_DISPATCHER_ENABLED') !== 'false';
    }

    onModuleInit(): void {
        if (!this.enabled) {
            this.logger.log(
                'Webhook dispatcher disabled via WEBHOOK_DISPATCHER_ENABLED=false',
            );
            return;
        }
        const interval = setInterval(
            () => void this.tick(),
            this.pollIntervalMs,
        );
        this.scheduler.addInterval(INTERVAL_NAME, interval);
        this.logger.log(
            `Webhook dispatcher started: poll=${this.pollIntervalMs}ms ` +
                `batch=${this.batchSize} maxAttempts=${this.maxAttempts}`,
        );
    }

    onModuleDestroy(): void {
        if (this.scheduler.doesExist('interval', INTERVAL_NAME)) {
            this.scheduler.deleteInterval(INTERVAL_NAME);
        }
    }

    /**
     * One poll cycle. Re-entrancy guard prevents overlapping ticks if delivery
     * is slow — at most one batch in flight per instance at a time.
     */
    async tick(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            await this.drainOnce();
        } catch (err) {
            this.logger.error(
                `Dispatcher tick failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        } finally {
            this.running = false;
        }
    }

    private async drainOnce(): Promise<void> {
        // Each row is processed in its own transaction so a delivery failure on
        // one row doesn't roll back updates on others in the same batch.
        const rowIds = await this.lockBatch();
        for (const id of rowIds) {
            await this.processRow(id).catch((err) => {
                this.logger.error(
                    `Failed to process delivery ${id}: ${err instanceof Error ? err.message : String(err)}`,
                );
            });
        }
    }

    /**
     * Snapshot a batch of due rows under FOR UPDATE SKIP LOCKED, then release
     * the lock. We re-lock each row individually in `processRow` so the locks
     * don't span the duration of a (potentially slow) HTTP call.
     */
    private async lockBatch(): Promise<string[]> {
        return this.dataSource.transaction(async (manager) => {
            const rows = await manager
                .createQueryBuilder(WebhookDelivery, 'd')
                .setLock('pessimistic_write')
                .setOnLocked('skip_locked')
                .where('d.status = :status', {
                    status: WebhookDeliveryStatus.PENDING,
                })
                .andWhere('d.nextAttemptAt <= :now', { now: new Date() })
                .orderBy('d.nextAttemptAt', 'ASC')
                .limit(this.batchSize)
                .getMany();
            return rows.map((r) => r.id);
        });
    }

    private async processRow(id: string): Promise<void> {
        const row = await this.dataSource.manager.findOne(WebhookDelivery, {
            where: { id },
        });
        // Skip if another worker already moved it past PENDING (shouldn't happen
        // with SKIP LOCKED, but harmless defensive check).
        if (!row || row.status !== WebhookDeliveryStatus.PENDING) return;

        const result = await this.attemptDelivery(row);
        const attempts = row.attempts + 1;
        const now = new Date();

        if (result.ok) {
            await this.dataSource.manager.update(WebhookDelivery, row.id, {
                status: WebhookDeliveryStatus.DELIVERED,
                attempts,
                lastAttemptAt: now,
                lastResponseStatus: result.status,
                lastError: null,
            });
            this.logger.log(
                `Webhook delivered: event=${row.event} surveyId=${row.surveyId} ` +
                    `responseId=${row.responseId} status=${result.status} attempt=${attempts}`,
            );
            return;
        }

        // Failure branch.
        const errorMessage = result.error ?? 'unknown error';
        const errorStatus = result.status;

        if (attempts >= this.maxAttempts) {
            await this.dataSource.manager.update(WebhookDelivery, row.id, {
                status: WebhookDeliveryStatus.FAILED,
                attempts,
                lastAttemptAt: now,
                lastResponseStatus: errorStatus,
                lastError: errorMessage.slice(0, 1024),
            });
            this.logger.error(
                `Webhook permanently failed after ${attempts} attempts: ` +
                    `event=${row.event} surveyId=${row.surveyId} responseId=${row.responseId} ` +
                    `url=${row.url} lastError=${errorMessage}`,
            );
            return;
        }

        // Schedule the next retry. Backoff: 1s, 2s, 4s, ... matching the previous loop.
        const backoffMs = 1000 * 2 ** (attempts - 1);
        const nextAttemptAt = new Date(now.getTime() + backoffMs);
        await this.dataSource.manager.update(WebhookDelivery, row.id, {
            attempts,
            lastAttemptAt: now,
            lastResponseStatus: errorStatus,
            lastError: errorMessage.slice(0, 1024),
            nextAttemptAt,
        });
        this.logger.warn(
            `Webhook attempt ${attempts}/${this.maxAttempts} failed: ` +
                `event=${row.event} url=${row.url} retry=${backoffMs}ms error=${errorMessage}`,
        );
    }

    private async attemptDelivery(
        row: WebhookDelivery,
    ): Promise<DeliveryResult> {
        const body = JSON.stringify(row.payload);
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'survey-engine-webhooks/1.0',
            'X-Survey-Engine-Event': row.event,
            'X-Survey-Engine-Delivery': row.responseId,
        };
        if (row.secret) {
            headers['X-Survey-Engine-Signature'] =
                `sha256=${this.sign(body, row.secret)}`;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
        try {
            const res = await fetch(row.url, {
                method: 'POST',
                headers,
                body,
                signal: controller.signal,
            });
            if (res.ok) return { ok: true, status: res.status, error: null };
            return {
                ok: false,
                status: res.status,
                error: `HTTP ${res.status}`,
            };
        } catch (err) {
            return {
                ok: false,
                status: null,
                error: err instanceof Error ? err.message : String(err),
            };
        } finally {
            clearTimeout(timer);
        }
    }

    private sign(body: string, secret: string): string {
        return createHmac('sha256', secret).update(body).digest('hex');
    }
}

// Uniform shape across success and failure — the codebase has strictNullChecks
// disabled, so discriminated-union narrowing via the `ok` discriminator isn't
// reliable. Keeping all fields present on every variant sidesteps the issue.
interface DeliveryResult {
    ok: boolean;
    status: number | null;
    error: string | null;
}
