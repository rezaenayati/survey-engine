import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookService } from './webhook.service';
import { WebhookDispatcherService } from './webhook-dispatcher.service';

@Module({
    imports: [TypeOrmModule.forFeature([WebhookDelivery])],
    providers: [WebhookService, WebhookDispatcherService],
    exports: [WebhookService],
})
export class WebhooksModule {}
