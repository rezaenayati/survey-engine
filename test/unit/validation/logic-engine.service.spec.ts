import { Test } from '@nestjs/testing';
import { LogicEngineService } from '../../../src/schema/services/logic-engine.service';
import { SchemaValidatorService } from '../../../src/schema/services/schema-validator.service';
import {
    ComparisonOperator,
    LogicalOperator,
    RuleType,
    LogicSchema,
} from '../../../src/schema/interfaces/logic-rules.interface';
import { SurveySchema } from '../../../src/schema/interfaces/survey-schema.interface';

/** Minimal two-page schema with four questions */
const baseSchema: SurveySchema = {
    version: '1.0',
    pages: [
        {
            id: 'page1',
            title: 'Page 1',
            questions: [
                { id: 'q1', type: 'text' as never, title: 'Q1' },
                { id: 'q2', type: 'text' as never, title: 'Q2' },
            ],
        },
        {
            id: 'page2',
            title: 'Page 2',
            questions: [
                { id: 'q3', type: 'text' as never, title: 'Q3' },
                { id: 'q4', type: 'text' as never, title: 'Q4' },
            ],
        },
    ],
};

function visibilityRule(
    conditionQuestionId: string,
    operator: ComparisonOperator,
    value: unknown,
    targetId: string,
    targetType: 'question' | 'page' = 'question',
): LogicSchema {
    return {
        version: '1.0',
        rules: [
            {
                id: 'rule1',
                condition: { questionId: conditionQuestionId, operator, value },
                action: { type: RuleType.VISIBILITY, targetId, targetType },
            },
        ],
    };
}

