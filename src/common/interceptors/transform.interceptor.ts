import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, map } from 'rxjs';

export interface TransformResponse<T> {
  data: T;
  statusCode: number;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, TransformResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<TransformResponse<T>> {
    const statusCode = context.switchToHttp().getResponse<{ statusCode: number }>().statusCode;
    return next.handle().pipe(
      map((data) => ({
        data,
        statusCode,
      })),
    );
  }
}
