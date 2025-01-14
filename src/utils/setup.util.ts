import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { PrismaExceptionFilter } from '../filters/prisma-exception.filter';
import { ResponseInterceptor } from '../interceptor/response.interceptor';
import * as cookieParser from 'cookie-parser';

export async function setupApp(app: INestApplication) {
  // Enable CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  });

  // Use cookie-parser
  app.use(cookieParser());

  // Global filters, interceptors, pipes
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Set global prefix and versioning
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
  });
}
