import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createLogger } from './utils/logger.util';
import { rootRouteHandler } from './utils/server.util';
import { setupApp } from './utils/setup.util';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: createLogger(),
  });

  // Setup the application with CORS, filters, pipes, etc.
  await setupApp(app);

  // Access the underlying Express instance
  const expressApp = app.getHttpAdapter().getInstance();

  // Root route handler
  expressApp.get('/', rootRouteHandler);

  // Start the application
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
