import { type CallHandler, type ExecutionContext } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { TransformInterceptor, type TransformResponse } from './transform.interceptor';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
    mockExecutionContext = {
      switchToHttp: () => ({
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;
  });

  it('should wrap response data in { data, statusCode } format', async () => {
    const testData = { id: '1', name: 'Test' };
    mockCallHandler = { handle: () => of(testData) };

    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext, mockCallHandler),
    );

    expect(result).toEqual({
      data: testData,
      statusCode: 200,
    } satisfies TransformResponse<typeof testData>);
  });

  it('should handle null data', async () => {
    mockCallHandler = { handle: () => of(null) };

    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext, mockCallHandler),
    );

    expect(result).toEqual({ data: null, statusCode: 200 });
  });

  it('should preserve the status code from the response', async () => {
    mockExecutionContext = {
      switchToHttp: () => ({
        getResponse: () => ({ statusCode: 201 }),
      }),
    } as unknown as ExecutionContext;
    mockCallHandler = { handle: () => of({ created: true }) };

    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext, mockCallHandler),
    );

    expect(result.statusCode).toBe(201);
  });
});
