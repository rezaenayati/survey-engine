import { Injectable } from '@nestjs/common';
import {
  LogicSchema,
  LogicRule,
  Condition,
  ConditionGroup,
  ComparisonOperator,
  LogicalOperator,
  RuleType,
  LogicEvaluationResult,
  RuleEvaluationResult,
  isConditionGroup,
} from '../interfaces/logic-rules.interface';
import { SurveySchema } from '../interfaces/survey-schema.interface';
import { SchemaValidatorService } from './schema-validator.service';

/**
 * Service for evaluating survey logic rules
 */
@Injectable()
export class LogicEngineService {
  constructor(private readonly schemaValidator: SchemaValidatorService) {}

  /**
   * Evaluate all logic rules against current answers
   */
  evaluateLogic(
    surveySchema: SurveySchema,
    logicSchema: LogicSchema | null,
    answers: Record<string, unknown>,
  ): LogicEvaluationResult {
    // Initialize with all questions/pages visible
    const allQuestionIds = this.schemaValidator.extractQuestionIds(surveySchema);
    const allPageIds = this.schemaValidator.extractPageIds(surveySchema);

    const result: LogicEvaluationResult = {
      visibleQuestions: [...allQuestionIds],
      hiddenQuestions: [],
      visiblePages: [...allPageIds],
      hiddenPages: [],
      requiredQuestions: [],
      calculatedValues: {},
      validationErrors: {},
      ruleResults: [],
    };

    // If no logic schema, return defaults
    if (!logicSchema || !logicSchema.rules || logicSchema.rules.length === 0) {
      return result;
    }

    // Sort rules by priority (higher first)
    const sortedRules = [...logicSchema.rules].sort(
      (a, b) => (b.priority || 0) - (a.priority || 0),
    );

    // Evaluate each rule
    for (const rule of sortedRules) {
      if (rule.enabled === false) {
        continue;
      }

      const ruleResult = this.evaluateRule(rule, answers, logicSchema.globalSettings?.strictMode);
      result.ruleResults.push(ruleResult);

      if (ruleResult.conditionMet && ruleResult.action) {
        this.applyRuleAction(ruleResult.action, result);
      }
    }

    // Update visible/hidden lists
    result.visibleQuestions = allQuestionIds.filter(
      (id) => !result.hiddenQuestions.includes(id),
    );
    result.visiblePages = allPageIds.filter(
      (id) => !result.hiddenPages.includes(id),
    );

    return result;
  }

