import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { PassThrough, Readable } from 'stream';
import {
    FileStorage,
    ReadStoredFile,
    StoreFileInput,
    StoredFile,
} from './file-storage.interface';

@Injectable()
export class S3FileStorage implements FileStorage {
    private readonly client: S3Client;
    private readonly bucket: string;
    private readonly publicBaseUrl: string | null;

    constructor(config: ConfigService) {
        const bucket = config.get<string>('S3_BUCKET');
        if (!bucket) {
            throw new BadRequestException(
                'S3_BUCKET is required when FILE_STORAGE_DRIVER=s3',
            );
        }

        this.bucket = bucket;
        this.publicBaseUrl = config.get<string>('S3_PUBLIC_BASE_URL') ?? null;
        this.client = new S3Client({
            region: config.get<string>('S3_REGION', 'us-east-1'),
            endpoint: config.get<string>('S3_ENDPOINT'),
            forcePathStyle:
                config.get<string>('S3_FORCE_PATH_STYLE') === 'true',
        });
    }

    async store(input: StoreFileInput): Promise<StoredFile> {
        await this.client.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: input.storageKey,
                Body: input.buffer,
                ContentType: input.mimeType,
                Metadata: {
                    originalName: input.originalName,
                },
            }),
        );

        return {
            storageKey: input.storageKey,
            bucket: this.bucket,
            url: this.publicBaseUrl
                ? `${this.publicBaseUrl.replace(/\/$/, '')}/${input.storageKey}`
                : null,
        };
    }

    async read(storageKey: string): Promise<ReadStoredFile> {
        const result = await this.client.send(
            new GetObjectCommand({
                Bucket: this.bucket,
                Key: storageKey,
            }),
        );

        if (!result.Body) {
            throw new BadRequestException('Stored file has no body');
        }

        return {
            stream: this.toReadable(result.Body),
            contentType: result.ContentType,
            contentLength: result.ContentLength,
        };
    }

    async delete(storageKey: string): Promise<void> {
        await this.client.send(
            new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: storageKey,
            }),
        );
    }

    private toReadable(body: unknown): Readable {
        if (body instanceof Readable) {
            return body;
        }

        const maybeTransform = body as {
            transformToByteArray?: () => Promise<Uint8Array>;
        };

        if (typeof maybeTransform.transformToByteArray === 'function') {
            const stream = new PassThrough();
            void maybeTransform
                .transformToByteArray()
                .then((bytes) => {
                    stream.end(Buffer.from(bytes));
                })
                .catch((error: unknown) => stream.destroy(error as Error));
            return stream;
        }

        throw new BadRequestException('Stored file body is not readable');
    }
}
