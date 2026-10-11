import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Caddy / tunnel ortida: haqiqiy mijoz IP si X-Forwarded-For dan (limitlar har IP uchun ishlashi uchun)
  app.set('trust proxy', 'loopback, uniquelocal');
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Taomdosh API').setVersion('0.1').addBearerAuth().build(),
  );
  SwaggerModule.setup('docs', app, doc);
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}
bootstrap();
