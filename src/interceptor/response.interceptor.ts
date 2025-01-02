import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const ctx = context.switchToHttp();
        const response = ctx.getResponse();
        const statusCode = response.statusCode;

        return next.handle().pipe(
            map((data) => {
                // Customize success response structure
                return {
                    status: 'success',
                    message: data.message || 'Operation completed successfully',
                    data: data.data !== undefined ? data.data : data,
                    statusCode,
                    timestamp: new Date().toISOString(),
                };
            }),
        );
    }
}
