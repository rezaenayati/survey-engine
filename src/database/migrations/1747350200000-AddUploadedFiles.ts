import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUploadedFiles1747350200000 implements MigrationInterface {
    name = 'AddUploadedFiles1747350200000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."uploaded_files_storageprovider_enum" AS ENUM('local', 's3');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "uploaded_files" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdBy"       character varying(255),
        "originalName"    character varying(255) NOT NULL,
        "mimeType"        character varying(255) NOT NULL,
        "size"            integer NOT NULL,
        "storageProvider" "public"."uploaded_files_storageprovider_enum" NOT NULL DEFAULT 'local',
        "storageKey"      character varying(1024) NOT NULL,
        "bucket"          character varying(255),
        "url"             character varying(2048),
        "metadata"        jsonb NOT NULL DEFAULT '{}',
        "createdAt"       TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_uploaded_files" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_uploaded_files_createdBy" ON "uploaded_files" ("createdBy")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_uploaded_files_createdAt" ON "uploaded_files" ("createdAt")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX IF EXISTS "IDX_uploaded_files_createdAt"`,
        );
        await queryRunner.query(
            `DROP INDEX IF EXISTS "IDX_uploaded_files_createdBy"`,
        );
        await queryRunner.query(`DROP TABLE IF EXISTS "uploaded_files"`);
        await queryRunner.query(
            `DROP TYPE IF EXISTS "public"."uploaded_files_storageprovider_enum"`,
        );
    }
}
