import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export const SKIP_API_KEY = 'skipApiKey';

/**
 * Optional API key guard.
 *
 * Activated only when the API_KEY environment variable is set. If it is not
 * set, all requests are allowed through — making authentication opt-in so the
 * service works out-of-the-box for internal / trusted-network deployments.
 *
 * When active, the key must be provided in one of:
 *   Authorization: Bearer <key>
 *   X-API-Key: <key>
 *
 * Health check routes are automatically exempted.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly apiKey: string | undefined;

  constructor(private readonly reflector: Reflector) {
    this.apiKey = process.env.API_KEY;
  }

  canActivate(context: ExecutionContext): boolean {
    // No API_KEY configured → guard is inactive
    if (!this.apiKey) return true;

    // Allow health endpoints regardless of key
    const req = context.switchToHttp().getRequest<Request>();
    if (req.path.startsWith('/health')) return true;

    // Allow if the handler is explicitly decorated with @SkipApiKey()
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_API_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const providedKey =
      this.extractBearerToken(req.headers['authorization']) ??
      (req.headers['x-api-key'] as string | undefined);

    if (!providedKey || providedKey !== this.apiKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }

  private extractBearerToken(header?: string): string | undefined {
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice(7);
  }
}
