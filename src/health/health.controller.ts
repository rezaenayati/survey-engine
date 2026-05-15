import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@ApiTags('health')
@Controller('health')
export class HealthController {
    constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

    @Get()
    @ApiOperation({ summary: 'Liveness check — service is up' })
    @ApiResponse({ status: 200, description: 'Service is alive' })
    check() {
        return {
            status: 'ok',
            service: 'survey-engine',
            timestamp: new Date().toISOString(),
        };
    }

    @Get('ready')
    @ApiOperation({ summary: 'Readiness check — DB is reachable' })
    @ApiResponse({
        status: 200,
        description: 'Service is ready to accept traffic',
    })
    @ApiResponse({ status: 503, description: 'Database not reachable' })
    async ready() {
        try {
            await this.dataSource.query('SELECT 1');
            return {
                status: 'ok',
                service: 'survey-engine',
                timestamp: new Date().toISOString(),
                checks: { database: 'ok' },
            };
        } catch {
            throw new ServiceUnavailableException({
                status: 'error',
                service: 'survey-engine',
                timestamp: new Date().toISOString(),
                checks: { database: 'unavailable' },
            });
        }
    }
}
