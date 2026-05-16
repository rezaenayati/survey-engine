import { Readable } from 'stream';

export const FILE_STORAGE = Symbol('FILE_STORAGE');

export interface StoreFileInput {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    storageKey: string;
}

export interface StoredFile {
    storageKey: string;
    bucket: string | null;
    url: string | null;
}

export interface ReadStoredFile {
    stream: Readable;
    contentType?: string;
    contentLength?: number;
}

export interface FileStorage {
    store(input: StoreFileInput): Promise<StoredFile>;
    read(storageKey: string): Promise<ReadStoredFile>;
    delete(storageKey: string): Promise<void>;
}
