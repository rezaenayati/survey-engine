import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1747350000000 implements MigrationInterface {
    name = 'InitialSchema1747350000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // surveys_status enum — DO block tolerates "already exists" from a prior synchronize run
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."surveys_status_enum" AS ENUM('draft', 'published', 'archived');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

        // surveys table
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "surveys" (
        "id"              uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "createdBy"       character varying(255),
        "name"            character varying(255) NOT NULL,
        "description"     character varying(500),
        "status"          "public"."surveys_status_enum" NOT NULL DEFAULT 'draft',
        "activeVersionId" uuid,
        "draftSchemaJson" jsonb,
        "draftLogicJson"  jsonb,
        "settings"        jsonb NOT NULL DEFAULT '{"allowAnonymous":true,"requireAuth":false,"accessTokenRequired":false}',
        "createdAt"       TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_surveys" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_surveys_status"    ON "surveys" ("status")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_surveys_createdAt" ON "surveys" ("createdAt")`,
        );

        // survey_versions table
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "survey_versions" (
        "id"            uuid    NOT NULL DEFAULT uuid_generate_v4(),
        "surveyId"      uuid    NOT NULL,
        "versionNumber" integer NOT NULL,
        "schemaJson"    jsonb   NOT NULL,
        "logicJson"     jsonb,
        "publishedBy"   character varying(255),
        "checksum"      character varying(64) NOT NULL,
        "isDeprecated"  boolean NOT NULL DEFAULT false,
        "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_survey_versions" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_survey_versions_surveyId"              ON "survey_versions" ("surveyId")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_survey_versions_surveyId_versionNumber" ON "survey_versions" ("surveyId", "versionNumber")`,
        );

        // FK: surveys.activeVersionId → survey_versions.id (SET NULL on delete)
        await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "surveys"
          ADD CONSTRAINT "FK_surveys_activeVersionId"
          FOREIGN KEY ("activeVersionId") REFERENCES "survey_versions"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

        // FK: survey_versions.surveyId → surveys.id (CASCADE on delete)
        await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "survey_versions"
          ADD CONSTRAINT "FK_survey_versions_surveyId"
          FOREIGN KEY ("surveyId") REFERENCES "surveys"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

        // responses_status enum
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."responses_status_enum" AS ENUM('started', 'in_progress', 'completed', 'abandoned');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

        // responses table
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "responses" (
        "id"              uuid    NOT NULL DEFAULT uuid_generate_v4(),
        "surveyId"        uuid    NOT NULL,
        "surveyVersionId" uuid    NOT NULL,
        "respondentId"    character varying(255),
        "answersJson"     jsonb   NOT NULL DEFAULT '{}',
        "metadata"        jsonb   NOT NULL DEFAULT '{}',
        "status"          "public"."responses_status_enum" NOT NULL DEFAULT 'started',
        "startedAt"       TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMP NOT NULL DEFAULT now(),
        "completedAt"     TIMESTAMP,
        CONSTRAINT "PK_responses" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_responses_surveyId_status" ON "responses" ("surveyId", "status")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_responses_surveyVersionId"  ON "responses" ("surveyVersionId")`,
        );

        await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "responses"
          ADD CONSTRAINT "FK_responses_surveyId"
          FOREIGN KEY ("surveyId") REFERENCES "surveys"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

        await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "responses"
          ADD CONSTRAINT "FK_responses_surveyVersionId"
          FOREIGN KEY ("surveyVersionId") REFERENCES "survey_versions"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "responses" DROP CONSTRAINT "FK_responses_surveyVersionId"`,
        );
        await queryRunner.query(
            `ALTER TABLE "responses" DROP CONSTRAINT "FK_responses_surveyId"`,
        );
        await queryRunner.query(`DROP TABLE "responses"`);
        await queryRunner.query(`DROP TYPE "public"."responses_status_enum"`);

        await queryRunner.query(
            `ALTER TABLE "survey_versions" DROP CONSTRAINT "FK_survey_versions_surveyId"`,
        );
        await queryRunner.query(
            `ALTER TABLE "surveys" DROP CONSTRAINT "FK_surveys_activeVersionId"`,
        );
        await queryRunner.query(`DROP TABLE "survey_versions"`);
        await queryRunner.query(`DROP TABLE "surveys"`);
        await queryRunner.query(`DROP TYPE "public"."surveys_status_enum"`);
    }
}
