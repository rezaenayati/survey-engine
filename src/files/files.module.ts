import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { UploadedFile } from './entities/uploaded-file.entity';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FILE_STORAGE } from './storage/file-storage.interface';
import { LocalFileStorage } from './storage/local-file.storage';
import { S3FileStorage } from './storage/s3-file.storage';
import { SurveysModule } from '../surveys/surveys.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([UploadedFile]),
        ConfigModule,
        SurveysModule,
        MulterModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                storage: memoryStorage(),
                limits: {
                    fileSize: config.get<number>(
                        'FILE_MAX_SIZE_BYTES',
                        25 * 1024 * 1024,
                    ),
                },
            }),
        }),
    ],
    controllers: [FilesController],
    providers: [
        FilesService,
        {
            provide: FILE_STORAGE,
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                return config.get<string>('FILE_STORAGE_DRIVER') === 's3'
                    ? new S3FileStorage(config)
                    : new LocalFileStorage(config);
            },
        },
    ],
    exports: [FilesService],
})
export class FilesModule {}
