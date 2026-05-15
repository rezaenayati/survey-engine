import * as path from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { default as request } from 'supertest';
import { SurveysModule } from '../../src/surveys/surveys.module';
import { ResponsesModule } from '../../src/responses/responses.module';
import { AnalyticsModule } from '../../src/analytics/analytics.module';
import { SchemaModule } from '../../src/schema/schema.module';
import { ConfigModule } from '@nestjs/config';
import {
    startTestDatabase,
    stopTestDatabase,
    getDataSource,
} from '../helpers/test-database';
import { Survey } from '../../src/surveys/entities/survey.entity';
import { Response } from '../../src/responses/entities/response.entity';
import { App } from 'supertest/types';

const schema = {
    pages: [
        {
            name: 'page1',
            elements: [
                { name: 'q1', type: 'text', title: 'Name', isRequired: false },
                {
                    name: 'q2',
                    type: 'radiogroup',
                    title: 'Choice',
                    choices: [{ value: 'a' }, { value: 'b' }],
                    isRequired: false,
                },
            ],
        },
    ],
};

describe('Responses API (e2e)', () => {
    let app: INestApplication<App>;
    let surveyId: string;
    let activeVersionId: string;
    let responseId: string;

    beforeAll(async () => {
        const db = await startTestDatabase();

        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                TypeOrmModule.forRoot({
                    type: 'postgres',
                    host: db.host,
                    port: db.port,
                    username: db.username,
                    password: db.password,
                    database: db.database,
                    entities: [
                        path.join(process.cwd(), 'src/**/*.entity{.ts,.js}'),
                    ],
                    synchronize: true,
                    logging: false,
                }),
                SchemaModule,
                SurveysModule,
                ResponsesModule,
                AnalyticsModule,
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({ whitelist: true, transform: true }),
        );
        await app.init();

        // Create and publish a survey that all response tests share
        const created = await request(app.getHttpServer())
            .post('/surveys')
            .set('X-User-ID', 'owner-1')
            .send({ name: 'Response Test Survey', schemaJson: schema });
        surveyId = created.body.id;

        const published = await request(app.getHttpServer())
            .post(`/surveys/${surveyId}/publish`)
            .set('X-User-ID', 'owner-1');
        activeVersionId = published.body.activeVersionId;
    }, 120000);

    afterAll(async () => {
        await app.close();
        await stopTestDatabase();
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Start
    // ──────────────────────────────────────────────────────────────────────────

    describe('POST /responses/start', () => {
        it('creates a response row in the DB pinned to the active version', async () => {
            const responseRepo = getDataSource().getRepository(Response);
            const countBefore = await responseRepo.count();

            const res = await request(app.getHttpServer())
                .post('/responses/start')
                .set('X-User-ID', 'respondent-1')
                .send({ surveyId })
                .expect(201);

            // Response shape
            expect(res.body.id).toBeDefined();
            expect(res.body.status).toBe('started');
            expect(res.body.surveyId).toBe(surveyId);
            expect(res.body.respondentId).toBe('respondent-1');

            // DB: one new row
            expect(await responseRepo.count()).toBe(countBefore + 1);

            // DB: row has correct values
            const row = await responseRepo.findOne({
                where: { id: res.body.id },
            });
            expect(row).not.toBeNull();
            expect(row!.surveyId).toBe(surveyId);
            expect(row!.surveyVersionId).toBe(activeVersionId); // pinned to active version
            expect(row!.respondentId).toBe('respondent-1');
            expect(row!.status).toBe('started');
            expect(row!.answersJson).toEqual({});

            responseId = res.body.id;
        });

        it('creates anonymous response (null respondentId) when no X-User-ID', async () => {
            const res = await request(app.getHttpServer())
                .post('/responses/start')
                .send({ surveyId })
                .expect(201);

            // DB: respondentId is null
            const row = await getDataSource()
                .getRepository(Response)
                .findOne({ where: { id: res.body.id } });
            expect(row!.respondentId).toBeNull();
        });

        it('returns 404 for unknown surveyId — no DB row created', async () => {
            const responseRepo = getDataSource().getRepository(Response);
            const countBefore = await responseRepo.count();

            // surveysService.findOne throws NotFoundException when the survey doesn't exist
            await request(app.getHttpServer())
                .post('/responses/start')
                .send({ surveyId: '00000000-0000-0000-0000-000000000000' })
                .expect(404);

            expect(await responseRepo.count()).toBe(countBefore);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Read
    // ──────────────────────────────────────────────────────────────────────────

    describe('GET /responses', () => {
        it('returns responses belonging to the authenticated respondent', async () => {
            const res = await request(app.getHttpServer())
                .get('/responses')
                .set('X-User-ID', 'respondent-1')
                .expect(200);

            expect(res.body.data).toBeInstanceOf(Array);
            expect(
                res.body.data.every(
                    (r: Response) => r.respondentId === 'respondent-1',
                ),
            ).toBe(true);
        });

        it('returns all responses for a survey when the survey owner queries by surveyId', async () => {
            const res = await request(app.getHttpServer())
                .get(`/responses?surveyId=${surveyId}`)
                .set('X-User-ID', 'owner-1') // owner of the survey
                .expect(200);

            expect(
                res.body.data.every((r: Response) => r.surveyId === surveyId),
            ).toBe(true);
        });

        it('returns 403 when a non-owner tries to list by surveyId', async () => {
            await request(app.getHttpServer())
                .get(`/responses?surveyId=${surveyId}`)
                .set('X-User-ID', 'stranger')
                .expect(403);
        });
    });

    describe('GET /responses/:id', () => {
        it('returns the response that exists in the DB', async () => {
            const row = await getDataSource()
                .getRepository(Response)
                .findOne({ where: { id: responseId } });
            expect(row).not.toBeNull();

            const res = await request(app.getHttpServer())
                .get(`/responses/${responseId}`)
                .set('X-User-ID', 'respondent-1')
                .expect(200);

            expect(res.body.id).toBe(responseId);
            expect(res.body.status).toBe(row!.status);
        });

        it('returns 404 for an ID not in the DB', async () => {
            const missingId = '00000000-0000-0000-0000-000000000001';
            expect(
                await getDataSource()
                    .getRepository(Response)
                    .findOne({ where: { id: missingId } }),
            ).toBeNull();

            await request(app.getHttpServer())
                .get(`/responses/${missingId}`)
                .expect(404);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Update (partial save)
    // ──────────────────────────────────────────────────────────────────────────

    describe('PATCH /responses/:id', () => {
        it('merges answers into the DB row and sets status to in_progress', async () => {
            const responseRepo = getDataSource().getRepository(Response);

            // Pre-condition: empty answers, status = started
            const before = await responseRepo.findOne({
                where: { id: responseId },
            });
            expect(before!.status).toBe('started');
            expect(before!.answersJson).toEqual({});

            const res = await request(app.getHttpServer())
                .patch(`/responses/${responseId}`)
                .set('X-User-ID', 'respondent-1')
                .send({ answersJson: { q1: 'Alice' } })
                .expect(200);

            expect(res.body.status).toBe('in_progress');
            expect(res.body.answersJson.q1).toBe('Alice');

            // DB: answers and status persisted
            const after = await responseRepo.findOne({
                where: { id: responseId },
            });
            expect(after!.status).toBe('in_progress');
            expect((after!.answersJson as Record<string, unknown>).q1).toBe(
                'Alice',
            );
        });

        it('merges additional answers without overwriting existing ones', async () => {
            const responseRepo = getDataSource().getRepository(Response);

            await request(app.getHttpServer())
                .patch(`/responses/${responseId}`)
                .set('X-User-ID', 'respondent-1')
                .send({ answersJson: { q2: 'b' } })
                .expect(200);

            const row = await responseRepo.findOne({
                where: { id: responseId },
            });
            expect((row!.answersJson as Record<string, unknown>).q1).toBe(
                'Alice',
            ); // preserved
            expect((row!.answersJson as Record<string, unknown>).q2).toBe('b'); // added
        });

        it('returns 403 when a different user tries to update', async () => {
            const before = await getDataSource()
                .getRepository(Response)
                .findOne({ where: { id: responseId } });

            await request(app.getHttpServer())
                .patch(`/responses/${responseId}`)
                .set('X-User-ID', 'stranger')
                .send({ answersJson: { q1: 'Hacked' } })
                .expect(403);

            const after = await getDataSource()
                .getRepository(Response)
                .findOne({ where: { id: responseId } });
            expect(after!.answersJson).toEqual(before!.answersJson); // unchanged
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Validate / Logic (read-only)
    // ──────────────────────────────────────────────────────────────────────────

    describe('GET /responses/:id/validate', () => {
        it('returns validation result without modifying the DB row', async () => {
            const before = await getDataSource()
                .getRepository(Response)
                .findOne({ where: { id: responseId } });

            const res = await request(app.getHttpServer())
                .get(`/responses/${responseId}/validate`)
                .set('X-User-ID', 'respondent-1')
                .expect(200);

            expect(res.body).toHaveProperty('valid');
            expect(res.body).toHaveProperty('visibleQuestions');

            const after = await getDataSource()
                .getRepository(Response)
                .findOne({ where: { id: responseId } });
            expect(after!.updatedAt).toEqual(before!.updatedAt);
        });
    });

    describe('GET /responses/:id/logic', () => {
        it('returns logic evaluation without modifying the DB row', async () => {
            const before = await getDataSource()
                .getRepository(Response)
                .findOne({ where: { id: responseId } });

            const res = await request(app.getHttpServer())
                .get(`/responses/${responseId}/logic`)
                .set('X-User-ID', 'respondent-1')
                .expect(200);

            expect(res.body.visibleQuestions).toContain('q1');

            const after = await getDataSource()
                .getRepository(Response)
                .findOne({ where: { id: responseId } });
            expect(after!.updatedAt).toEqual(before!.updatedAt);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Complete
    // ──────────────────────────────────────────────────────────────────────────

    describe('POST /responses/:id/complete', () => {
        it('sets status to completed and writes completedAt to the DB', async () => {
            const responseRepo = getDataSource().getRepository(Response);

            // Pre-condition
            const before = await responseRepo.findOne({
                where: { id: responseId },
            });
            expect(before!.status).toBe('in_progress');
            expect(before!.completedAt).toBeNull();

            const res = await request(app.getHttpServer())
                .post(`/responses/${responseId}/complete`)
                .set('X-User-ID', 'respondent-1')
                .expect(201);

            expect(res.body.status).toBe('completed');
            expect(res.body.completedAt).toBeDefined();

            // DB: status and completedAt persisted
            const after = await responseRepo.findOne({
                where: { id: responseId },
            });
            expect(after!.status).toBe('completed');
            expect(after!.completedAt).not.toBeNull();
        });

        it('returns 400 on already-completed response — DB unchanged', async () => {
            const before = await getDataSource()
                .getRepository(Response)
                .findOne({ where: { id: responseId } });
            expect(before!.status).toBe('completed');

            await request(app.getHttpServer())
                .post(`/responses/${responseId}/complete`)
                .set('X-User-ID', 'respondent-1')
                .expect(400);

            // DB: completedAt unchanged
            const after = await getDataSource()
                .getRepository(Response)
                .findOne({ where: { id: responseId } });
            expect(after!.completedAt!.getTime()).toBe(
                before!.completedAt!.getTime(),
            );
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Analytics reflects real DB state
    // ──────────────────────────────────────────────────────────────────────────

    describe('GET /surveys/:id/analytics — after completing a response', () => {
        it('reports the completed response in summary stats', async () => {
            const responseRepo = getDataSource().getRepository(Response);
            const completed = await responseRepo.count({
                where: { surveyId, status: 'completed' as never },
            });

            const res = await request(app.getHttpServer())
                .get(`/surveys/${surveyId}/analytics`)
                .set('X-User-ID', 'owner-1')
                .expect(200);

            expect(res.body.summary.completedResponses).toBe(completed);
            expect(res.body.summary.completionRate).toBeGreaterThan(0);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Delete
    // ──────────────────────────────────────────────────────────────────────────

    describe('DELETE /responses/:id', () => {
        it('removes the row from the DB', async () => {
            const responseRepo = getDataSource().getRepository(Response);

            const started = await request(app.getHttpServer())
                .post('/responses/start')
                .set('X-User-ID', 'respondent-1')
                .send({ surveyId })
                .expect(201);

            const id = started.body.id;

            // Pre-condition: row exists
            expect(
                await responseRepo.findOne({ where: { id } }),
            ).not.toBeNull();

            await request(app.getHttpServer())
                .delete(`/responses/${id}`)
                .set('X-User-ID', 'respondent-1')
                .expect(204);

            // DB: row gone
            expect(await responseRepo.findOne({ where: { id } })).toBeNull();

            // API: 404
            await request(app.getHttpServer())
                .get(`/responses/${id}`)
                .expect(404);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Version pinning — re-publish does not affect in-flight responses
    // ──────────────────────────────────────────────────────────────────────────

    describe('version pinning', () => {
        it('in-flight response stays pinned to version it started on after re-publish', async () => {
            // Start a response (pins to current active version)
            const startRes = await request(app.getHttpServer())
                .post('/responses/start')
                .set('X-User-ID', 'respondent-2')
                .send({ surveyId })
                .expect(201);

            const pinnedVersionId = startRes.body.surveyVersionId;

            // Owner edits draft and re-publishes (new active version)
            await request(app.getHttpServer())
                .patch(`/surveys/${surveyId}`)
                .set('X-User-ID', 'owner-1')
                .send({ schemaJson: { ...schema, title: 'v2 schema' } });

            await request(app.getHttpServer())
                .post(`/surveys/${surveyId}/publish`)
                .set('X-User-ID', 'owner-1');

            // DB: in-flight response still references the old version
            const row = await getDataSource()
                .getRepository(Response)
                .findOne({ where: { id: startRes.body.id } });
            expect(row!.surveyVersionId).toBe(pinnedVersionId);

            // Survey now has a new active version
            const survey = await getDataSource()
                .getRepository(Survey)
                .findOne({ where: { id: surveyId } });
            expect(survey!.activeVersionId).not.toBe(pinnedVersionId);
        });
    });
});
