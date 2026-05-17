import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import {
    FileStorage,
    ReadStoredFile,
    StoreFileInput,
    StoredFile,
} from './file-storage.interface';
import { ErrorCodes } from '../../common/errors/error-codes';

@Injectable()
export class FirebaseFileStorage implements FileStorage {
    private readonly bucketName: string;
    private readonly publicBaseUrl: string | null;

    constructor(config: ConfigService) {
        const bucketName = config.get<string>('FIREBASE_STORAGE_BUCKET');
        if (!bucketName) {
            throw new BadRequestException({
                code: ErrorCodes.MISCONFIGURED,
                message:
                    'FIREBASE_STORAGE_BUCKET is required when FILE_STORAGE_DRIVER=firebase',
            });
        }
        this.bucketName = bucketName;
        this.publicBaseUrl =
            config.get<string>('FIREBASE_PUBLIC_BASE_URL') ?? null;

        this.initializeFirebase(config);
    }

    async store(input: StoreFileInput): Promise<StoredFile> {
        const bucket = getStorage().bucket(this.bucketName);
        const object = bucket.file(input.storageKey);
        await object.save(input.buffer, {
            contentType: input.mimeType,
            metadata: {
                metadata: {
                    originalName: input.originalName,
                },
            },
        });

        return {
            storageKey: input.storageKey,
            bucket: this.bucketName,
            url: this.publicBaseUrl
                ? `${this.publicBaseUrl.replace(/\/$/, '')}/${input.storageKey}`
                : null,
        };
    }

    async read(storageKey: string): Promise<ReadStoredFile> {
        const bucket = getStorage().bucket(this.bucketName);
        const object = bucket.file(storageKey);
        const [metadata] = await object.getMetadata();
        const parsedContentLength =
            metadata.size !== undefined ? Number(metadata.size) : undefined;

        return {
            stream: object.createReadStream(),
            contentType: metadata.contentType,
            contentLength:
                parsedContentLength !== undefined &&
                Number.isFinite(parsedContentLength)
                    ? parsedContentLength
                    : undefined,
        };
    }

    async delete(storageKey: string): Promise<void> {
        const bucket = getStorage().bucket(this.bucketName);
        await bucket.file(storageKey).delete({ ignoreNotFound: true });
    }

    private initializeFirebase(config: ConfigService): void {
        if (getApps().length > 0) {
            return;
        }

        const projectId = config.get<string>('FIREBASE_PROJECT_ID');
        const clientEmail = config.get<string>('FIREBASE_CLIENT_EMAIL');
        const privateKey = config.get<string>('FIREBASE_PRIVATE_KEY');

        if (projectId && clientEmail && privateKey) {
            initializeApp({
                credential: cert({
                    projectId,
                    clientEmail,
                    privateKey: privateKey.replace(/\\n/g, '\n'),
                }),
                storageBucket: this.bucketName,
            });
            return;
        }

        const appName =
            config.get<string>('FIREBASE_APP_NAME') ?? 'survey-engine-firebase';
        if (getApps().some((app) => app.name === appName)) {
            getApp(appName);
            return;
        }

        initializeApp(
            {
                storageBucket: this.bucketName,
            },
            appName,
        );
    }
}
