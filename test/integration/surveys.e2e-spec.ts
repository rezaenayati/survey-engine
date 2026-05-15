import * as path from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {default as request} from 'supertest';
import { SurveysModule } from '../../src/surveys/surveys.module';
import { SchemaModule } from '../../src/schema/schema.module';
import { ConfigModule } from '@nestjs/config';
import { startTestDatabase, stopTestDatabase } from '../helpers/test-database';
import { App } from 'supertest/types';

/** A valid minimal SurveyJS schema */
const schema = {
  pages: [
    {
      name: 'page1',
      elements: [
        { name: 'q1', type: 'text', title: 'Your name', isRequired: true },
        { name: 'q2', type: 'radiogroup', title: 'Pick one', choices: [{ value: 'a' }, { value: 'b' }] },
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
          entities: [path.join(process.cwd(), 'src/**/*.entity{.ts,.js}')],
          synchronize: true,
          logging: false,
        }),
        SchemaModule,
        SurveysModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 60000);

  afterAll(async () => {
    await app.close();
    await stopTestDatabase();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Create
  // ──────────────────────────────────────────────────────────────────────────

  it('POST /surveys — creates a draft survey', async () => {
    const res = await request(app.getHttpServer())
      .post('/surveys')
      .set('X-User-ID', 'user-1')
      .send({ name: 'Customer Survey', schemaJson: schema })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('draft');
    expect(res.body.name).toBe('Customer Survey');
    surveyId = res.body.id;
  });

  it('POST /surveys — rejects invalid schema', async () => {
    await request(app.getHttpServer())
      .post('/surveys')
      .send({ name: 'Bad Survey', schemaJson: {} })
      .expect(400);
  });

  it('POST /surveys — requires name', async () => {
    await request(app.getHttpServer())
      .post('/surveys')
      .send({ schemaJson: schema })
      .expect(400);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Read
  // ──────────────────────────────────────────────────────────────────────────

  it('GET /surveys — lists surveys', async () => {
    const res = await request(app.getHttpServer()).get('/surveys').expect(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('GET /surveys/:id — returns specific survey', async () => {
    const res = await request(app.getHttpServer()).get(`/surveys/${surveyId}`).expect(200);
    expect(res.body.id).toBe(surveyId);
  });

  it('GET /surveys/:id — 404 for unknown ID', async () => {
    await request(app.getHttpServer())
      .get('/surveys/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Update
  // ──────────────────────────────────────────────────────────────────────────

  it('PATCH /surveys/:id — updates survey name', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/surveys/${surveyId}`)
      .send({ name: 'Updated Survey' })
      .expect(200);
    expect(res.body.name).toBe('Updated Survey');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Publish
  // ──────────────────────────────────────────────────────────────────────────

  it('POST /surveys/:id/publish — publishes and creates version', async () => {
    const res = await request(app.getHttpServer())
      .post(`/surveys/${surveyId}/publish`)
      .expect(201);
    expect(res.body.status).toBe('published');
    expect(res.body.activeVersionId).toBeDefined();
  });

  it('GET /surveys/:id/versions — lists at least one version', async () => {
    const res = await request(app.getHttpServer())
      .get(`/surveys/${surveyId}/versions`)
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /surveys/:id/runtime — returns active published version', async () => {
    const res = await request(app.getHttpServer())
      .get(`/surveys/${surveyId}/runtime`)
      .expect(200);
    expect(res.body.schemaJson).toBeDefined();
    expect(res.body.versionNumber).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Validate & evaluate-logic
  // ──────────────────────────────────────────────────────────────────────────

  it('GET /surveys/:id/validate — validates draft schema', async () => {
    const res = await request(app.getHttpServer())
      .get(`/surveys/${surveyId}/validate`)
      .expect(200);
    expect(res.body.schemaValid).toBe(true);
  });

  it('POST /surveys/:id/evaluate-logic — returns visibility result', async () => {
    const res = await request(app.getHttpServer())
      .post(`/surveys/${surveyId}/evaluate-logic`)
      .send({ answers: { q1: 'Alice' } })
      .expect(201);
    expect(res.body.visibleQuestions).toContain('q1');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Analytics
  // ──────────────────────────────────────────────────────────────────────────

  it('GET /surveys/:id/analytics — returns analytics object', async () => {
    const res = await request(app.getHttpServer())
      .get(`/surveys/${surveyId}/analytics`)
      .expect(200);
    expect(res.body.summary).toBeDefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Delete
  // ──────────────────────────────────────────────────────────────────────────

  it('DELETE /surveys/:id — deletes survey', async () => {
    // Create a fresh survey to delete (don't delete the one used for response tests)
    const created = await request(app.getHttpServer())
      .post('/surveys')
      .send({ name: 'To Delete', schemaJson: schema })
      .expect(201);

    await request(app.getHttpServer()).delete(`/surveys/${created.body.id}`).expect(204);
    await request(app.getHttpServer()).get(`/surveys/${created.body.id}`).expect(404);
  });
});
