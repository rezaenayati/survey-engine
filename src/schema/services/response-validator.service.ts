import { Injectable } from '@nestjs/common';
import { SurveySchema } from '../interfaces/survey-schema.interface';
import {
    SchemaValidatorService,
    ValidationError,
} from './schema-validator.service';

/**
 * Answer validation result for a single question
 */
export interface AnswerValidationResult {
    questionId: string;
    valid: boolean;
    errors: ValidationError[];
}

/**
 * Complete response validation result
 */
export interface ResponseValidationResult {
    valid: boolean;
    errors: ValidationError[];
    questionResults: AnswerValidationResult[];
    missingRequired: string[];
}

/**
 * Normalized question for validation
 * Works with both our internal format and SurveyJS format
 */
interface NormalizedQuestion {
    id: string;
    type: string;
    title: string;
    isRequired: boolean;
    choices?: Array<{ value: string | number; text?: string }>;
    rateMin?: number;
    rateMax?: number;
    validators?: Array<{
        type: string;
        regex?: string;
        text?: string;
        minLength?: number;
        maxLength?: number;
    }>;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    allowedFileTypes?: string[];
    maxFileSize?: number;
}

/**
 * Service for validating survey response answers against schema
 * Supports both internal format and SurveyJS native format
 */
@Injectable()
export class ResponseValidatorService {
    constructor(private readonly schemaValidator: SchemaValidatorService) {}

