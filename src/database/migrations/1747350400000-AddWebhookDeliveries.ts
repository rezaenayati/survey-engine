import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebhookDeliveries1747350400000 implements MigrationInterface {
    name = 'AddWebhookDeliveries1747350400000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."webhook_deliveries_status_enum" AS ENUM('pending', 'delivered', 'failed');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
        "id"                  uuid NOT NULL DEFAULT uuid_generate_v4(),
        "event"               character varying(64) NOT NULL,
        "surveyId"            uuid NOT NULL,
        "responseId"          uuid NOT NULL,
        "respondentId"        character varying(255),
        "url"                 character varying(2048) NOT NULL,
        "secret"              character varying(512),
        "payload"             jsonb NOT NULL,
        "status"              "public"."webhook_deliveries_status_enum" NOT NULL DEFAULT 'pending',
        "attempts"            integer NOT NULL DEFAULT 0,
        "nextAttemptAt"       TIMESTAMPTZ NOT NULL,
        "lastAttemptAt"       TIMESTAMPTZ,
        "lastResponseStatus"  integer,
        "lastError"           character varying(1024),
        "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_deliveries" PRIMARY KEY ("id")
      )
    `);

        // Composite index drives the worker's poll query.
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_webhook_deliveries_status_nextAttemptAt" ON "webhook_deliveries" ("status", "nextAttemptAt")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_webhook_deliveries_surveyId" ON "webhook_deliveries" ("surveyId")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_webhook_deliveries_responseId" ON "webhook_deliveries" ("responseId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX IF EXISTS "IDX_webhook_deliveries_responseId"`,
        );
        await queryRunner.query(
            `DROP INDEX IF EXISTS "IDX_webhook_deliveries_surveyId"`,
        );
        await queryRunner.query(
            `DROP INDEX IF EXISTS "IDX_webhook_deliveries_status_nextAttemptAt"`,
        );
        await queryRunner.query(`DROP TABLE IF EXISTS "webhook_deliveries"`);
        await queryRunner.query(
            `DROP TYPE IF EXISTS "public"."webhook_deliveries_status_enum"`,
        );
    }
}
