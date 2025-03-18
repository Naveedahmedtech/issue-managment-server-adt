import { INestApplication, VersioningType } from "@nestjs/common";
import { PrismaExceptionFilter } from "../filters/prisma-exception.filter";
import { ResponseInterceptor } from "../interceptor/response.interceptor";
import * as cookieParser from "cookie-parser";

export async function setupApp(app: INestApplication) {
  // Enable CORS
  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:4200', 'http://localhost:51142'],
    credentials: true,
  });

  // Use cookie-parser
  app.use(cookieParser());

  // Global filters, interceptors, pipes
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Set global prefix and versioning
  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
  });
}
