/**
 * Survey Schema Type Definitions
 * These interfaces define the structure of survey definitions (schemaJson)
 */

/**
 * Supported question types
 */
export enum QuestionType {
    TEXT = 'text',
    TEXTAREA = 'textarea',
    NUMBER = 'number',
    EMAIL = 'email',
    PHONE = 'phone',
    DATE = 'date',
    TIME = 'time',
    DATETIME = 'datetime',
    SINGLE_CHOICE = 'single_choice',
    MULTIPLE_CHOICE = 'multiple_choice',
    DROPDOWN = 'dropdown',
    RATING = 'rating',
    SCALE = 'scale',
    BOOLEAN = 'boolean',
    FILE = 'file',
    MATRIX = 'matrix',
    RANKING = 'ranking',
    SIGNATURE = 'signature',
}

/**
 * Validation rules for a question
 */
export interface QuestionValidation {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    patternMessage?: string;
    minSelections?: number;
    maxSelections?: number;
    allowedFileTypes?: string[];
    maxFileSize?: number; // in bytes
    customValidation?: string; // expression
}

/**
 * Choice option for single/multiple choice questions
 */
export interface ChoiceOption {
    id: string;
    label: string;
    value: string | number;
    order?: number;
    imageUrl?: string;
    isOther?: boolean; // "Other" option with text input
}

/**
 * Matrix row/column definition
 */
export interface MatrixItem {
    id: string;
    label: string;
    order?: number;
}

/**
 * Scale/Rating configuration
 */
export interface ScaleConfig {
    min: number;
    max: number;
    step?: number;
    minLabel?: string;
    maxLabel?: string;
    showLabels?: boolean;
}

/**
 * Question definition
 */
export interface Question {
    id: string;
    type: QuestionType;
    title: string;
    description?: string;
    placeholder?: string;
    helpText?: string;
    validation?: QuestionValidation;
    choices?: ChoiceOption[];
    matrixRows?: MatrixItem[];
    matrixColumns?: MatrixItem[];
    scaleConfig?: ScaleConfig;
    defaultValue?: unknown;
    metadata?: Record<string, unknown>;
}

/**
 * Page/Section in a survey
 */
export interface SurveyPage {
    id: string;
    title?: string;
    description?: string;
    questions: Question[];
    order?: number;
}

/**
 * Complete Survey Schema
 */
export interface SurveySchema {
    version: string; // Schema version (e.g., "1.0")
    title?: string;
    description?: string;
    pages: SurveyPage[];
    settings?: SurveySchemaSettings;
}

/**
 * Survey-level settings within schema
 */
export interface SurveySchemaSettings {
    showProgressBar?: boolean;
    showPageNumbers?: boolean;
    allowBackNavigation?: boolean;
    shuffleQuestions?: boolean;
    shuffleChoices?: boolean;
    completionMessage?: string;
}

/**
 * Type guard to check if value is a valid QuestionType
 */
export function isValidQuestionType(type: string): type is QuestionType {
    return Object.values(QuestionType).includes(type as QuestionType);
}
