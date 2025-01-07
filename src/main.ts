import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {ValidationPipe, VersioningType} from "@nestjs/common";
import {PrismaExceptionFilter} from "./filters/prisma-exception.filter";
import {ResponseInterceptor} from "./interceptor/response.interceptor";
import * as cookieParser from 'cookie-parser';
import {createLogger} from "./utils/logger.util";
import * as express from 'express';
import { join } from 'path';


async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: createLogger(),
  });
  app.enableCors({
    origin: process.env.FRONTEND_URL, 
    credentials: true, 
});
  app.use(cookieParser());
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.use('/static', express.static(join(__dirname, '..', 'public')));
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI, // URI-based versioning
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
