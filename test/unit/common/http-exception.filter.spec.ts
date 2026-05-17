import {
    ArgumentsHost,
    BadRequestException,
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';
import { ErrorCodes } from '../../../src/common/errors/error-codes';

interface JsonBody {
    statusCode: number;
    code: string;
    message: string;
    errors?: unknown;
    timestamp: string;
    path: string;
}

function makeHost(
    method = 'POST',
    url = '/surveys',
): {
    host: ArgumentsHost;
    statusMock: jest.Mock;
    jsonMock: jest.Mock<JsonBody, [JsonBody]>;
} {
    const jsonMock = jest.fn((body: JsonBody) => body);
    const statusMock = jest.fn(() => ({ json: jsonMock }));
    const host = {
        switchToHttp: () => ({
            getResponse: () => ({ status: statusMock }),
            getRequest: () => ({ method, url }),
        }),
    } as unknown as ArgumentsHost;
    return { host, statusMock, jsonMock };
}

describe('HttpExceptionFilter', () => {
    const filter = new HttpExceptionFilter();

    it('passes through an explicit code on the exception payload', () => {
        const { host, jsonMock } = makeHost();
        filter.catch(
            new NotFoundException({
                code: ErrorCodes.SURVEY_NOT_FOUND,
                message: 'Survey with ID "abc" not found',
            }),
            host,
        );
        expect(jsonMock).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'SURVEY_NOT_FOUND',
                message: 'Survey with ID "abc" not found',
                statusCode: 404,
            }),
        );
    });

    it('preserves an `errors` array when present', () => {
        const { host, jsonMock } = makeHost();
        filter.catch(
            new BadRequestException({
                code: ErrorCodes.INVALID_SCHEMA,
                message: 'Invalid survey schema',
                errors: ['pages[0].name is required'],
            }),
            host,
        );
        expect(jsonMock).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'INVALID_SCHEMA',
                errors: ['pages[0].name is required'],
            }),
        );
    });

    it('falls back to a status-derived code when no explicit code is set', () => {
        const { host, jsonMock } = makeHost();
        filter.catch(new ForbiddenException('Access denied'), host);
        expect(jsonMock).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'FORBIDDEN',
                statusCode: 403,
            }),
        );
    });

    it('maps each documented status to its generic code', () => {
        const cases: Array<[() => Error, string, number]> = [
            [() => new BadRequestException('x'), 'BAD_REQUEST', 400],
            [() => new UnauthorizedException('x'), 'UNAUTHORIZED', 401],
            [() => new ForbiddenException('x'), 'FORBIDDEN', 403],
            [() => new NotFoundException('x'), 'NOT_FOUND', 404],
        ];
        for (const [factory, expectedCode, expectedStatus] of cases) {
            const { host, jsonMock } = makeHost();
            filter.catch(factory() as never, host);
            expect(jsonMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: expectedCode,
                    statusCode: expectedStatus,
                }),
            );
        }
    });

    it('handles plain-string exception payloads (Nest builtin shape)', () => {
        const { host, jsonMock } = makeHost();
        // Throwing `new BadRequestException('msg')` results in
        // exception.getResponse() returning a string in some Nest paths.
        const exception = new BadRequestException('something went wrong');
        // Force-string the internal response to exercise the string branch.
        (exception as unknown as { response: string }).response =
            'something went wrong';
        filter.catch(exception, host);
        expect(jsonMock).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'BAD_REQUEST',
                message: 'something went wrong',
            }),
        );
    });

    it('includes path and timestamp on every response', () => {
        const { host, jsonMock } = makeHost('GET', '/surveys/abc');
        filter.catch(new NotFoundException('x'), host);
        const body = jsonMock.mock.calls[0][0];
        expect(body.path).toBe('/surveys/abc');
        expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});
