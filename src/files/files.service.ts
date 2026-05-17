import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import {
    UploadedFile,
    FileStorageProvider,
} from './entities/uploaded-file.entity';
import {
    FILE_STORAGE,
    FileStorage,
    ReadStoredFile,
} from './storage/file-storage.interface';
import { RequestContext } from '../common/interfaces/request-context.interface';
import { SurveyVersionsService } from '../surveys/survey-versions.service';
import { SurveySchema } from '../schema';
import { ErrorCodes } from '../common/errors/error-codes';

interface FileQuestionRules {
    allowedFileTypes?: string[];
    maxFileSize?: number;
}

export interface OpenFileResult {
    file: UploadedFile;
    stream: ReadStoredFile['stream'];
    contentType: string;
    contentLength: number;
}

@Injectable()
export class FilesService {
    private readonly provider: FileStorageProvider;
    private readonly maxFileSizeBytes: number;

    constructor(
        @InjectRepository(UploadedFile)
        private readonly fileRepository: Repository<UploadedFile>,
        @Inject(FILE_STORAGE)
        private readonly storage: FileStorage,
        private readonly config: ConfigService,
        private readonly surveyVersionsService: SurveyVersionsService,
    ) {
        this.provider =
            this.config.get<string>('FILE_STORAGE_DRIVER') === 's3'
                ? FileStorageProvider.S3
                : this.config.get<string>('FILE_STORAGE_DRIVER') === 'firebase'
                  ? FileStorageProvider.FIREBASE
                  : FileStorageProvider.LOCAL;
        this.maxFileSizeBytes = this.config.get<number>(
            'FILE_MAX_SIZE_BYTES',
            25 * 1024 * 1024,
        );
    }

    async upload(
        ctx: RequestContext,
        file: Express.Multer.File | undefined,
        options: { surveyId?: string; questionId?: string } = {},
    ): Promise<UploadedFile> {
        if (!file) {
            throw new BadRequestException({
                code: ErrorCodes.INVALID_FILE,
                message: 'No file uploaded',
            });
        }
        if (!file.buffer || file.buffer.length === 0) {
            throw new BadRequestException({
                code: ErrorCodes.INVALID_FILE,
                message: 'Uploaded file is empty',
            });
        }
        if (file.size > this.maxFileSizeBytes) {
            throw new BadRequestException({
                code: ErrorCodes.FILE_TOO_LARGE,
                message: `File exceeds maximum size of ${this.maxFileSizeBytes} bytes`,
            });
        }

        const rules = await this.loadQuestionRules(ctx, options);
        this.assertFileMatchesRules(file, rules);

        const storageKey = this.buildStorageKey(ctx, file.originalname);
        const stored = await this.storage.store({
            buffer: file.buffer,
            originalName: file.originalname,
            mimeType: file.mimetype,
            storageKey,
        });

        const entity = this.fileRepository.create({
            createdBy: ctx.userId || null,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            storageProvider: this.provider,
            storageKey: stored.storageKey,
            bucket: stored.bucket,
            url: stored.url,
            metadata: {
                surveyId: options.surveyId,
                questionId: options.questionId,
            },
        });

        return this.fileRepository.save(entity);
    }

    async findOne(ctx: RequestContext, id: string): Promise<UploadedFile> {
        const file = await this.fileRepository.findOne({ where: { id } });
        if (!file) {
            throw new NotFoundException({
                code: ErrorCodes.FILE_NOT_FOUND,
                message: `File with ID "${id}" not found`,
            });
        }
        this.assertAccess(ctx, file);
        return file;
    }

    async open(ctx: RequestContext, id: string): Promise<OpenFileResult> {
        const file = await this.findOne(ctx, id);
        const stored = await this.storage.read(file.storageKey);

        return {
            file,
            stream: stored.stream,
            contentType: stored.contentType ?? file.mimeType,
            contentLength: stored.contentLength ?? file.size,
        };
    }

    async remove(ctx: RequestContext, id: string): Promise<void> {
        const file = await this.findOne(ctx, id);
        await this.storage.delete(file.storageKey);
        await this.fileRepository.remove(file);
    }

    toResponse(file: UploadedFile): Record<string, unknown> {
        return {
            id: file.id,
            originalName: file.originalName,
            mimeType: file.mimeType,
            size: file.size,
            storageProvider: file.storageProvider,
            url: file.url ?? this.localDownloadUrl(file),
            createdAt: file.createdAt,
        };
    }