    /**
     * Validate a complete response against a survey schema
     */
    validateResponse(
        schema: SurveySchema | Record<string, unknown>,
        answers: Record<string, unknown>,
        options: {
            validateRequired?: boolean;
            partialValidation?: boolean;
        } = {},
    ): ResponseValidationResult {
        const { validateRequired = true, partialValidation = false } = options;

        const errors: ValidationError[] = [];
        const questionResults: AnswerValidationResult[] = [];
        const missingRequired: string[] = [];

        // Get all questions from schema (normalized)
        const questions = this.getAllQuestions(schema);

        for (const question of questions) {
            const answer = answers[question.id];
            const hasAnswer =
                answer !== undefined && answer !== null && answer !== '';

            // Check required
            if (validateRequired && question.isRequired && !hasAnswer) {
                missingRequired.push(question.id);
                errors.push({
                    path: question.id,
                    message: `Question "${question.title || question.id}" is required`,
                    code: 'REQUIRED_FIELD',
                });
            }

            // Skip validation if no answer and partial validation is allowed
            if (!hasAnswer && partialValidation) {
                continue;
            }

            // Validate the answer if present
            if (hasAnswer) {
                const result = this.validateAnswer(question, answer);
                questionResults.push(result);
                if (!result.valid) {
                    errors.push(...result.errors);
                }
            }
        }

        // Don't fail on extra answers - SurveyJS may add metadata fields
        const questionIds = new Set(questions.map((q) => q.id));
        for (const answerId of Object.keys(answers)) {
            if (!questionIds.has(answerId) && !answerId.startsWith('_')) {
                // Just a warning, don't fail
                // Unknown fields might be from SurveyJS internal state
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            questionResults,
            missingRequired,
        };
    }

    /**
     * Validate a single answer against a question definition
     */
    validateAnswer(
        question: NormalizedQuestion,
        answer: unknown,
    ): AnswerValidationResult {
        const errors: ValidationError[] = [];
        const basePath = question.id;

        // Type-specific validation based on SurveyJS types
        switch (question.type) {
            case 'text':
            case 'multipletext':
                this.validateTextAnswer(question, answer, basePath, errors);
                break;

            case 'comment':
                this.validateTextAnswer(question, answer, basePath, errors);
                break;

            case 'radiogroup':
            case 'dropdown':
                this.validateSingleChoiceAnswer(
                    question,
                    answer,
                    basePath,
                    errors,
                );
                break;

            case 'checkbox':
                this.validateMultipleChoiceAnswer(
                    question,
                    answer,
                    basePath,
                    errors,
                );
                break;

            case 'rating':
                this.validateRatingAnswer(question, answer, basePath, errors);
                break;

            case 'boolean':
                this.validateBooleanAnswer(question, answer, basePath, errors);
                break;

            case 'matrix':
            case 'matrixdropdown':
            case 'matrixdynamic':
                // Matrix answers are complex objects, basic validation
                if (typeof answer !== 'object') {
                    errors.push({
                        path: basePath,
                        message: 'Matrix answer must be an object',
                        code: 'INVALID_TYPE',
                    });
                }
                break;

            case 'file':
                this.validateFileAnswer(question, answer, basePath, errors);
                break;

            case 'signaturepad':
                // Signature is a data URL string
                if (typeof answer !== 'string') {
                    errors.push({
                        path: basePath,
                        message: 'Signature must be a string',
                        code: 'INVALID_TYPE',
                    });
                }
                break;

            case 'ranking':
                if (!Array.isArray(answer)) {
                    errors.push({
                        path: basePath,
                        message: 'Ranking answer must be an array',
                        code: 'INVALID_TYPE',
                    });
                }
                break;

            default:
                // For unknown types, do basic validation
                break;
        }

        // Apply SurveyJS validators if present
        if (question.validators && Array.isArray(question.validators)) {
            for (const validator of question.validators) {
                this.applyValidator(validator, answer, basePath, errors);
            }
        }

        return {
            questionId: question.id,
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Validate text answer
     */
    private validateTextAnswer(
        question: NormalizedQuestion,
        answer: unknown,
        basePath: string,
        errors: ValidationError[],
    ): void {
        if (typeof answer !== 'string') {
            errors.push({
                path: basePath,
                message: 'Text answer must be a string',
                code: 'INVALID_TYPE',
            });
            return;
        }

        // Check minLength/maxLength from question or validators
        if (
            question.minLength !== undefined &&
            answer.length < question.minLength
        ) {
            errors.push({
                path: basePath,
                message: `Answer must be at least ${question.minLength} characters`,
                code: 'MIN_LENGTH',
            });
        }
        if (
            question.maxLength !== undefined &&
            answer.length > question.maxLength
        ) {
            errors.push({
                path: basePath,
                message: `Answer must be at most ${question.maxLength} characters`,
                code: 'MAX_LENGTH',
            });
        }
    }

    /**
     * Validate single choice answer
     */
    private validateSingleChoiceAnswer(
        question: NormalizedQuestion,
        answer: unknown,
        basePath: string,
        errors: ValidationError[],
    ): void {
        if (typeof answer !== 'string' && typeof answer !== 'number') {
            errors.push({
                path: basePath,
                message: 'Single choice answer must be a string or number',
                code: 'INVALID_TYPE',
            });
            return;
        }

        // Validate against choices if available
        if (question.choices && question.choices.length > 0) {
            const validValues = question.choices.map((c) =>
                typeof c === 'object' ? c.value : c,
            );
            if (!validValues.includes(answer)) {
                // Don't error - might be an "other" option or valid value
            }
        }
    }

    /**
     * Validate multiple choice answer
     */
    private validateMultipleChoiceAnswer(
        question: NormalizedQuestion,
        answer: unknown,
        basePath: string,
        errors: ValidationError[],
    ): void {
        if (!Array.isArray(answer)) {
            errors.push({
                path: basePath,
                message: 'Multiple choice answer must be an array',
                code: 'INVALID_TYPE',
            });
            return;
        }
    }

    /**
     * Validate rating answer
     */
    private validateRatingAnswer(
        question: NormalizedQuestion,
        answer: unknown,
        basePath: string,
        errors: ValidationError[],
    ): void {
        const num = typeof answer === 'string' ? parseFloat(answer) : answer;

        if (typeof num !== 'number' || isNaN(num)) {
            errors.push({
                path: basePath,
                message: 'Rating answer must be a number',
                code: 'INVALID_TYPE',
            });
            return;
        }

        // Check bounds
        const min = question.rateMin ?? question.min ?? 1;
        const max = question.rateMax ?? question.max ?? 5;

        if (num < min || num > max) {
            errors.push({
                path: basePath,
                message: `Rating must be between ${min} and ${max}`,
                code: 'OUT_OF_RANGE',
            });
        }
    }

    /**
     * Validate boolean answer
     */
    private validateBooleanAnswer(
        question: NormalizedQuestion,
        answer: unknown,
        basePath: string,
        errors: ValidationError[],
    ): void {
        if (
            typeof answer !== 'boolean' &&
            answer !== 'true' &&
            answer !== 'false'
        ) {
            errors.push({
                path: basePath,
                message: 'Boolean answer must be true or false',
                code: 'INVALID_TYPE',
            });
        }
    }

    /**
     * File answers should reference files uploaded through the Files API.
     * Expected shape: `{ fileId, originalName?, mimeType?, size?, url? }` or an array of that shape.
     */
    private validateFileAnswer(
        question: NormalizedQuestion,
        answer: unknown,
        basePath: string,
        errors: ValidationError[],
    ): void {
        const files = Array.isArray(answer) ? answer : [answer];

        if (Array.isArray(answer) && answer.length === 0) {
            if (question.isRequired) {
                errors.push({
                    path: basePath,
                    message: 'File answer is required',
                    code: 'REQUIRED_FIELD',
                });
            }
            return;
        }

        for (const [index, file] of files.entries()) {
            const path = Array.isArray(answer)
                ? `${basePath}[${index}]`
                : basePath;
            if (!this.isFileReference(file)) {
                errors.push({
                    path,
                    message: 'File answer must be an uploaded file reference',
                    code: 'INVALID_TYPE',
                });
                continue;
            }

            if (
                question.maxFileSize !== undefined &&
                file.size !== undefined &&
                file.size > question.maxFileSize
            ) {
                errors.push({
                    path,
                    message: `File must be at most ${question.maxFileSize} bytes`,
                    code: 'FILE_TOO_LARGE',
                });
            }

            if (
                question.allowedFileTypes &&
                question.allowedFileTypes.length > 0 &&
                file.mimeType &&
                !this.matchesAllowedFileType(
                    file.mimeType,
                    file.originalName,
                    question.allowedFileTypes,
                )
            ) {
                errors.push({
                    path,
                    message: `File type "${file.mimeType}" is not allowed`,
                    code: 'FILE_TYPE_NOT_ALLOWED',
                });
            }
        }
    }

    private isFileReference(file: unknown): file is {
        fileId: string;
        originalName?: string;
        mimeType?: string;
        size?: number;
    } {
        if (!file || typeof file !== 'object' || Array.isArray(file)) {
            return false;
        }

        const obj = file as Record<string, unknown>;
        if (typeof obj.fileId !== 'string' || obj.fileId.length === 0) {
            return false;
        }

        if (obj.mimeType !== undefined && typeof obj.mimeType !== 'string') {
            return false;
        }
        if (
            obj.originalName !== undefined &&
            typeof obj.originalName !== 'string'
        ) {
            return false;
        }
        if (obj.size !== undefined && typeof obj.size !== 'number') {
            return false;
        }

        return true;
    }

    private matchesAllowedFileType(
        mimeType: string,
        originalName: string | undefined,
        allowedTypes: string[],
    ): boolean {
        const dotIndex = originalName?.lastIndexOf('.') ?? -1;
        const extension =
            originalName && dotIndex >= 0
                ? originalName.slice(dotIndex).toLowerCase()
                : '';
        return allowedTypes.some((allowed) => {
            const value = allowed.toLowerCase();
            if (value.endsWith('/*')) {
                return mimeType.toLowerCase().startsWith(value.slice(0, -1));
            }
            if (value.startsWith('.')) {
                return extension === value;
            }
            return mimeType.toLowerCase() === value;
        });
    }

    /**
     * Apply a SurveyJS validator
     */
    private applyValidator(
        validator: {
            type: string;
            regex?: string;
            text?: string;
            minLength?: number;
            maxLength?: number;
        },
        answer: unknown,
        basePath: string,
        errors: ValidationError[],
    ): void {
        switch (validator.type) {
            case 'regex':
                if (validator.regex && typeof answer === 'string') {
                    try {
                        const regex = new RegExp(validator.regex);
                        if (!regex.test(answer)) {
                            errors.push({
                                path: basePath,
                                message: validator.text || 'Invalid format',
                                code: 'PATTERN_MISMATCH',
                            });
                        }
                    } catch {
                        // Invalid regex, skip
                    }
                }
                break;

            case 'text':
                if (typeof answer === 'string') {
                    if (
                        validator.minLength !== undefined &&
                        answer.length < validator.minLength
                    ) {
                        errors.push({
                            path: basePath,
                            message:
                                validator.text ||
                                `Minimum ${validator.minLength} characters required`,
                            code: 'MIN_LENGTH',
                        });
                    }
                    if (
                        validator.maxLength !== undefined &&
                        answer.length > validator.maxLength
                    ) {
                        errors.push({
                            path: basePath,
                            message:
                                validator.text ||
                                `Maximum ${validator.maxLength} characters allowed`,
                            code: 'MAX_LENGTH',
                        });
                    }
                }
                break;

            case 'email':
                if (typeof answer === 'string') {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(answer)) {
                        errors.push({
                            path: basePath,
                            message: validator.text || 'Invalid email format',
                            code: 'INVALID_EMAIL',
                        });
                    }
                }
                break;

            case 'numeric':
                if (typeof answer === 'string' && isNaN(parseFloat(answer))) {
                    errors.push({
                        path: basePath,
                        message: validator.text || 'Must be a number',
                        code: 'INVALID_NUMBER',
                    });
                }
                break;
        }
    }

    /**
     * Get all questions from all pages (normalized to common format)
     * Supports both internal format and SurveyJS format
     */
    private getAllQuestions(
        schema: SurveySchema | Record<string, unknown>,
    ): NormalizedQuestion[] {
        const questions: NormalizedQuestion[] = [];
        const pages = (schema as Record<string, unknown>).pages as unknown[];

        if (!pages || !Array.isArray(pages)) {
            return questions;
        }

        for (const page of pages) {
            const pageObj = page as Record<string, unknown>;
            // Support both 'questions' and 'elements'
            const elements = (pageObj.questions ||
                pageObj.elements) as unknown[];

            if (elements && Array.isArray(elements)) {
                for (const element of elements) {
                    const q = element as Record<string, unknown>;

                    // Normalize the question
                    const normalized: NormalizedQuestion = {
                        // Support both 'id' and 'name'
                        id: (q.id || q.name) as string,
                        type: q.type as string,
                        // Title might not exist in SurveyJS
                        title: (q.title || q.name) as string,
                        // Support both 'isRequired' (SurveyJS) and 'validation.required' (internal)
                        isRequired:
                            q.isRequired === true ||
                            (q.validation as Record<string, unknown>)
                                ?.required === true,
                        // SurveyJS properties
                        choices: q.choices as NormalizedQuestion['choices'],
                        rateMin: q.rateMin as number,
                        rateMax: q.rateMax as number,
                        validators:
                            q.validators as NormalizedQuestion['validators'],
                        minLength: q.minLength as number,
                        maxLength: q.maxLength as number,
                        min: q.min as number,
                        max: q.max as number,
                        allowedFileTypes: this.normalizeAllowedFileTypes(
                            (q.validation as Record<string, unknown>)
                                ?.allowedFileTypes ?? q.acceptedTypes,
                        ),
                        maxFileSize: this.normalizeNumber(
                            (q.validation as Record<string, unknown>)
                                ?.maxFileSize ??
                                q.maxFileSize ??
                                q.maxSize,
                        ),
                    };

                    questions.push(normalized);
                }
            }
        }

        return questions;
    }

    private normalizeAllowedFileTypes(value: unknown): string[] | undefined {
        if (Array.isArray(value)) {
            return value
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter(Boolean);
        }

        if (typeof value === 'string') {
            return value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
        }

        return undefined;
    }

    private normalizeNumber(value: unknown): number | undefined {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : undefined;
        }
        return undefined;
    }
}
