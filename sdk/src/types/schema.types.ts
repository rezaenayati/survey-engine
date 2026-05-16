/**
 * SurveyJS-compatible survey schema types.
 * These mirror the server-side interfaces so frontend and backend share one definition.
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
    maxFileSize?: number;
}

export interface ChoiceOption {
    id: string;
    label: string;
    value: string | number;
    order?: number;
    isOther?: boolean;
}

export interface MatrixItem {
    id: string;
    label: string;
    order?: number;
}

export interface ScaleConfig {
    min: number;
    max: number;
    step?: number;
    minLabel?: string;
    maxLabel?: string;
}

export interface Question {
    id: string;
    type: QuestionType | string; // string allows SurveyJS native types
    title: string;
    description?: string;
    placeholder?: string;
    validation?: QuestionValidation;
    choices?: ChoiceOption[];
    matrixRows?: MatrixItem[];
    matrixColumns?: MatrixItem[];
    scaleConfig?: ScaleConfig;
    defaultValue?: unknown;
}

export interface SurveyPage {
    id: string;
    title?: string;
    description?: string;
    questions: Question[];
}

export interface SurveySchemaSettings {
    showProgressBar?: boolean;
    showPageNumbers?: boolean;
    allowBackNavigation?: boolean;
    shuffleQuestions?: boolean;
    completionMessage?: string;
}

/** Complete survey schema stored by survey-engine and rendered by SurveyJS */
export interface SurveySchema {
    version: string;
    title?: string;
    description?: string;
    pages: SurveyPage[];
    settings?: SurveySchemaSettings;
}

// ─── Logic ───────────────────────────────────────────────────────────────────

export enum ComparisonOperator {
    EQUALS = 'eq',
    NOT_EQUALS = 'neq',
    GREATER_THAN = 'gt',
    GREATER_THAN_OR_EQUALS = 'gte',
    LESS_THAN = 'lt',
    LESS_THAN_OR_EQUALS = 'lte',
    CONTAINS = 'contains',
    NOT_CONTAINS = 'not_contains',
    STARTS_WITH = 'starts_with',
    ENDS_WITH = 'ends_with',
    IS_EMPTY = 'is_empty',
    IS_NOT_EMPTY = 'is_not_empty',
    IN = 'in',
    NOT_IN = 'not_in',
    MATCHES = 'matches',
}

export enum LogicalOperator {
    AND = 'and',
    OR = 'or',
}

export interface Condition {
    questionId: string;
    operator: ComparisonOperator;
    value?: unknown;
}

export interface ConditionGroup {
    operator: LogicalOperator;
    conditions: (Condition | ConditionGroup)[];
}

export enum RuleType {
    VISIBILITY = 'visibility',
    SKIP = 'skip',
    REQUIRED = 'required',
    VALIDATION = 'validation',
    CALCULATED = 'calculated',
    JUMP = 'jump',
}

export interface RuleAction {
    type: RuleType;
    targetId: string;
    targetType: 'question' | 'page';
    value?: unknown;
    expression?: string;
}

export interface LogicRule {
    id: string;
    name?: string;
    enabled?: boolean;
    priority?: number;
    condition: Condition | ConditionGroup;
    action: RuleAction;
}

export interface LogicSchema {
    version: string;
    rules: LogicRule[];
    globalSettings?: {
        evaluateOnChange?: boolean;
        strictMode?: boolean;
    };
}
