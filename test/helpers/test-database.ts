import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { Survey } from '../../src/surveys/entities/survey.entity';
import { SurveyVersion } from '../../src/surveys/entities/survey-version.entity';
import { Response } from '../../src/responses/entities/response.entity';

let container: StartedPostgreSqlContainer;
let dataSource: DataSource;

export async function startTestDatabase(): Promise<{
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}> {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('survey_engine_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  dataSource = new DataSource({
    type: 'postgres',
    host: container.getHost(),
    port: container.getPort(),
    username: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
    entities: [Survey, SurveyVersion, Response],
    synchronize: true,
    logging: false,
  });

  await dataSource.initialize();

  return {
    host: container.getHost(),
    port: container.getPort(),
    username: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
  };
}

export function getDataSource(): DataSource {
  if (!dataSource?.isInitialized) {
    throw new Error('Test database has not been started yet');
  }
  return dataSource;
}

export async function stopTestDatabase(): Promise<void> {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
  }
  if (container) {
    await container.stop();
  }
}
