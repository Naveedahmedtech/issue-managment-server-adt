import { INestApplication, VersioningType } from "@nestjs/common";
import { PrismaExceptionFilter } from "../filters/prisma-exception.filter";
import { ResponseInterceptor } from "../interceptor/response.interceptor";
import * as cookieParser from "cookie-parser";

export async function setupApp(app: INestApplication) {
  const FRONTEND_URL = new RegExp(process.env.FRONTEND_URL);
  const ANGULAR_URL = process.env.ANGULAR_URL;
  console.log("FRONTEND_URL", FRONTEND_URL);
  // Enable CORS
  app.enableCors({
    origin: (origin, callback) => {
      const allowedDomainPattern = /^http:\/\/([a-zA-Z0-9-]+)\.localhost:5713$/;
      if (
        !origin ||
        origin === "http://localhost:5713" ||
        allowedDomainPattern.test(origin) ||
        origin === ANGULAR_URL
      ) {
        callback(null, true); // Allow request
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
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
