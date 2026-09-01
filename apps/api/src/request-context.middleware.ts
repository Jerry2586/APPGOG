import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,100}$/;

export function requestContext(request: Request, response: Response, next: NextFunction) {
  const supplied = request.get('x-request-id');
  const requestId = supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
  request.headers['x-request-id'] = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}
