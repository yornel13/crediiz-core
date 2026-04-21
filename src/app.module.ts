import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { AdminsModule } from '@/admins/admins.module';
import { AgentsModule } from '@/agents/agents.module';
import { AuthModule } from '@/auth/auth.module';
import { ClientsModule } from '@/clients/clients.module';
import { InteractionsModule } from '@/interactions/interactions.module';
import { FollowUpsModule } from '@/follow-ups/follow-ups.module';
import { NotesModule } from '@/notes/notes.module';
import { SyncModule } from '@/sync/sync.module';
import { DashboardModule } from '@/dashboard/dashboard.module';
import { HealthModule } from '@/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    AdminsModule,
    AgentsModule,
    AuthModule,
    ClientsModule,
    InteractionsModule,
    FollowUpsModule,
    NotesModule,
    SyncModule,
    DashboardModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
