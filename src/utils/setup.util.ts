import { INestApplication, VersioningType } from "@nestjs/common";
import { PrismaExceptionFilter } from "../filters/prisma-exception.filter";
import { ResponseInterceptor } from "../interceptor/response.interceptor";
import * as cookieParser from "cookie-parser";
import { json, urlencoded } from 'express';

export async function setupApp(app: INestApplication) {
  // Enable CORS
  app.enableCors({
    origin: [
process.env.FRONTEND_URL,
process.env.ANGULAR_URL,
"http://192.168.18.64:5173",
"http://192.168.18.64:4200",
"https://app.viewsoft.com",
"https://modules.issue.viewsoft.com",
"https://issue.viewsoft.com",
"https://assemble-angular.viewsoft.io",
"https://assemble.viewsoft.io"

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
