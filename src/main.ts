import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*', // Untuk tahap development/sidang, tanda '*' artinya mengizinkan semua domain (termasuk Amplify kamu)
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
  console.log(
    `🚀 NestJS running on http://localhost:${process.env.PORT ?? 3000}`,
  );
}
bootstrap();
