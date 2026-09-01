import { requestContext } from './request-context.middleware';

function run(value?: string) {
  const request = { headers: {}, get: jest.fn().mockReturnValue(value) } as any;
  const response = { setHeader: jest.fn() } as any;
  const next = jest.fn();
  requestContext(request, response, next);
  return { request, response, next };
}

describe('requestContext', () => {
  it('preserves a bounded safe correlation id', () => {
    const result = run('edge:request-123');
    expect(result.request.headers['x-request-id']).toBe('edge:request-123');
    expect(result.response.setHeader).toHaveBeenCalledWith('x-request-id', 'edge:request-123');
    expect(result.next).toHaveBeenCalledTimes(1);
  });

  it.each(['bad id', '<script>', 'x'.repeat(101)])('replaces an unsafe correlation id: %s', value => {
    const result = run(value);
    expect(result.request.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.request.headers['x-request-id']).not.toBe(value);
  });
});
