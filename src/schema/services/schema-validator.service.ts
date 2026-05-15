import { Injectable } from '@nestjs/common';
import {
  SurveySchema,
  SurveyPage,
  Question,
  QuestionType,
  QuestionValidation,
} from '../interfaces/survey-schema.interface';

/**
 * Validation error structure
 */
export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

/**
 * Validation result
 */
export interface SchemaValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * SurveyJS question types mapping to our internal types
 * SurveyJS uses different type names
 */
const SURVEYJS_TYPE_MAP: Record<string, string> = {
  // SurveyJS types -> Our types (or just accept as-is)
  text: 'text',
  comment: 'textarea',
  multipletext: 'text',
  radiogroup: 'single_choice',
  checkbox: 'multiple_choice',
  dropdown: 'dropdown',
  rating: 'rating',
  boolean: 'boolean',
  matrix: 'matrix',
  matrixdropdown: 'matrix',
  matrixdynamic: 'matrix',
  file: 'file',
  signaturepad: 'signature',
  expression: 'calculated',
  html: 'html',
  image: 'image',
  panel: 'panel',
  paneldynamic: 'panel',
  ranking: 'ranking',
};

/**
 * All valid question types (our types + SurveyJS types)
 */
const VALID_QUESTION_TYPES = new Set([
  // Our internal types
  ...Object.values(QuestionType),
  // SurveyJS types
  ...Object.keys(SURVEYJS_TYPE_MAP),
]);

/**
 * Service for validating survey schema definitions
 * Supports both internal format and SurveyJS native format
 */
@Injectable()
export class SchemaValidatorService {
  /**
   * Validate a complete survey schema
   * Accepts both our internal format and SurveyJS native format
   */
  validateSchema(schema: unknown): SchemaValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (!schema || typeof schema !== 'object') {
      errors.push({
        path: '',
        message: 'Schema must be an object',
        code: 'INVALID_SCHEMA_TYPE',
      });
      return { valid: false, errors, warnings };
    }

    const surveySchema = schema as Record<string, unknown>;

    // Validate version (optional for SurveyJS compatibility)
    if (surveySchema.version && typeof surveySchema.version !== 'string') {
      errors.push({
        path: 'version',
        message: 'Schema version must be a string',
        code: 'INVALID_VERSION_TYPE',
      });
    }

