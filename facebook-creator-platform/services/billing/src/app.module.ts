import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { LoggerModule } from 'nestjs-pino';
import { Plan } from './entities/plan.entity';
import { Subscription } from './entities/subscription.entity';
import { BillingEvent } from './entities/billing-event.entity';
import { BillingModule } from './billing.module';

/**
 * Root application module for `services/billing`.
 *
 * Sets up:
 * - **ConfigModule** — loads the root `.env` file (shared with apps/api in monorepo).
 * - **LoggerModule** — Pino HTTP logger; redacts `stripeCustomerId` from logs.
 * - **MikroOrmModule** — PostgreSQL connection to the `billing` schema.
 * - **RabbitMQModule** — connects to `fcp.events` exchange for publishing billing events.
 * - **BillingModule** — Plans, Subscriptions, Stripe Checkout, and state machine (T3.2).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), '../../.env')],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        redact: {
          paths: ['*.stripeCustomerId', '*.stripeSubscriptionId'],
          censor: '[REDACTED]',
        },
        transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
      },
    }),
    MikroOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        driver: PostgreSqlDriver,
        clientUrl: config.getOrThrow<string>('DATABASE_URL'),
        schema: 'billing',
        entities: [Plan, Subscription, BillingEvent],
        metadataProvider: TsMorphMetadataProvider,
        migrations: {
          path: './src/migrations',
          glob: '!(*.d).{js,ts}',
          transactional: true,
        },
        extensions: [Migrator],
        allowGlobalContext: false,
      }),
      inject: [ConfigService],
    }),
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672'),
        exchanges: [
          { name: 'fcp.events', type: 'topic', options: { durable: true } },
          { name: 'fcp.dlq', type: 'fanout', options: { durable: true } },
        ],
        connectionInitOptions: { wait: false },
        enableControllerDiscovery: false,
      }),
    }),
    BillingModule,
  ],
})
export class AppModule {}
