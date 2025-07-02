import { INestApplication, VersioningType } from "@nestjs/common";
import { PrismaExceptionFilter } from "../filters/prisma-exception.filter";
import { ResponseInterceptor } from "../interceptor/response.interceptor";
import * as cookieParser from "cookie-parser";
import { json, urlencoded } from 'express';

export async function setupApp(app: INestApplication) {
  // Enable CORS
  app.enableCors({
    origin: [
      "http://localhost:5173",
      "http://localhost:4200",
      "http://localhost:51142",
      "http://192.168.18.125:5173",
      "http://192.168.18.65:4200",
    ],
    credentials: true,
  });

  // Use cookie-parser
  app.use(cookieParser());

  // Increase payload limits
  app.use(json({ limit: "100mb" }));
  app.use(urlencoded({ limit: "100mb", extended: true }));

  // Global filters, interceptors, pipes
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Set global prefix and versioning
  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
  });
}