    // Validate pages
    if (!surveySchema.pages) {
      errors.push({
        path: 'pages',
        message: 'Pages array is required',
        code: 'MISSING_PAGES',
      });
    } else if (!Array.isArray(surveySchema.pages)) {
      errors.push({
        path: 'pages',
        message: 'Pages must be an array',
        code: 'INVALID_PAGES_TYPE',
      });
    } else if (surveySchema.pages.length === 0) {
      warnings.push({
        path: 'pages',
        message: 'Survey has no pages',
        code: 'EMPTY_PAGES',
      });
    } else {
      // Validate each page
      const questionIds = new Set<string>();
      const pageIds = new Set<string>();

      (surveySchema.pages as unknown[]).forEach((page, pageIndex) => {
        const pageErrors = this.validatePage(
          page,
          pageIndex,
          pageIds,
          questionIds,
        );
        errors.push(...pageErrors.errors);
        warnings.push(...pageErrors.warnings);
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate a single page
   * Accepts both: { id, questions } and { name, elements }
   */
  private validatePage(
    page: unknown,
    pageIndex: number,
    pageIds: Set<string>,
    questionIds: Set<string>,
  ): { errors: ValidationError[]; warnings: ValidationError[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const basePath = `pages[${pageIndex}]`;

    if (!page || typeof page !== 'object') {
      errors.push({
        path: basePath,
        message: 'Page must be an object',
        code: 'INVALID_PAGE_TYPE',
      });
      return { errors, warnings };
    }

    const surveyPage = page as Record<string, unknown>;

    // Get page ID (support both 'id' and 'name')
    const pageId = (surveyPage.id || surveyPage.name) as string | undefined;
    
    if (!pageId) {
      errors.push({
        path: `${basePath}.id`,
        message: 'Page ID (id or name) is required',
        code: 'MISSING_PAGE_ID',
      });
    } else if (typeof pageId !== 'string') {
      errors.push({
        path: `${basePath}.id`,
        message: 'Page ID must be a string',
        code: 'INVALID_PAGE_ID_TYPE',
      });
    } else if (pageIds.has(pageId)) {
      errors.push({
        path: `${basePath}.id`,
        message: `Duplicate page ID: ${pageId}`,
        code: 'DUPLICATE_PAGE_ID',
      });
    } else {
      pageIds.add(pageId);
    }

    // Get questions (support both 'questions' and 'elements')
    const questions = (surveyPage.questions || surveyPage.elements) as unknown[] | undefined;

    if (!questions) {
      errors.push({
        path: `${basePath}.questions`,
        message: 'Questions array (questions or elements) is required',
        code: 'MISSING_QUESTIONS',
      });
    } else if (!Array.isArray(questions)) {
      errors.push({
        path: `${basePath}.questions`,
        message: 'Questions must be an array',
        code: 'INVALID_QUESTIONS_TYPE',
      });
    } else {
      questions.forEach((question, questionIndex) => {
        const questionErrors = this.validateQuestion(
          question,
          `${basePath}.elements[${questionIndex}]`,
          questionIds,
        );
        errors.push(...questionErrors.errors);
        warnings.push(...questionErrors.warnings);
      });
    }

    return { errors, warnings };
  }

  /**
   * Validate a single question
   * Accepts both: { id, type, title } and { name, type, title }
   */
  private validateQuestion(
    question: unknown,
    basePath: string,
    questionIds: Set<string>,
  ): { errors: ValidationError[]; warnings: ValidationError[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (!question || typeof question !== 'object') {
      errors.push({
        path: basePath,
        message: 'Question must be an object',
        code: 'INVALID_QUESTION_TYPE',
      });
      return { errors, warnings };
    }

    const q = question as Record<string, unknown>;

    // Get question ID (support both 'id' and 'name')
    const questionId = (q.id || q.name) as string | undefined;

    if (!questionId) {
      errors.push({
        path: `${basePath}.name`,
        message: 'Question ID (id or name) is required',
        code: 'MISSING_QUESTION_ID',
      });
    } else if (typeof questionId !== 'string') {
      errors.push({
        path: `${basePath}.name`,
        message: 'Question ID must be a string',
        code: 'INVALID_QUESTION_ID_TYPE',
      });
    } else if (questionIds.has(questionId)) {
      errors.push({
        path: `${basePath}.name`,
        message: `Duplicate question ID: ${questionId}`,
        code: 'DUPLICATE_QUESTION_ID',
      });
    } else {
      questionIds.add(questionId);
    }

    // Validate question type
    if (!q.type) {
      errors.push({
        path: `${basePath}.type`,
        message: 'Question type is required',
        code: 'MISSING_QUESTION_TYPE',
      });
    } else if (typeof q.type !== 'string') {
      errors.push({
        path: `${basePath}.type`,
        message: 'Question type must be a string',
        code: 'INVALID_QUESTION_TYPE_TYPE',
      });
    } else if (!VALID_QUESTION_TYPES.has(q.type)) {
      warnings.push({
        path: `${basePath}.type`,
        message: `Unknown question type: ${q.type}. This may still work with SurveyJS.`,
        code: 'UNKNOWN_QUESTION_TYPE',
      });
    }

    // Title is optional in SurveyJS (can use name as display)
    if (q.title && typeof q.title !== 'string') {
      errors.push({
        path: `${basePath}.title`,
        message: 'Question title must be a string',
        code: 'INVALID_QUESTION_TITLE_TYPE',
      });
    }

    // Type-specific validation (relaxed for SurveyJS compatibility)
    const questionType = q.type as string;
    if (questionType) {
      const typeErrors = this.validateQuestionByType(q, basePath, questionType);
      errors.push(...typeErrors.errors);
      warnings.push(...typeErrors.warnings);
    }

    return { errors, warnings };
  }

  /**
   * Validate question based on its type
   * Relaxed validation for SurveyJS compatibility
   */
  private validateQuestionByType(
    question: Record<string, unknown>,
    basePath: string,
    questionType: string,
  ): { errors: ValidationError[]; warnings: ValidationError[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Normalize type for checking
    const normalizedType = SURVEYJS_TYPE_MAP[questionType] || questionType;

    switch (normalizedType) {
      case 'single_choice':
      case 'multiple_choice':
      case 'dropdown':
        // SurveyJS uses 'choices' array
        if (question.choices && !Array.isArray(question.choices)) {
          errors.push({
            path: `${basePath}.choices`,
            message: 'Choices must be an array',
            code: 'INVALID_CHOICES_TYPE',
          });
        }
        break;

      case 'rating':
      case 'scale':
        // SurveyJS uses rateMin/rateMax, we use scaleConfig
        // Both are acceptable
        break;

      case 'matrix':
        // SurveyJS uses rows/columns, we use matrixRows/matrixColumns
        // Both are acceptable
        break;
    }

    return { errors, warnings };
  }

  /**
   * Extract all question IDs from a schema
   * Supports both internal format and SurveyJS format
   */
  extractQuestionIds(schema: SurveySchema | Record<string, unknown>): string[] {
    const ids: string[] = [];
    const pages = (schema as Record<string, unknown>).pages as unknown[];
    
    if (pages && Array.isArray(pages)) {
      for (const page of pages) {
        const pageObj = page as Record<string, unknown>;
        // Support both 'questions' and 'elements'
        const questions = (pageObj.questions || pageObj.elements) as unknown[];
        
        if (questions && Array.isArray(questions)) {
          for (const question of questions) {
            const q = question as Record<string, unknown>;
            // Support both 'id' and 'name'
            const id = (q.id || q.name) as string;
            if (id) {
              ids.push(id);
            }
          }
        }
      }
    }
    return ids;
  }

  /**
   * Extract all page IDs from a schema
   * Supports both internal format and SurveyJS format
   */
  extractPageIds(schema: SurveySchema | Record<string, unknown>): string[] {
    const ids: string[] = [];
    const pages = (schema as Record<string, unknown>).pages as unknown[];
    
    if (pages && Array.isArray(pages)) {
      for (const page of pages) {
        const pageObj = page as Record<string, unknown>;
        // Support both 'id' and 'name'
        const id = (pageObj.id || pageObj.name) as string;
        if (id) {
          ids.push(id);
        }
      }
    }
    return ids;
  }

  /**
   * Get a question by ID from schema
   * Supports both internal format and SurveyJS format
   */
  getQuestionById(
    schema: SurveySchema | Record<string, unknown>,
    questionId: string,
  ): Question | Record<string, unknown> | null {
    const pages = (schema as Record<string, unknown>).pages as unknown[];
    
    if (!pages || !Array.isArray(pages)) return null;
    
    for (const page of pages) {
      const pageObj = page as Record<string, unknown>;
      const questions = (pageObj.questions || pageObj.elements) as unknown[];
      
      if (questions && Array.isArray(questions)) {
        const question = questions.find((q) => {
          const qObj = q as Record<string, unknown>;
          return qObj.id === questionId || qObj.name === questionId;
        });
        if (question) return question as Record<string, unknown>;
      }
    }
    return null;
  }

  /**
   * Get a page by ID from schema
   * Supports both internal format and SurveyJS format
   */
  getPageById(
    schema: SurveySchema | Record<string, unknown>,
    pageId: string,
  ): SurveyPage | Record<string, unknown> | null {
    const pages = (schema as Record<string, unknown>).pages as unknown[];
    
    if (!pages || !Array.isArray(pages)) return null;
    
    const page = pages.find((p) => {
      const pObj = p as Record<string, unknown>;
      return pObj.id === pageId || pObj.name === pageId;
    });
    
    return page as Record<string, unknown> | null;
  }
}
