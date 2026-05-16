import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join, normalize } from 'path';
import {
    FileStorage,
    ReadStoredFile,
    StoreFileInput,
    StoredFile,
} from './file-storage.interface';

@Injectable()
export class LocalFileStorage implements FileStorage {
    private readonly uploadDir: string;

    constructor(config: ConfigService) {
        this.uploadDir = config.get<string>('FILE_LOCAL_DIR', 'uploads');
    }

    async store(input: StoreFileInput): Promise<StoredFile> {
        const absolutePath = this.toAbsolutePath(input.storageKey);
        await mkdir(dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, input.buffer);

        return {
            storageKey: input.storageKey,
            bucket: null,
            url: null,
        };
    }

    read(storageKey: string): Promise<ReadStoredFile> {
        return Promise.resolve({
            stream: createReadStream(this.toAbsolutePath(storageKey)),
        });
    }

    async delete(storageKey: string): Promise<void> {
        await unlink(this.toAbsolutePath(storageKey)).catch(
            (error: unknown) => {
                const err = error as NodeJS.ErrnoException;
                if (err.code !== 'ENOENT') {
                    throw err;
                }
            },
        );
    }

    private toAbsolutePath(storageKey: string): string {
        const normalizedKey = normalize(storageKey).replace(
            /^(\.\.[/\\])+/,
            '',
        );
        return join(process.cwd(), this.uploadDir, normalizedKey);
    }
}
