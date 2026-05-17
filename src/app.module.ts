import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { UserAuthGuard } from './common/guards/user-auth.guard';
import { LoggerModule } from 'nestjs-pino';
import { SurveysModule } from './surveys/surveys.module';
import { ResponsesModule } from './responses/responses.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { HealthModule } from './health/health.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { FilesModule } from './files/files.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
        }),

        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => {
                const isDev = configService.get('NODE_ENV') !== 'production';
                // `synchronize` is opt-in via DB_SYNCHRONIZE=true. Default off
                // everywhere so a misconfigured NODE_ENV cannot accidentally
                // let TypeORM rewrite a production schema in place. Local dev
                // sets DB_SYNCHRONIZE=true in `.env` for the auto-sync workflow.
                const synchronize =
                    configService.get<string>('DB_SYNCHRONIZE') === 'true';
                return {
                    type: 'postgres',
                    host: configService.get('DB_HOST', 'localhost'),
                    port: configService.get<number>('DB_PORT', 5432),
                    username: configService.get('DB_USER', 'postgres'),
                    password: configService.get('DB_PASSWORD', 'postgres'),
                    database: configService.get('DB_NAME', 'survey_engine'),
                    entities: [__dirname + '/**/*.entity{.ts,.js}'],
                    migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
                    migrationsTableName: 'migrations',
                    synchronize,
                    // Run pending migrations on startup unless `synchronize` is
                    // managing the schema — they're mutually exclusive.
                    migrationsRun: !synchronize,
                    logging: isDev,
                };
            },
        }),

        // Structured JSON logging in production, pretty-print in development
        LoggerModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (cfg: ConfigService) => ({
                pinoHttp: {
                    level: cfg.get('LOG_LEVEL', 'info'),
                    transport:
                        cfg.get('NODE_ENV') !== 'production'
                            ? {
                                  target: 'pino-pretty',
                                  options: { colorize: true },
                              }
                            : undefined,
                },
            }),
        }),

        // Rate limiting: 100 requests / 60 s per IP by default
        ThrottlerModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (cfg: ConfigService) => ({
                throttlers: [
                    {
                        ttl: cfg.get<number>('THROTTLE_TTL', 60) * 1000,
                        limit: cfg.get<number>('THROTTLE_LIMIT', 100),
                    },
                ],
            }),
        }),

        SurveysModule,
        ResponsesModule,
        FilesModule,
        AnalyticsModule,
        HealthModule,
    ],
    providers: [
        // Caller auth (API key) runs first; inactive when API_KEY is unset.
        { provide: APP_GUARD, useClass: ApiKeyGuard },
        // User-identity auth: verifies X-User-Token and enforces STRICT_AUTH rules.
        { provide: APP_GUARD, useClass: UserAuthGuard },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestIdMiddleware).forRoutes('*');
    }
}