    private assertAccess(ctx: RequestContext, file: UploadedFile): void {
        if (file.createdBy && ctx.userId && file.createdBy !== ctx.userId) {
            throw new ForbiddenException({
                code: ErrorCodes.FORBIDDEN,
                message: 'You do not have access to this file',
            });
        }
    }

    private localDownloadUrl(file: UploadedFile): string | null {
        if (file.storageProvider !== FileStorageProvider.LOCAL) return null;

        const baseUrl = this.config.get<string>('FILE_PUBLIC_BASE_URL');
        return baseUrl
            ? `${baseUrl.replace(/\/$/, '')}/files/${file.id}`
            : null;
    }

    private buildStorageKey(ctx: RequestContext, originalName: string): string {
        const owner = this.safePathSegment(ctx.userId || 'anonymous');
        const extension = extname(originalName).toLowerCase();
        return `${owner}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extension}`;
    }

    private safePathSegment(value: string): string {
        return value.replace(/[^a-zA-Z0-9._-]/g, '_');
    }

    private async loadQuestionRules(
        ctx: RequestContext,
        options: { surveyId?: string; questionId?: string },
    ): Promise<FileQuestionRules | null> {
        if (!options.surveyId || !options.questionId) {
            return null;
        }

        const version = await this.surveyVersionsService.getRuntime(
            ctx,
            options.surveyId,
        );
        const question = this.findQuestion(
            version.schemaJson,
            options.questionId,
        );

        if (!question) {
            throw new BadRequestException({
                code: ErrorCodes.INVALID_FILE,
                message: `Question "${options.questionId}" was not found in survey "${options.surveyId}"`,
            });
        }

        return this.extractFileRules(question);
    }

    private findQuestion(
        schema: SurveySchema | Record<string, unknown>,
        questionId: string,
    ): Record<string, unknown> | null {
        const pages = (schema as Record<string, unknown>).pages;
        if (!Array.isArray(pages)) return null;

        for (const page of pages) {
            const pageObj = page as Record<string, unknown>;
            const elements = pageObj.questions ?? pageObj.elements;
            if (!Array.isArray(elements)) continue;

            for (const element of elements) {
                const question = element as Record<string, unknown>;
                if (
                    question.id === questionId ||
                    question.name === questionId
                ) {
                    return question;
                }
            }
        }

        return null;
    }

    private extractFileRules(
        question: Record<string, unknown>,
    ): FileQuestionRules {
        const validation =
            (question.validation as Record<string, unknown> | undefined) ?? {};

        return {
            allowedFileTypes: this.normalizeAllowedTypes(
                validation.allowedFileTypes ?? question.acceptedTypes,
            ),
            maxFileSize: this.normalizePositiveNumber(
                validation.maxFileSize ??
                    question.maxFileSize ??
                    question.maxSize,
            ),
        };
    }

    private normalizeAllowedTypes(value: unknown): string[] | undefined {
        if (Array.isArray(value)) {
            return value
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter(Boolean);
        }

        if (typeof value === 'string') {
            return value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
        }

        return undefined;
    }

    private normalizePositiveNumber(value: unknown): number | undefined {
        if (typeof value === 'number' && value > 0) return value;
        if (typeof value === 'string') {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
        return undefined;
    }

    private assertFileMatchesRules(
        file: Express.Multer.File,
        rules: FileQuestionRules | null,
    ): void {
        if (!rules) return;

        if (rules.maxFileSize !== undefined && file.size > rules.maxFileSize) {
            throw new BadRequestException({
                code: ErrorCodes.FILE_TOO_LARGE,
                message: `File exceeds question maximum size of ${rules.maxFileSize} bytes`,
            });
        }

        if (
            rules.allowedFileTypes &&
            rules.allowedFileTypes.length > 0 &&
            !this.matchesAllowedType(
                file.mimetype,
                file.originalname,
                rules.allowedFileTypes,
            )
        ) {
            throw new BadRequestException({
                code: ErrorCodes.FILE_TYPE_NOT_ALLOWED,
                message: `File type "${file.mimetype}" is not allowed for this question`,
            });
        }
    }

    private matchesAllowedType(
        mimeType: string,
        originalName: string,
        allowedTypes: string[],
    ): boolean {
        const extension = extname(originalName).toLowerCase();
        return allowedTypes.some((allowed) => {
            const value = allowed.toLowerCase();
            if (value.endsWith('/*')) {
                return mimeType.toLowerCase().startsWith(value.slice(0, -1));
            }
            if (value.startsWith('.')) {
                return extension === value;
            }
            return mimeType.toLowerCase() === value;
        });
    }
}
