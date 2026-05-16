import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { Readable } from 'stream';
import { FilesService } from '../../../src/files/files.service';
import {
    FileStorageProvider,
    UploadedFile,
} from '../../../src/files/entities/uploaded-file.entity';
import { FILE_STORAGE } from '../../../src/files/storage/file-storage.interface';
import { SurveyVersionsService } from '../../../src/surveys/survey-versions.service';
import { RequestContext } from '../../../src/common/interfaces/request-context.interface';

function ctx(userId: string): RequestContext {
    return { userId, correlationId: 'corr-1' };
}

function multerFile(overrides: Partial<Express.Multer.File> = {}) {
    const buffer = Buffer.from('hello');
    return {
        fieldname: 'file',
        originalname: 'report.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: buffer.length,
        buffer,
        ...overrides,
    } as Express.Multer.File;
}

describe('FilesService', () => {
    const savedFiles: UploadedFile[] = [];
    const storage = {
        store: jest.fn(),
        read: jest.fn(),
        delete: jest.fn(),
    };
    const repository = {
        create: jest.fn((input: Partial<UploadedFile>) => input),
        save: jest.fn(async (file: UploadedFile) => {
            const saved = {
                id: 'file-1',
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                ...file,
            } as UploadedFile;
            savedFiles.push(saved);
            return saved;
        }),
        findOne: jest.fn(),
        remove: jest.fn(),
    };
    const versions = {
        getRuntime: jest.fn(),
    };

    let service: FilesService;

    beforeEach(async () => {
        jest.clearAllMocks();
        savedFiles.length = 0;
        storage.store.mockResolvedValue({
            storageKey: 'user-1/2026-01-01/file.pdf',
            bucket: null,
            url: null,
        });
        storage.read.mockResolvedValue({
            stream: Readable.from(['hello']),
        });

        const module = await Test.createTestingModule({
            providers: [
                FilesService,
                {
                    provide: getRepositoryToken(UploadedFile),
                    useValue: repository,
                },
                {
                    provide: FILE_STORAGE,
                    useValue: storage,
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn(
                            (key: string, fallback?: unknown): unknown => {
                                const values: Record<string, unknown> = {
                                    FILE_STORAGE_DRIVER: 'local',
                                    FILE_MAX_SIZE_BYTES: 100,
                                };
                                return values[key] ?? fallback;
                            },
                        ),
                    },
                },
                {
                    provide: SurveyVersionsService,
                    useValue: versions,
                },
            ],
        }).compile();

        service = module.get(FilesService);
    });

    it('stores file bytes and persists metadata', async () => {
        const file = await service.upload(ctx('user-1'), multerFile(), {});

        expect(storage.store).toHaveBeenCalledWith(
            expect.objectContaining({
                buffer: Buffer.from('hello'),
                originalName: 'report.pdf',
                mimeType: 'application/pdf',
            }),
        );
        expect(file.id).toBe('file-1');
        expect(file.storageProvider).toBe(FileStorageProvider.LOCAL);
        expect(file.createdBy).toBe('user-1');
    });

    it('rejects missing file', async () => {
        await expect(service.upload(ctx('u'), undefined)).rejects.toThrow(
            BadRequestException,
        );
    });

    it('rejects empty file', async () => {
        await expect(
            service.upload(
                ctx('u'),
                multerFile({ buffer: Buffer.alloc(0), size: 0 }),
            ),
        ).rejects.toThrow(BadRequestException);
    });

    it('rejects files larger than the global limit', async () => {
        await expect(
            service.upload(
                ctx('u'),
                multerFile({ buffer: Buffer.alloc(101), size: 101 }),
            ),
        ).rejects.toThrow(BadRequestException);
    });

    it('enforces question-level maxFileSize and allowedFileTypes', async () => {
        versions.getRuntime.mockResolvedValue({
            schemaJson: {
                pages: [
                    {
                        elements: [
                            {
                                name: 'upload',
                                type: 'file',
                                acceptedTypes: 'image/*',
                                maxSize: 10,
                            },
                        ],
                    },
                ],
            },
        });

        await expect(
            service.upload(
                ctx('u'),
                multerFile({
                    mimetype: 'application/pdf',
                    size: 11,
                    buffer: Buffer.alloc(11),
                }),
                {
                    surveyId: '00000000-0000-0000-0000-000000000001',
                    questionId: 'upload',
                },
            ),
        ).rejects.toThrow(BadRequestException);
    });

    it('allows question-level wildcard MIME match', async () => {
        versions.getRuntime.mockResolvedValue({
            schemaJson: {
                pages: [
                    {
                        elements: [
                            {
                                name: 'upload',
                                type: 'file',
                                acceptedTypes: 'image/*',
                                maxSize: 100,
                            },
                        ],
                    },
                ],
            },
        });

        const file = await service.upload(
            ctx('u'),
            multerFile({
                originalname: 'photo.png',
                mimetype: 'image/png',
            }),
            {
                surveyId: '00000000-0000-0000-0000-000000000001',
                questionId: 'upload',
            },
        );

        expect(file.id).toBe('file-1');
    });

    it('opens files for streaming', async () => {
        const existing = {
            id: 'file-1',
            createdBy: 'user-1',
            originalName: 'report.pdf',
            mimeType: 'application/pdf',
            size: 5,
            storageProvider: FileStorageProvider.LOCAL,
            storageKey: 'key',
            bucket: null,
            url: null,
            metadata: {},
            createdAt: new Date(),
        } as UploadedFile;
        repository.findOne.mockResolvedValue(existing);

        const opened = await service.open(ctx('user-1'), 'file-1');

        expect(opened.file).toBe(existing);
        expect(opened.contentType).toBe('application/pdf');
        expect(opened.contentLength).toBe(5);
    });

    it('forbids access to another user file', async () => {
        repository.findOne.mockResolvedValue({
            id: 'file-1',
            createdBy: 'owner',
        } as UploadedFile);

        await expect(service.findOne(ctx('other'), 'file-1')).rejects.toThrow(
            ForbiddenException,
        );
    });

    it('deletes storage object then removes metadata', async () => {
        const existing = {
            id: 'file-1',
            createdBy: 'user-1',
            storageKey: 'key',
        } as UploadedFile;
        repository.findOne.mockResolvedValue(existing);

        await service.remove(ctx('user-1'), 'file-1');

        expect(storage.delete).toHaveBeenCalledWith('key');
        expect(repository.remove).toHaveBeenCalledWith(existing);
    });
});
