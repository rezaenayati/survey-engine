/**
 * Logic Rules Type Definitions
 * These interfaces define the structure of logic rules (logicJson)
 */

/**
 * Comparison operators for conditions
 */
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
    IN = 'in', // value is in array
    NOT_IN = 'not_in',
    MATCHES = 'matches', // regex match
}

/**
 * Logical operators for combining conditions
 */
export enum LogicalOperator {
    AND = 'and',
    OR = 'or',
}

/**
 * Single condition comparing a question answer to a value
 */
export interface Condition {
    questionId: string;
    operator: ComparisonOperator;
    value?: unknown; // The value to compare against (not needed for is_empty/is_not_empty)
}

/**
 * Group of conditions combined with a logical operator
 */
export interface ConditionGroup {
    operator: LogicalOperator;
    conditions: (Condition | ConditionGroup)[];
}

/**
 * Rule types
 */
export enum RuleType {
    VISIBILITY = 'visibility', // Show/hide question or page
    SKIP = 'skip', // Skip to a specific question/page
    REQUIRED = 'required', // Make question required based on condition
    VALIDATION = 'validation', // Custom validation based on other answers
    CALCULATED = 'calculated', // Calculate value from other answers
    JUMP = 'jump', // Jump to specific page on submit
}

/**
 * Action to take when rule conditions are met
 */
export interface RuleAction {
    type: RuleType;
    targetId: string; // Question or page ID to affect
    targetType: 'question' | 'page';
    value?: unknown; // For calculated fields, validation messages, etc.
    expression?: string; // For calculated fields (e.g., "{q1} + {q2}")
}

/**
 * Complete logic rule
 */
export interface LogicRule {
    id: string;
    name?: string;
    description?: string;
    enabled?: boolean;
    priority?: number; // Higher priority rules are evaluated first
    condition: Condition | ConditionGroup;
    action: RuleAction;
}

/**
 * Complete Logic Schema
 */
export interface LogicSchema {
    version: string; // Schema version (e.g., "1.0")
    rules: LogicRule[];
    globalSettings?: LogicGlobalSettings;
}

/**
 * Global settings for logic evaluation
 */
export interface LogicGlobalSettings {
    evaluateOnChange?: boolean; // Re-evaluate on every answer change
    strictMode?: boolean; // Fail on undefined question references
}

/**
 * Result of evaluating a single rule
 */
export interface RuleEvaluationResult {
    ruleId: string;
    conditionMet: boolean;
    action?: RuleAction;
    error?: string;
}

/**
 * Complete evaluation result
 */
export interface LogicEvaluationResult {
    /** Questions that should be visible */
    visibleQuestions: string[];
    /** Questions that should be hidden */
    hiddenQuestions: string[];
    /** Pages that should be visible */
    visiblePages: string[];
    /** Pages that should be hidden */
    hiddenPages: string[];
    /** Questions that are required based on logic */
    requiredQuestions: string[];
    /** Calculated field values */
    calculatedValues: Record<string, unknown>;
    /** Validation errors from logic rules */
    validationErrors: Record<string, string>;
    /** Jump target (page ID) if any */
    jumpTarget?: string;
    /** Individual rule results */
    ruleResults: RuleEvaluationResult[];
}

/**
 * Type guard to check if condition is a group
 */
export function isConditionGroup(
    condition: Condition | ConditionGroup,
): condition is ConditionGroup {
    return 'operator' in condition && 'conditions' in condition;
}
