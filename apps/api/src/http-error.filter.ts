import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = request.get('x-request-id') || 'unknown';
    const record = JSON.stringify({ requestId, method: request.method, path: request.path, status });
    if (status >= 500) this.logger.error(record, exception instanceof Error ? exception.stack : undefined);
    else this.logger.warn(record);
    if (response.headersSent) return;

    if (exception instanceof HttpException) {
      const detail = exception.getResponse();
      const body = typeof detail === 'string'
        ? { statusCode: status, message: detail }
        : detail as Record<string, unknown>;
      response.status(status).json({ ...body, requestId });
      return;
    }
    response.status(status).json({ statusCode: status, message: 'Internal server error', requestId });
  }
}
