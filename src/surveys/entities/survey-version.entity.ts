import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { Survey } from './survey.entity';

@Entity('survey_versions')
@Index(['surveyId', 'versionNumber'])
export class SurveyVersion {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('uuid')
    @Index()
    surveyId: string;

    @ManyToOne(() => Survey, (survey) => survey.versions, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'surveyId' })
    survey: Survey;

    @Column('int')
    versionNumber: number;

    /** Immutable survey schema snapshot */
    @Column('jsonb')
    schemaJson: Record<string, unknown>;

    /** Immutable logic rules snapshot */
    @Column('jsonb', { nullable: true })
    logicJson: Record<string, unknown> | null;

    /** External reference to Auth Service (user who published) */
    @Column({ type: 'varchar', length: 255, nullable: true })
    publishedBy: string | null;

    /** SHA-256 hash of schema for integrity verification */
    @Column({ length: 64 })
    checksum: string;

    @Column({ default: false })
    isDeprecated: boolean;

    @CreateDateColumn()
    createdAt: Date;
}
