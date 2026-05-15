import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop the legacy tenantId column from surveys.
 * Multi-tenancy was removed; the column is a leftover from an old synchronize-mode schema.
 */
export class DropTenantId1747350100000 implements MigrationInterface {
  name = 'DropTenantId1747350100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "surveys" DROP COLUMN IF EXISTS "tenantId"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "tenantId" character varying(255)
    `);
  }
}
