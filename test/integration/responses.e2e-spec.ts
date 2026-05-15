import * as path from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {default as request} from 'supertest';
import { SurveysModule } from '../../src/surveys/surveys.module';
import { ResponsesModule } from '../../src/responses/responses.module';
import { SchemaModule } from '../../src/schema/schema.module';
import { ConfigModule } from '@nestjs/config';
import { startTestDatabase, stopTestDatabase } from '../helpers/test-database';
import { App } from 'supertest/types';

const schema = {
  pages: [
    {
      name: 'page1',
      elements: [
        { name: 'q1', type: 'text', title: 'Name', isRequired: false },
        { name: 'q2', type: 'radiogroup', title: 'Choice', choices: [{ value: 'a' }, { value: 'b' }], isRequired: false },
      ],
    },
  ],
};

describe('Responses API (e2e)', () => {
  let app: INestApplication<App>;
  let surveyId: string;
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
          entities: [path.join(process.cwd(), 'src/**/*.entity{.ts,.js}')],
          synchronize: true,
          logging: false,
        }),
        SchemaModule,
        SurveysModule,
        ResponsesModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // Create and publish a survey for response tests
    const created = await request(app.getHttpServer())
      .post('/surveys')
      .send({ name: 'Response Test Survey', schemaJson: schema });
    surveyId = created.body.id;

    await request(app.getHttpServer()).post(`/surveys/${surveyId}/publish`);
  }, 120000);

  afterAll(async () => {
    await app.close();
    await stopTestDatabase();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Start
  // ──────────────────────────────────────────────────────────────────────────

  it('POST /responses/start — starts a new response session', async () => {
    const res = await request(app.getHttpServer())
      .post('/responses/start')
      .set('X-User-ID', 'respondent-1')
      .send({ surveyId })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('started');
    expect(res.body.surveyId).toBe(surveyId);
    responseId = res.body.id;
  });

  it('POST /responses/start — creates anonymous response without X-User-ID', async () => {
    const res = await request(app.getHttpServer())
      .post('/responses/start')
      .send({ surveyId })
      .expect(201);
    expect(res.body.respondentId).toBeNull();
  });

  it('POST /responses/start — 400 for unknown surveyId', async () => {
    await request(app.getHttpServer())
      .post('/responses/start')
      .send({ surveyId: '00000000-0000-0000-0000-000000000000' })
      .expect(400);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Read
  // ──────────────────────────────────────────────────────────────────────────

  it('GET /responses — lists responses', async () => {
    const res = await request(app.getHttpServer()).get('/responses').expect(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /responses?surveyId= — filters by survey', async () => {
    const res = await request(app.getHttpServer())
      .get(`/responses?surveyId=${surveyId}`)
      .expect(200);
    expect(res.body.data.every((r: { surveyId: string }) => r.surveyId === surveyId)).toBe(true);
  });

  it('GET /responses/:id — returns specific response', async () => {
    const res = await request(app.getHttpServer()).get(`/responses/${responseId}`).expect(200);
    expect(res.body.id).toBe(responseId);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Update (partial save)
  // ──────────────────────────────────────────────────────────────────────────

  it('PATCH /responses/:id — saves partial answers', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/responses/${responseId}`)
      .send({ answersJson: { q1: 'Alice' } })
      .expect(200);
    expect(res.body.status).toBe('in_progress');
    expect(res.body.answersJson.q1).toBe('Alice');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Validate
  // ──────────────────────────────────────────────────────────────────────────

  it('GET /responses/:id/validate — returns validation result', async () => {
    const res = await request(app.getHttpServer())
      .get(`/responses/${responseId}/validate`)
      .expect(200);
    expect(res.body).toHaveProperty('valid');
    expect(res.body).toHaveProperty('visibleQuestions');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Logic
  // ──────────────────────────────────────────────────────────────────────────

  it('GET /responses/:id/logic — returns logic evaluation', async () => {
    const res = await request(app.getHttpServer())
      .get(`/responses/${responseId}/logic`)
      .expect(200);
    expect(res.body.visibleQuestions).toContain('q1');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Complete
  // ──────────────────────────────────────────────────────────────────────────

  it('POST /responses/:id/complete — completes the response', async () => {
    const res = await request(app.getHttpServer())
      .post(`/responses/${responseId}/complete`)
      .expect(201);
    expect(res.body.status).toBe('completed');
    expect(res.body.completedAt).toBeDefined();
  });

  it('POST /responses/:id/complete — 400 on already completed response', async () => {
    await request(app.getHttpServer())
      .post(`/responses/${responseId}/complete`)
      .expect(400);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Delete
  // ──────────────────────────────────────────────────────────────────────────

  it('DELETE /responses/:id — deletes a response', async () => {
    // Start a fresh response to delete
    const started = await request(app.getHttpServer())
      .post('/responses/start')
      .send({ surveyId })
      .expect(201);

    await request(app.getHttpServer()).delete(`/responses/${started.body.id}`).expect(204);
    await request(app.getHttpServer()).get(`/responses/${started.body.id}`).expect(404);
  });
});
