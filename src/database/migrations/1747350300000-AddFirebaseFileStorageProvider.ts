import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFirebaseFileStorageProvider1747350300000 implements MigrationInterface {
    name = 'AddFirebaseFileStorageProvider1747350300000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "public"."uploaded_files_storageprovider_enum" ADD VALUE 'firebase';
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);
    }

    public async down(): Promise<void> {
        // PostgreSQL does not support removing enum values in-place safely.
        // Kept as no-op to avoid destructive enum/table rewrites.
    }
}
