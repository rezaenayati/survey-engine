import * as path from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { default as request } from 'supertest';
import { SurveysModule } from '../../src/surveys/surveys.module';
import { AnalyticsModule } from '../../src/analytics/analytics.module';
import { SchemaModule } from '../../src/schema/schema.module';
import { ConfigModule } from '@nestjs/config';
import {
    startTestDatabase,
    stopTestDatabase,
    getDataSource,
} from '../helpers/test-database';
import { Survey } from '../../src/surveys/entities/survey.entity';
import { SurveyVersion } from '../../src/surveys/entities/survey-version.entity';
import { App } from 'supertest/types';

const schema = {
    pages: [
        {
            name: 'page1',
            elements: [
                {
                    name: 'q1',
                    type: 'text',
                    title: 'Your name',
                    isRequired: true,
                },
                {
                    name: 'q2',
                    type: 'radiogroup',
                    title: 'Pick one',
                    choices: [{ value: 'a' }, { value: 'b' }],
                },
            ],
        },
    ],
};

describe('Surveys API (e2e)', () => {
    let app: INestApplication<App>;
    let surveyId: string;

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
                AnalyticsModule,
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({ whitelist: true, transform: true }),
        );
        await app.init();
    }, 60000);

    afterAll(async () => {
        await app.close();
        await stopTestDatabase();
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Create
    // ──────────────────────────────────────────────────────────────────────────

    describe('POST /surveys', () => {
        it('creates a draft survey and persists it to the DB', async () => {
            const surveyRepo = getDataSource().getRepository(Survey);

            // Pre-condition: no survey with this name yet
            const before = await surveyRepo.findOne({
                where: { name: 'Customer Survey' },
            });
            expect(before).toBeNull();

            const res = await request(app.getHttpServer())
                .post('/surveys')
                .set('X-User-ID', 'user-1')
                .send({ name: 'Customer Survey', schemaJson: schema })
                .expect(201);

            // Response shape
            expect(res.body.id).toBeDefined();
            expect(res.body.status).toBe('draft');
            expect(res.body.name).toBe('Customer Survey');
            expect(res.body.createdBy).toBe('user-1');

            // DB: row actually exists with correct values
            const row = await surveyRepo.findOne({
                where: { id: res.body.id },
            });
            expect(row).not.toBeNull();
            expect(row!.name).toBe('Customer Survey');
            expect(row!.status).toBe('draft');
            expect(row!.createdBy).toBe('user-1');
            expect(row!.draftSchemaJson).toBeTruthy();

            surveyId = res.body.id;
        });

        it('rejects invalid schema — no DB row created', async () => {
            const surveyRepo = getDataSource().getRepository(Survey);
            const countBefore = await surveyRepo.count();

            await request(app.getHttpServer())
                .post('/surveys')
                .send({ name: 'Bad Survey', schemaJson: {} })
                .expect(400);

            // DB: count unchanged
            expect(await surveyRepo.count()).toBe(countBefore);
        });

        it('rejects missing name — 400', async () => {
            await request(app.getHttpServer())
                .post('/surveys')
                .send({ schemaJson: schema })
                .expect(400);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Read
    // ──────────────────────────────────────────────────────────────────────────

    describe('GET /surveys', () => {
        it('lists surveys owned by the authenticated user', async () => {
            const res = await request(app.getHttpServer())
                .get('/surveys')
                .set('X-User-ID', 'user-1')
                .expect(200);

            expect(res.body.data).toBeInstanceOf(Array);
            expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
            // All returned surveys belong to user-1
            expect(
                res.body.data.every((s: Survey) => s.createdBy === 'user-1'),
            ).toBe(true);
        });

        it('returns only published surveys for unauthenticated caller', async () => {
            const res = await request(app.getHttpServer())
                .get('/surveys')
                .expect(200);

            // No published surveys yet — draft created above should not appear
            expect(
                res.body.data.every((s: Survey) => s.status === 'published'),
            ).toBe(true);
        });
    });

    describe('GET /surveys/:id', () => {
        it('returns the survey that exists in the DB', async () => {
            // Verify DB state first
            const row = await getDataSource()
                .getRepository(Survey)
                .findOne({ where: { id: surveyId } });
            expect(row).not.toBeNull();

            const res = await request(app.getHttpServer())
                .get(`/surveys/${surveyId}`)
                .expect(200);

            expect(res.body.id).toBe(surveyId);
            expect(res.body.name).toBe(row!.name);
        });

        it('returns 404 for an ID that does not exist in the DB', async () => {
            const missingId = '00000000-0000-0000-0000-000000000000';
            const row = await getDataSource()
                .getRepository(Survey)
                .findOne({ where: { id: missingId } });
            expect(row).toBeNull();

            await request(app.getHttpServer())
                .get(`/surveys/${missingId}`)
                .expect(404);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Update
    // ──────────────────────────────────────────────────────────────────────────

    describe('PATCH /surveys/:id', () => {
        it('updates the survey name and persists the change to the DB', async () => {
            const surveyRepo = getDataSource().getRepository(Survey);

            // Pre-condition
            const before = await surveyRepo.findOne({
                where: { id: surveyId },
            });
            expect(before!.name).toBe('Customer Survey');

            const res = await request(app.getHttpServer())
                .patch(`/surveys/${surveyId}`)
                .set('X-User-ID', 'user-1')
                .send({ name: 'Updated Survey' })
                .expect(200);

            expect(res.body.name).toBe('Updated Survey');

            // DB: name persisted
            const after = await surveyRepo.findOne({ where: { id: surveyId } });
            expect(after!.name).toBe('Updated Survey');
        });

        it('returns 403 when a different user tries to update', async () => {
            await request(app.getHttpServer())
                .patch(`/surveys/${surveyId}`)
                .set('X-User-ID', 'other-user')
                .send({ name: 'Hijacked' })
                .expect(403);

            // DB: name unchanged
            const row = await getDataSource()
                .getRepository(Survey)
                .findOne({ where: { id: surveyId } });
            expect(row!.name).toBe('Updated Survey');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Publish
    // ──────────────────────────────────────────────────────────────────────────

    describe('POST /surveys/:id/publish', () => {
        it('publishes the survey, creates a version row, and updates activeVersionId in the DB', async () => {
            const surveyRepo = getDataSource().getRepository(Survey);
            const versionRepo = getDataSource().getRepository(SurveyVersion);

            // Pre-condition: no versions yet
            const versionsBefore = await versionRepo.find({
                where: { surveyId },
            });
            expect(versionsBefore).toHaveLength(0);

            const before = await surveyRepo.findOne({
                where: { id: surveyId },
            });
            expect(before!.status).toBe('draft');
            expect(before!.activeVersionId).toBeNull();

            const res = await request(app.getHttpServer())
                .post(`/surveys/${surveyId}/publish`)
                .set('X-User-ID', 'user-1')
                .expect(201);

            // Response
            expect(res.body.status).toBe('published');
            expect(res.body.activeVersionId).toBeDefined();

            // DB: status updated
            const surveyAfter = await surveyRepo.findOne({
                where: { id: surveyId },
            });
            expect(surveyAfter!.status).toBe('published');
            expect(surveyAfter!.activeVersionId).toBe(res.body.activeVersionId);

            // DB: version row created with correct data
            const versions = await versionRepo.find({ where: { surveyId } });
            expect(versions).toHaveLength(1);
            expect(versions[0].versionNumber).toBe(1);
            expect(versions[0].schemaJson).toBeTruthy();
            expect(versions[0].checksum).toHaveLength(64); // sha256 hex
        });

        it('creates a second version row on re-publish', async () => {
            const versionRepo = getDataSource().getRepository(SurveyVersion);

            // Edit draft first so there is something to publish
            await request(app.getHttpServer())
                .patch(`/surveys/${surveyId}`)
                .set('X-User-ID', 'user-1')
                .send({ schemaJson: { ...schema, title: 'v2' } });

            await request(app.getHttpServer())
                .post(`/surveys/${surveyId}/publish`)
                .set('X-User-ID', 'user-1')
                .expect(201);

            const versions = await versionRepo.find({
                where: { surveyId },
                order: { versionNumber: 'ASC' },
            });
            expect(versions).toHaveLength(2);
            expect(versions[1].versionNumber).toBe(2);
        });
    });

    describe('GET /surveys/:id/versions', () => {
        it('lists all versions from the DB', async () => {
            const versionRepo = getDataSource().getRepository(SurveyVersion);
            const dbVersions = await versionRepo.find({ where: { surveyId } });

            const res = await request(app.getHttpServer())
                .get(`/surveys/${surveyId}/versions`)
                .set('X-User-ID', 'user-1')
                .expect(200);

            expect(res.body.length).toBe(dbVersions.length);
        });
    });

    describe('GET /surveys/:id/runtime', () => {
        it('returns the active published version schema', async () => {
            const survey = await getDataSource()
                .getRepository(Survey)
                .findOne({ where: { id: surveyId } });
            const version = await getDataSource()
                .getRepository(SurveyVersion)
                .findOne({ where: { id: survey!.activeVersionId! } });

            const res = await request(app.getHttpServer())
                .get(`/surveys/${surveyId}/runtime`)
                .expect(200);

            expect(res.body.schemaJson).toEqual(version!.schemaJson);
            expect(res.body.checksum).toBe(version!.checksum);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Validate & evaluate-logic
    // ──────────────────────────────────────────────────────────────────────────

    describe('GET /surveys/:id/validate', () => {
        it('validates draft schema — no DB write', async () => {
            const before = await getDataSource()
                .getRepository(Survey)
                .findOne({ where: { id: surveyId } });

            const res = await request(app.getHttpServer())
                .get(`/surveys/${surveyId}/validate`)
                .set('X-User-ID', 'user-1')
                .expect(200);

            expect(res.body.schemaValid).toBe(true);
            expect(res.body.schemaErrors).toHaveLength(0);

            // DB: validate is read-only, nothing changed
            const after = await getDataSource()
                .getRepository(Survey)
                .findOne({ where: { id: surveyId } });
            expect(after!.updatedAt).toEqual(before!.updatedAt);
        });
    });

    describe('POST /surveys/:id/evaluate-logic', () => {
        it('returns visibility result — no DB write', async () => {
            const before = await getDataSource()
                .getRepository(Survey)
                .findOne({ where: { id: surveyId } });

            const res = await request(app.getHttpServer())
                .post(`/surveys/${surveyId}/evaluate-logic`)
                .send({ answers: { q1: 'Alice' } })
                .expect(201);

            expect(res.body.visibleQuestions).toContain('q1');

            const after = await getDataSource()
                .getRepository(Survey)
                .findOne({ where: { id: surveyId } });
            expect(after!.updatedAt).toEqual(before!.updatedAt);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Analytics
    // ──────────────────────────────────────────────────────────────────────────

    describe('GET /surveys/:id/analytics', () => {
        it('returns analytics with zero responses', async () => {
            const res = await request(app.getHttpServer())
                .get(`/surveys/${surveyId}/analytics`)
                .set('X-User-ID', 'user-1')
                .expect(200);

            expect(res.body.summary).toBeDefined();
            expect(res.body.summary.totalResponses).toBe(0);
            expect(res.body.summary.completionRate).toBe(0);
            expect(res.body.funnel).toBeDefined();
            expect(res.body.trends).toBeDefined();
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Delete
    // ──────────────────────────────────────────────────────────────────────────

    describe('DELETE /surveys/:id', () => {
        it('deletes the survey and removes the row from the DB', async () => {
            const surveyRepo = getDataSource().getRepository(Survey);

            const created = await request(app.getHttpServer())
                .post('/surveys')
                .set('X-User-ID', 'user-1')
                .send({ name: 'To Delete', schemaJson: schema })
                .expect(201);

            const id = created.body.id;

            // Pre-condition: row exists
            expect(await surveyRepo.findOne({ where: { id } })).not.toBeNull();

            await request(app.getHttpServer())
                .delete(`/surveys/${id}`)
                .set('X-User-ID', 'user-1')
                .expect(204);

            // DB: row gone
            expect(await surveyRepo.findOne({ where: { id } })).toBeNull();

            // API: 404
            await request(app.getHttpServer())
                .get(`/surveys/${id}`)
                .expect(404);
        });

        it('returns 403 when a different user tries to delete', async () => {
            const surveyRepo = getDataSource().getRepository(Survey);

            await request(app.getHttpServer())
                .delete(`/surveys/${surveyId}`)
                .set('X-User-ID', 'other-user')
                .expect(403);

            // DB: row still exists
            expect(
                await surveyRepo.findOne({ where: { id: surveyId } }),
            ).not.toBeNull();
        });
    });
});
