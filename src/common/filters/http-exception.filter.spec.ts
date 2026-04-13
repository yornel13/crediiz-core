import { type ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: { status: jest.Mock; json: jest.Mock };
  let mockRequest: { url: string };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockRequest = { url: '/api/test' };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;
  });

  it('should handle HttpException with string response', () => {
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        path: '/api/test',
      }),
    );
  });

  it('should handle HttpException with object response', () => {
    const exception = new HttpException(
      { message: ['email must be valid'], error: 'Bad Request' },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const body = mockResponse.json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.message).toBe('email must be valid');
    expect(body.error).toBe('Bad Request');
  });

  it('should handle unknown exceptions as 500', () => {
    const exception = new Error('Unexpected failure');
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const body = mockResponse.json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.message).toBe('Internal server error');
    expect(body.error).toBe('InternalServerError');
  });

  it('should include timestamp and path in response', () => {
    const exception = new HttpException('Test', HttpStatus.FORBIDDEN);
    filter.catch(exception, mockHost);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const body = mockResponse.json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.timestamp).toBeDefined();
    expect(body.path).toBe('/api/test');
  });
});
