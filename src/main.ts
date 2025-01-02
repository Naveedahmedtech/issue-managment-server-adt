import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {ValidationPipe, VersioningType} from "@nestjs/common";
import {WinstonModule} from "nest-winston";
import * as winston from 'winston';
import {PrismaExceptionFilter} from "./filters/prisma-exception.filter";
import {ResponseInterceptor} from "./interceptor/response.interceptor";


async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.colorize(),
              winston.format.printf(({ timestamp, level, message }) => {
                return `[${timestamp}] ${level}: ${message}`;
              }),
          ),
        }),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
        }),
      ],
    }),
  });
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI, // URI-based versioning
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Strip unknown properties
    forbidNonWhitelisted: true, // Throw errors for unknown properties
    transform: true, // Automatically transform payloads to DTO instances
  }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
