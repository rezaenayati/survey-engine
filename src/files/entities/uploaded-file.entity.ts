import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
} from 'typeorm';

export enum FileStorageProvider {
    LOCAL = 'local',
    S3 = 's3',
    FIREBASE = 'firebase',
}

@Entity('uploaded_files')
@Index(['createdBy'])
@Index(['createdAt'])
export class UploadedFile {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /** User ID of the uploader, when the deployment forwards X-User-ID. */
    @Column({ type: 'varchar', length: 255, nullable: true })
    createdBy: string | null;

    @Column({ type: 'varchar', length: 255 })
    originalName: string;

    @Column({ type: 'varchar', length: 255 })
    mimeType: string;

    @Column({ type: 'integer' })
    size: number;

    @Column({
        type: 'enum',
        enum: FileStorageProvider,
        default: FileStorageProvider.LOCAL,
    })
    storageProvider: FileStorageProvider;

    /** Local relative path or object key for cloud providers. */
    @Column({ type: 'varchar', length: 1024 })
    storageKey: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    bucket: string | null;

    @Column({ type: 'varchar', length: 2048, nullable: true })
    url: string | null;

    /** Optional context for per-question validation and cleanup workflows. */
    @Column('jsonb', { default: {} })
    metadata: Record<string, unknown>;

    @CreateDateColumn()
    createdAt: Date;
}
