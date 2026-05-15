import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as request from 'supertest';
import { HealthModule } from '../../src/health/health.module';
import { ConfigModule } from '@nestjs/config';
import { startTestDatabase, stopTestDatabase } from '../helpers/test-database';
import { App } from 'supertest/types';

describe('Health check (e2e)', () => {
    let app: INestApplication<App>;

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
                    entities: [],
                    synchronize: false,
                    logging: false,
                }),
                HealthModule,
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();
    }, 60000);

    afterAll(async () => {
        await app.close();
        await stopTestDatabase();
    });

    it('GET /health — returns 200', async () => {
        const res = await request
            .default(app.getHttpServer())
            .get('/health')
            .expect(200);
        expect(res.body.status).toBe('ok');
    });
});
