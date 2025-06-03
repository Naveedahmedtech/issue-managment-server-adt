import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

@Catch()
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = exception?.status || HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "An unexpected error occurred.";
    let fields: string[] = [];
    // Handle Prisma known errors
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      this.logger.error("Database error occurred", exception.message);

      switch (exception.code) {
        case "P2002": {
          fields = (exception.meta?.target as string[]) || [];

          const fieldMessages: Record<string, string> = {
            email: "This email address is already in use.",
            username: "This username is already taken.",
            title: "A project with this title already exists.",
            // Add more fields if needed
          };

          if (fields.length === 1 && fieldMessages[fields[0]]) {
            message = fieldMessages[fields[0]];
          } else {
            const readableFields = fields.map(
              (f) =>
                fieldMessages[f] ||
                f.charAt(0).toUpperCase() + f.slice(1) + " must be unique.",
            );
            message = readableFields.join(" ");
          }

          status = HttpStatus.CONFLICT;
          break;
        }

        case "P2025": // Record not found
          message = "The requested resource was not found.";
          status = HttpStatus.NOT_FOUND;
          break;

        case "P2003": // Foreign key constraint failed
          message =
            "Invalid reference to a related resource. Please ensure all related resources exist.";
          status = HttpStatus.BAD_REQUEST;
          break;

        case "P2000": // Value too long for column
          message =
            "One of the values provided is too long for the database field. Please shorten it.";
          status = HttpStatus.BAD_REQUEST;
          break;

        default:
          message =
            "A database error occurred. Please contact support if the problem persists.";
          break;
      }
    } else if (exception instanceof Prisma.PrismaClientUnknownRequestError) {
      this.logger.error("Unknown database error occurred", exception.message);
      message = "An unknown database error occurred. Please contact support.";
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.error("Validation error occurred", exception.message);
      message = "Invalid data provided. Please check your input and try again.";
      status = HttpStatus.BAD_REQUEST;
    } else {
      this.logger.error(exception.message);
      message = exception.message || message;
    }

    // Send the response
    response.status(status).json({
      status: "error",
      error: {
        name: exception.name || "Error",
        message,
        ...(exception.meta ? { meta: exception.meta } : {}),
      },
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
