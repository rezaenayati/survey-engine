import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });

    // Structured logger (pino)
    app.useLogger(app.get(Logger));

    // Security headers
    app.use(helmet());

    // CORS — allow specific origins from env, or all in development
    const corsOrigins = process.env.CORS_ORIGINS;
    app.enableCors({
        origin:
            corsOrigins && corsOrigins !== '*'
                ? corsOrigins.split(',').map((o) => o.trim())
                : true,
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-User-ID',
            'X-Correlation-ID',
            'X-API-Key',
        ],
    });

    // Global validation
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
        }),
    );

    // Graceful shutdown
    app.enableShutdownHooks();

    // OpenAPI docs
    const config = new DocumentBuilder()
        .setTitle('Survey Engine API')
        .setDescription(
            'Standalone SurveyJS-compatible survey backend. ' +
                'Pass an optional X-User-ID header to attribute operations to a user.',
        )
        .setVersion('1.0')
        .addTag('surveys', 'Survey management endpoints')
        .addTag('responses', 'Response collection endpoints')
        .addTag('health', 'Health check endpoints')
        .addApiKey(
            { type: 'apiKey', name: 'X-User-ID', in: 'header' },
            'user-id',
        )
        .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    const port = process.env.PORT || 3000;
    await app.listen(port);

    const logger = app.get(Logger);
    logger.log(`Survey Engine running on port ${port}`);
    logger.log(`API docs: http://localhost:${port}/api/docs`);
}

void bootstrap();