  /**
   * Evaluate a single rule
   */
  evaluateRule(
    rule: LogicRule,
    answers: Record<string, unknown>,
    strictMode?: boolean,
  ): RuleEvaluationResult {
    try {
      const conditionMet = this.evaluateCondition(rule.condition, answers, strictMode);

      return {
        ruleId: rule.id,
        conditionMet,
        action: conditionMet ? rule.action : undefined,
      };
    } catch (error) {
      return {
        ruleId: rule.id,
        conditionMet: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Evaluate a condition or condition group
   */
  evaluateCondition(
    condition: Condition | ConditionGroup,
    answers: Record<string, unknown>,
    strictMode?: boolean,
  ): boolean {
    if (isConditionGroup(condition)) {
      return this.evaluateConditionGroup(condition, answers, strictMode);
    }

    return this.evaluateSingleCondition(condition, answers, strictMode);
  }

  /**
   * Evaluate a group of conditions
   */
  private evaluateConditionGroup(
    group: ConditionGroup,
    answers: Record<string, unknown>,
    strictMode?: boolean,
  ): boolean {
    if (!group.conditions || group.conditions.length === 0) {
      return true;
    }

    const results = group.conditions.map((c) =>
      this.evaluateCondition(c, answers, strictMode),
    );

    if (group.operator === LogicalOperator.AND) {
      return results.every((r) => r === true);
    } else {
      return results.some((r) => r === true);
    }
  }

  /**
   * Evaluate a single condition
   */
  private evaluateSingleCondition(
    condition: Condition,
    answers: Record<string, unknown>,
    strictMode?: boolean,
  ): boolean {
    const answer = answers[condition.questionId];

    // Handle strict mode for undefined questions
    if (answer === undefined && strictMode) {
      throw new Error(`Question "${condition.questionId}" not found in answers`);
    }

    return this.compareValues(answer, condition.operator, condition.value);
  }

  /**
   * Compare a value against a condition value using an operator
   */
  private compareValues(
    answer: unknown,
    operator: ComparisonOperator,
    conditionValue: unknown,
  ): boolean {
    // Handle empty checks first
    if (operator === ComparisonOperator.IS_EMPTY) {
      return this.isEmpty(answer);
    }
    if (operator === ComparisonOperator.IS_NOT_EMPTY) {
      return !this.isEmpty(answer);
    }

    // For other operators, get comparable values
    const answerValue = this.normalizeValue(answer);
    const compareValue = this.normalizeValue(conditionValue);

    switch (operator) {
      case ComparisonOperator.EQUALS:
        return this.equals(answerValue, compareValue);

      case ComparisonOperator.NOT_EQUALS:
        return !this.equals(answerValue, compareValue);

      case ComparisonOperator.GREATER_THAN:
        return this.toNumber(answerValue) > this.toNumber(compareValue);

      case ComparisonOperator.GREATER_THAN_OR_EQUALS:
        return this.toNumber(answerValue) >= this.toNumber(compareValue);

      case ComparisonOperator.LESS_THAN:
        return this.toNumber(answerValue) < this.toNumber(compareValue);

      case ComparisonOperator.LESS_THAN_OR_EQUALS:
        return this.toNumber(answerValue) <= this.toNumber(compareValue);

      case ComparisonOperator.CONTAINS:
        return this.contains(answerValue, compareValue);

      case ComparisonOperator.NOT_CONTAINS:
        return !this.contains(answerValue, compareValue);

      case ComparisonOperator.STARTS_WITH:
        return String(answerValue).startsWith(String(compareValue));

      case ComparisonOperator.ENDS_WITH:
        return String(answerValue).endsWith(String(compareValue));

      case ComparisonOperator.IN:
        return this.isIn(answerValue, compareValue);

      case ComparisonOperator.NOT_IN:
        return !this.isIn(answerValue, compareValue);

      case ComparisonOperator.MATCHES:
        try {
          const regex = new RegExp(String(compareValue));
          return regex.test(String(answerValue));
        } catch {
          return false;
        }

      default:
        return false;
    }
  }

  /**
   * Check if a value is empty
   */
  private isEmpty(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (value === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (typeof value === 'object' && Object.keys(value as object).length === 0) return true;
    return false;
  }

  /**
   * Normalize a value for comparison
   */
  private normalizeValue(value: unknown): unknown {
    if (value === undefined || value === null) return null;
    return value;
  }

  /**
   * Check equality (handles arrays and objects)
   */
  private equals(a: unknown, b: unknown): boolean {
    if (a === b) return true;

    // Handle array comparison
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, idx) => this.equals(val, b[idx]));
    }

    // Handle object comparison
    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
      const keysA = Object.keys(a as object);
      const keysB = Object.keys(b as object);
      if (keysA.length !== keysB.length) return false;
      return keysA.every((key) =>
        this.equals((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
      );
    }

    // String comparison (case-insensitive for strings)
    if (typeof a === 'string' && typeof b === 'string') {
      return a.toLowerCase() === b.toLowerCase();
    }

    // Number comparison
    if (typeof a === 'number' || typeof b === 'number') {
      return this.toNumber(a) === this.toNumber(b);
    }

    return false;
  }

  /**
   * Convert value to number
   */
  private toNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  }

  /**
   * Check if value contains another value
   */
  private contains(haystack: unknown, needle: unknown): boolean {
    if (Array.isArray(haystack)) {
      return haystack.some((item) => this.equals(item, needle));
    }
    if (typeof haystack === 'string') {
      return haystack.toLowerCase().includes(String(needle).toLowerCase());
    }
    return false;
  }

  /**
   * Check if value is in array
   */
  private isIn(value: unknown, array: unknown): boolean {
    if (!Array.isArray(array)) return false;
    return array.some((item) => this.equals(value, item));
  }

  /**
   * Apply a rule action to the evaluation result
   */
  private applyRuleAction(
    action: { type: RuleType; targetId: string; targetType: 'question' | 'page'; value?: unknown; expression?: string },
    result: LogicEvaluationResult,
  ): void {
    switch (action.type) {
      case RuleType.VISIBILITY:
        // When visibility rule condition is met, HIDE the target
        // (The condition typically describes when to hide, not when to show)
        if (action.targetType === 'question') {
          if (!result.hiddenQuestions.includes(action.targetId)) {
            result.hiddenQuestions.push(action.targetId);
          }
        } else {
          if (!result.hiddenPages.includes(action.targetId)) {
            result.hiddenPages.push(action.targetId);
          }
        }
        break;

      case RuleType.SKIP:
        // Skip logic typically hides the target
        if (action.targetType === 'question') {
          if (!result.hiddenQuestions.includes(action.targetId)) {
            result.hiddenQuestions.push(action.targetId);
          }
        } else {
          if (!result.hiddenPages.includes(action.targetId)) {
            result.hiddenPages.push(action.targetId);
          }
        }
        break;

      case RuleType.REQUIRED:
        // Make the target question required
        if (!result.requiredQuestions.includes(action.targetId)) {
          result.requiredQuestions.push(action.targetId);
        }
        break;

      case RuleType.VALIDATION:
        // Add validation error
        if (action.value && typeof action.value === 'string') {
          result.validationErrors[action.targetId] = action.value;
        }
        break;

      case RuleType.CALCULATED:
        // Calculate field value
        if (action.expression) {
          // TODO: Implement expression evaluation
          result.calculatedValues[action.targetId] = action.expression;
        } else if (action.value !== undefined) {
          result.calculatedValues[action.targetId] = action.value;
        }
        break;

      case RuleType.JUMP:
        // Set jump target
        result.jumpTarget = action.targetId;
        break;
    }
  }

  /**
   * Validate logic schema
   */
  validateLogicSchema(
    logicSchema: unknown,
    surveySchema: SurveySchema,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!logicSchema || typeof logicSchema !== 'object') {
      errors.push('Logic schema must be an object');
      return { valid: false, errors };
    }

    const schema = logicSchema as LogicSchema;

    if (!schema.version) {
      errors.push('Logic schema version is required');
    }

    if (!schema.rules || !Array.isArray(schema.rules)) {
      errors.push('Logic schema must have a rules array');
      return { valid: errors.length === 0, errors };
    }

    // Get all valid question and page IDs
    const validQuestionIds = new Set(this.schemaValidator.extractQuestionIds(surveySchema));
    const validPageIds = new Set(this.schemaValidator.extractPageIds(surveySchema));

    // Validate each rule
    schema.rules.forEach((rule, index) => {
      const ruleErrors = this.validateRule(rule, index, validQuestionIds, validPageIds);
      errors.push(...ruleErrors);
    });

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a single rule
   */
  private validateRule(
    rule: LogicRule,
    index: number,
    validQuestionIds: Set<string>,
    validPageIds: Set<string>,
  ): string[] {
    const errors: string[] = [];
    const prefix = `Rule[${index}]`;

    if (!rule.id) {
      errors.push(`${prefix}: Rule ID is required`);
    }

    if (!rule.condition) {
      errors.push(`${prefix}: Rule condition is required`);
    } else {
      // Validate condition references
      const conditionErrors = this.validateConditionReferences(
        rule.condition,
        `${prefix}.condition`,
        validQuestionIds,
      );
      errors.push(...conditionErrors);
    }

    if (!rule.action) {
      errors.push(`${prefix}: Rule action is required`);
    } else {
      // Validate action target
      const targetId = rule.action.targetId;
      const targetType = rule.action.targetType;

      if (!targetId) {
        errors.push(`${prefix}.action: Target ID is required`);
      } else if (targetType === 'question' && !validQuestionIds.has(targetId)) {
        errors.push(`${prefix}.action: Invalid question target ID: ${targetId}`);
      } else if (targetType === 'page' && !validPageIds.has(targetId)) {
        errors.push(`${prefix}.action: Invalid page target ID: ${targetId}`);
      }
    }

    return errors;
  }

  /**
   * Validate that condition references valid questions
   */
  private validateConditionReferences(
    condition: Condition | ConditionGroup,
    path: string,
    validQuestionIds: Set<string>,
  ): string[] {
    const errors: string[] = [];

    if (isConditionGroup(condition)) {
      condition.conditions.forEach((c, i) => {
        errors.push(
          ...this.validateConditionReferences(c, `${path}.conditions[${i}]`, validQuestionIds),
        );
      });
    } else {
      if (!condition.questionId) {
        errors.push(`${path}: Question ID is required`);
      } else if (!validQuestionIds.has(condition.questionId)) {
        errors.push(`${path}: Invalid question ID: ${condition.questionId}`);
      }
    }

    return errors;
  }

  /**
   * Get questions that should be visible based on logic
   */
  getVisibleQuestions(
    surveySchema: SurveySchema,
    logicSchema: LogicSchema | null,
    answers: Record<string, unknown>,
  ): string[] {
    const result = this.evaluateLogic(surveySchema, logicSchema, answers);
    return result.visibleQuestions;
  }

  /**
   * Get questions that are required based on logic
   */
  getRequiredQuestions(
    surveySchema: SurveySchema,
    logicSchema: LogicSchema | null,
    answers: Record<string, unknown>,
  ): string[] {
    const result = this.evaluateLogic(surveySchema, logicSchema, answers);

    // Combine schema-required questions with logic-required questions
    const schemaRequired: string[] = [];
    if (surveySchema.pages) {
      for (const page of surveySchema.pages) {
        if (page.questions) {
          for (const q of page.questions) {
            if (q.validation?.required) {
              schemaRequired.push(q.id);
            }
          }
        }
      }
    }

    // Only return required questions that are also visible
    const allRequired = [...new Set([...schemaRequired, ...result.requiredQuestions])];
    return allRequired.filter((id) => result.visibleQuestions.includes(id));
  }
}
