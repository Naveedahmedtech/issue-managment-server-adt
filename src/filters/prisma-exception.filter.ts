import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch()
export class PrismaExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(PrismaExceptionFilter.name);

    catch(exception: any, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();

        let status = exception?.status || HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';

        // Handle Prisma errors
        if (exception instanceof Prisma.PrismaClientKnownRequestError) {
            this.logger.error('Database error occurred', exception.message);

            switch (exception.code) {
                case 'P2002': // Unique constraint failed
                    const fields = (exception.meta?.target as string[]) || [];
                    message = `Duplicate entry detected for ${fields.join(', ')}`;
                    status = HttpStatus.CONFLICT;
                    break;
                case 'P2025': // Record not found
                    message = 'The requested resource was not found.';
                    status = HttpStatus.NOT_FOUND;
                    break;
                default:
                    message = 'A database error occurred.';
            }
        } else {
            this.logger.error('Unexpected error occurred', exception);
        } 

        response.status(status).json({
            status: 'error',
            message,
            error: {
                name: exception.name || 'Error',
                message: exception.message,
                ...(exception.meta ? { meta: exception.meta } : {}),
            },
            timestamp: new Date().toISOString(),
            path: request.url,
        });
    }
}