describe('LogicEngineService', () => {
    let service: LogicEngineService;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [SchemaValidatorService, LogicEngineService],
        }).compile();
        service = module.get(LogicEngineService);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Defaults — no logic
    // ──────────────────────────────────────────────────────────────────────────

    describe('evaluateLogic with no rules', () => {
        it('returns all questions visible when logic is null', () => {
            const result = service.evaluateLogic(baseSchema, null, {});
            expect(result.visibleQuestions).toEqual(['q1', 'q2', 'q3', 'q4']);
            expect(result.hiddenQuestions).toEqual([]);
        });

        it('returns all pages visible when logic is null', () => {
            const result = service.evaluateLogic(baseSchema, null, {});
            expect(result.visiblePages).toEqual(['page1', 'page2']);
        });

        it('returns all questions visible for empty rules array', () => {
            const result = service.evaluateLogic(
                baseSchema,
                { version: '1.0', rules: [] },
                {},
            );
            expect(result.visibleQuestions).toEqual(['q1', 'q2', 'q3', 'q4']);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Visibility rules
    // ──────────────────────────────────────────────────────────────────────────

    describe('visibility rules', () => {
        it('hides a question when condition is met', () => {
            const logic = visibilityRule(
                'q1',
                ComparisonOperator.EQUALS,
                'yes',
                'q2',
            );
            const result = service.evaluateLogic(baseSchema, logic, {
                q1: 'yes',
            });
            expect(result.hiddenQuestions).toContain('q2');
            expect(result.visibleQuestions).not.toContain('q2');
        });

        it('keeps question visible when condition is NOT met', () => {
            const logic = visibilityRule(
                'q1',
                ComparisonOperator.EQUALS,
                'yes',
                'q2',
            );
            const result = service.evaluateLogic(baseSchema, logic, {
                q1: 'no',
            });
            expect(result.visibleQuestions).toContain('q2');
            expect(result.hiddenQuestions).not.toContain('q2');
        });

        it('hides a page when condition is met', () => {
            const logic = visibilityRule(
                'q1',
                ComparisonOperator.EQUALS,
                'skip',
                'page2',
                'page',
            );
            const result = service.evaluateLogic(baseSchema, logic, {
                q1: 'skip',
            });
            expect(result.hiddenPages).toContain('page2');
            expect(result.visiblePages).not.toContain('page2');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Required rules
    // ──────────────────────────────────────────────────────────────────────────

    describe('required rules', () => {
        it('adds question to requiredQuestions when condition is met', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.EQUALS,
                            value: 'yes',
                        },
                        action: {
                            type: RuleType.REQUIRED,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                ],
            };
            const result = service.evaluateLogic(baseSchema, logic, {
                q1: 'yes',
            });
            expect(result.requiredQuestions).toContain('q2');
        });

        it('does not add question to required when condition is NOT met', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.EQUALS,
                            value: 'yes',
                        },
                        action: {
                            type: RuleType.REQUIRED,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                ],
            };
            const result = service.evaluateLogic(baseSchema, logic, {
                q1: 'no',
            });
            expect(result.requiredQuestions).not.toContain('q2');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Comparison operators
    // ──────────────────────────────────────────────────────────────────────────

    describe('comparison operators', () => {
        const hide = (
            op: ComparisonOperator,
            condVal: unknown,
            answer: unknown,
        ) =>
            service
                .evaluateLogic(
                    baseSchema,
                    visibilityRule('q1', op, condVal, 'q2'),
                    { q1: answer },
                )
                .hiddenQuestions.includes('q2');

        it('EQUALS', () => {
            expect(hide(ComparisonOperator.EQUALS, 'yes', 'yes')).toBe(true);
            expect(hide(ComparisonOperator.EQUALS, 'yes', 'no')).toBe(false);
        });

        it('NOT_EQUALS', () => {
            expect(hide(ComparisonOperator.NOT_EQUALS, 'yes', 'no')).toBe(true);
            expect(hide(ComparisonOperator.NOT_EQUALS, 'yes', 'yes')).toBe(
                false,
            );
        });

        it('GREATER_THAN', () => {
            expect(hide(ComparisonOperator.GREATER_THAN, 5, 10)).toBe(true);
            expect(hide(ComparisonOperator.GREATER_THAN, 5, 3)).toBe(false);
        });

        it('GREATER_THAN_OR_EQUALS', () => {
            expect(hide(ComparisonOperator.GREATER_THAN_OR_EQUALS, 5, 5)).toBe(
                true,
            );
            expect(hide(ComparisonOperator.GREATER_THAN_OR_EQUALS, 5, 4)).toBe(
                false,
            );
        });

        it('LESS_THAN', () => {
            expect(hide(ComparisonOperator.LESS_THAN, 5, 3)).toBe(true);
            expect(hide(ComparisonOperator.LESS_THAN, 5, 7)).toBe(false);
        });

        it('LESS_THAN_OR_EQUALS', () => {
            expect(hide(ComparisonOperator.LESS_THAN_OR_EQUALS, 5, 5)).toBe(
                true,
            );
            expect(hide(ComparisonOperator.LESS_THAN_OR_EQUALS, 5, 6)).toBe(
                false,
            );
        });

        it('CONTAINS', () => {
            expect(hide(ComparisonOperator.CONTAINS, 'ell', 'hello')).toBe(
                true,
            );
            expect(hide(ComparisonOperator.CONTAINS, 'xyz', 'hello')).toBe(
                false,
            );
        });

        it('NOT_CONTAINS', () => {
            expect(hide(ComparisonOperator.NOT_CONTAINS, 'xyz', 'hello')).toBe(
                true,
            );
            expect(hide(ComparisonOperator.NOT_CONTAINS, 'ell', 'hello')).toBe(
                false,
            );
        });

        it('STARTS_WITH', () => {
            expect(hide(ComparisonOperator.STARTS_WITH, 'hel', 'hello')).toBe(
                true,
            );
            expect(hide(ComparisonOperator.STARTS_WITH, 'llo', 'hello')).toBe(
                false,
            );
        });

        it('ENDS_WITH', () => {
            expect(hide(ComparisonOperator.ENDS_WITH, 'llo', 'hello')).toBe(
                true,
            );
            expect(hide(ComparisonOperator.ENDS_WITH, 'hel', 'hello')).toBe(
                false,
            );
        });

        it('IS_EMPTY — undefined answer', () => {
            expect(
                hide(ComparisonOperator.IS_EMPTY, undefined, undefined),
            ).toBe(true);
            expect(hide(ComparisonOperator.IS_EMPTY, undefined, 'value')).toBe(
                false,
            );
        });

        it('IS_NOT_EMPTY — has a value', () => {
            expect(
                hide(ComparisonOperator.IS_NOT_EMPTY, undefined, 'value'),
            ).toBe(true);
            expect(hide(ComparisonOperator.IS_NOT_EMPTY, undefined, '')).toBe(
                false,
            );
        });

        it('IN — value in array', () => {
            expect(hide(ComparisonOperator.IN, ['a', 'b', 'c'], 'b')).toBe(
                true,
            );
            expect(hide(ComparisonOperator.IN, ['a', 'b', 'c'], 'd')).toBe(
                false,
            );
        });

        it('NOT_IN — value not in array', () => {
            expect(hide(ComparisonOperator.NOT_IN, ['a', 'b'], 'c')).toBe(true);
            expect(hide(ComparisonOperator.NOT_IN, ['a', 'b'], 'a')).toBe(
                false,
            );
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // AND / OR condition groups
    // ──────────────────────────────────────────────────────────────────────────

    describe('condition groups', () => {
        it('AND group — both conditions must be true', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            operator: LogicalOperator.AND,
                            conditions: [
                                {
                                    questionId: 'q1',
                                    operator: ComparisonOperator.EQUALS,
                                    value: 'yes',
                                },
                                {
                                    questionId: 'q3',
                                    operator: ComparisonOperator.EQUALS,
                                    value: 'ok',
                                },
                            ],
                        },
                        action: {
                            type: RuleType.VISIBILITY,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                ],
            };

            expect(
                service.evaluateLogic(baseSchema, logic, {
                    q1: 'yes',
                    q3: 'ok',
                }).hiddenQuestions,
            ).toContain('q2');
            expect(
                service.evaluateLogic(baseSchema, logic, {
                    q1: 'yes',
                    q3: 'nope',
                }).hiddenQuestions,
            ).not.toContain('q2');
            expect(
                service.evaluateLogic(baseSchema, logic, { q1: 'no', q3: 'ok' })
                    .hiddenQuestions,
            ).not.toContain('q2');
        });

        it('OR group — either condition suffices', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            operator: LogicalOperator.OR,
                            conditions: [
                                {
                                    questionId: 'q1',
                                    operator: ComparisonOperator.EQUALS,
                                    value: 'a',
                                },
                                {
                                    questionId: 'q1',
                                    operator: ComparisonOperator.EQUALS,
                                    value: 'b',
                                },
                            ],
                        },
                        action: {
                            type: RuleType.VISIBILITY,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                ],
            };

            expect(
                service.evaluateLogic(baseSchema, logic, { q1: 'a' })
                    .hiddenQuestions,
            ).toContain('q2');
            expect(
                service.evaluateLogic(baseSchema, logic, { q1: 'b' })
                    .hiddenQuestions,
            ).toContain('q2');
            expect(
                service.evaluateLogic(baseSchema, logic, { q1: 'c' })
                    .hiddenQuestions,
            ).not.toContain('q2');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Rule priority and disabled rules
    // ──────────────────────────────────────────────────────────────────────────

    describe('rule priority and disabled rules', () => {
        it('skips disabled rules', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        enabled: false,
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.IS_NOT_EMPTY,
                            value: undefined,
                        },
                        action: {
                            type: RuleType.VISIBILITY,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                ],
            };
            const result = service.evaluateLogic(baseSchema, logic, {
                q1: 'anything',
            });
            expect(result.hiddenQuestions).not.toContain('q2');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // validateLogicSchema
    // ──────────────────────────────────────────────────────────────────────────

    describe('validateLogicSchema', () => {
        it('returns valid for a well-formed logic schema referencing existing questions', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            questionId: 'q1',
                            operator: ComparisonOperator.EQUALS,
                            value: 'yes',
                        },
                        action: {
                            type: RuleType.VISIBILITY,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                ],
            };
            const result = service.validateLogicSchema(
                logic as never,
                baseSchema,
            );
            expect(result.valid).toBe(true);
        });

        it('is invalid when a rule references a non-existent question ID', () => {
            const logic: LogicSchema = {
                version: '1.0',
                rules: [
                    {
                        id: 'r1',
                        condition: {
                            questionId: 'q_nonexistent',
                            operator: ComparisonOperator.EQUALS,
                            value: 'yes',
                        },
                        action: {
                            type: RuleType.VISIBILITY,
                            targetId: 'q2',
                            targetType: 'question',
                        },
                    },
                ],
            };
            const result = service.validateLogicSchema(
                logic as never,
                baseSchema,
            );
            expect(result.valid).toBe(false);
        });
    });

    // ─── Expression evaluator ─────────────────────────────────────────────────

    describe('evaluateExpression', () => {
        const answers = { q1: 3, q2: 7, name: 'Jane', last: 'Doe', flag: true };

        describe('arithmetic', () => {
            it('adds two question references', () => {
                expect(service.evaluateExpression('{q1} + {q2}', answers)).toBe(
                    10,
                );
            });

            it('subtracts', () => {
                expect(service.evaluateExpression('{q2} - {q1}', answers)).toBe(
                    4,
                );
            });

            it('multiplies', () => {
                expect(service.evaluateExpression('{q1} * {q2}', answers)).toBe(
                    21,
                );
            });

            it('divides', () => {
                expect(
                    service.evaluateExpression('{q2} / {q1}', answers),
                ).toBeCloseTo(2.333);
            });

            it('returns 0 on division by zero', () => {
                expect(service.evaluateExpression('{q1} / 0', answers)).toBe(0);
            });

            it('modulo', () => {
                expect(service.evaluateExpression('{q2} % {q1}', answers)).toBe(
                    1,
                );
            });

            it('power', () => {
                expect(service.evaluateExpression('{q1} ** 2', answers)).toBe(
                    9,
                );
            });

            it('respects operator precedence', () => {
                expect(
                    service.evaluateExpression('{q1} + {q2} * 2', answers),
                ).toBe(17);
            });

            it('respects parentheses', () => {
                expect(
                    service.evaluateExpression('({q1} + {q2}) * 2', answers),
                ).toBe(20);
            });

            it('handles unary minus', () => {
                expect(service.evaluateExpression('-{q1}', answers)).toBe(-3);
            });

            it('handles literal numbers', () => {
                expect(service.evaluateExpression('10 + 5', answers)).toBe(15);
            });
        });

        describe('string operations', () => {
            it('concatenates with + when either side is a string', () => {
                expect(
                    service.evaluateExpression(
                        '{name} + " " + {last}',
                        answers,
                    ),
                ).toBe('Jane Doe');
            });

            it('handles string literals', () => {
                expect(
                    service.evaluateExpression(
                        '"hello" + " " + "world"',
                        answers,
                    ),
                ).toBe('hello world');
            });
        });

        describe('built-in functions', () => {
            it('ROUND with no decimals', () => {
                expect(service.evaluateExpression('ROUND(3.7)', answers)).toBe(
                    4,
                );
            });

            it('ROUND with decimals', () => {
                expect(
                    service.evaluateExpression('ROUND(3.14159, 2)', answers),
                ).toBe(3.14);
            });

            it('FLOOR', () => {
                expect(service.evaluateExpression('FLOOR(3.9)', answers)).toBe(
                    3,
                );
            });

            it('CEIL', () => {
                expect(service.evaluateExpression('CEIL(3.1)', answers)).toBe(
                    4,
                );
            });

            it('ABS of negative', () => {
                expect(service.evaluateExpression('ABS(-5)', answers)).toBe(5);
            });

            it('MIN', () => {
                expect(
                    service.evaluateExpression('MIN({q1}, {q2})', answers),
                ).toBe(3);
            });

            it('MAX', () => {
                expect(
                    service.evaluateExpression('MAX({q1}, {q2})', answers),
                ).toBe(7);
            });

            it('SUM', () => {
                expect(
                    service.evaluateExpression('SUM({q1}, {q2}, 10)', answers),
                ).toBe(20);
            });

            it('CONCAT', () => {
                expect(
                    service.evaluateExpression(
                        'CONCAT({name}, " ", {last})',
                        answers,
                    ),
                ).toBe('Jane Doe');
            });

            it('IF truthy branch', () => {
                expect(
                    service.evaluateExpression(
                        'IF({flag}, "yes", "no")',
                        answers,
                    ),
                ).toBe('yes');
            });

            it('IF falsy branch', () => {
                expect(
                    service.evaluateExpression('IF(0, "yes", "no")', answers),
                ).toBe('no');
            });

            it('nested functions', () => {
                expect(
                    service.evaluateExpression(
                        'ROUND(SUM({q1}, {q2}) / 2, 1)',
                        answers,
                    ),
                ).toBe(5);
            });
        });

        describe('reference resolution', () => {
            it('returns null for missing reference', () => {
                expect(
                    service.evaluateExpression('{missing}', answers),
                ).toBeNull();
            });

            it('returns null on parse error', () => {
                expect(
                    service.evaluateExpression('{unclosed', answers),
                ).toBeNull();
            });
        });

        describe('CALCULATED rule integration', () => {
            it('populates calculatedValues when condition is met', () => {
                const logic: LogicSchema = {
                    version: '1.0',
                    rules: [
                        {
                            id: 'calc1',
                            condition: {
                                questionId: 'q1',
                                operator: ComparisonOperator.IS_NOT_EMPTY,
                            },
                            action: {
                                type: RuleType.CALCULATED,
                                targetId: 'total',
                                targetType: 'question',
                                expression: '{q1} + {q2}',
                            },
                        },
                    ],
                };
                const result = service.evaluateLogic(baseSchema, logic, {
                    q1: 4,
                    q2: 6,
                });
                expect(result.calculatedValues['total']).toBe(10);
            });

            it('uses static value when no expression is set', () => {
                const logic: LogicSchema = {
                    version: '1.0',
                    rules: [
                        {
                            id: 'calc2',
                            condition: {
                                questionId: 'q1',
                                operator: ComparisonOperator.IS_NOT_EMPTY,
                            },
                            action: {
                                type: RuleType.CALCULATED,
                                targetId: 'label',
                                targetType: 'question',
                                value: 'fixed',
                            },
                        },
                    ],
                };
                const result = service.evaluateLogic(baseSchema, logic, {
                    q1: 'anything',
                });
                expect(result.calculatedValues['label']).toBe('fixed');
            });
        });
    });
});
