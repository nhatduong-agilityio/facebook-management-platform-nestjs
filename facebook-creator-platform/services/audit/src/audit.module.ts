import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { AuditEvent } from './entities/audit-event.entity';
import { IAuditEventRepository } from './ports/audit-event.repository.port';
import { MikroOrmAuditEventRepository } from './adapters/mikro-orm-audit-event.repository';
import { AuditConsumer } from './audit.consumer';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

/**
 * Feature module for the audit service.
 *
 * Binds the `IAuditEventRepository` port to its MikroORM MongoDB adapter,
 * registers the wildcard RabbitMQ consumer (in `controllers` — required for
 * `@EventPattern` discovery under `@nestjs/microservices`), and exposes HTTP
 * read endpoints.
 */
@Module({
  imports: [MikroOrmModule.forFeature([AuditEvent])],
  controllers: [AuditConsumer, AuditController],
  providers: [
    AuditService,
    { provide: IAuditEventRepository, useClass: MikroOrmAuditEventRepository },
  ],
})
export class AuditModule {}
