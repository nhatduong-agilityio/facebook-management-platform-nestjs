import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { AuditEvent } from './entities/audit-event.entity';
import { IAuditEventRepository } from './ports/audit-event.repository.port';
import { MikroOrmAuditEventRepository } from './adapters/mikro-orm-audit-event.repository';
import { AuditConsumer } from './audit.consumer';
import { AuditService } from './audit.service';
import { AuditMessageController } from './audit.message-controller';

/**
 * Feature module for the audit service.
 *
 * Binds the `IAuditEventRepository` port to its MikroORM MongoDB adapter,
 * registers the wildcard RabbitMQ consumer (`@EventPattern`) and the TCP
 * read handlers (`@MessagePattern`) — both live in `controllers[]` as
 * required by `@nestjs/microservices` for pattern discovery.
 *
 * HTTP read endpoints (`AuditController`) have been removed in TM.10;
 * synchronous reads are now served over TCP from `apps/api`.
 */
@Module({
  imports: [MikroOrmModule.forFeature([AuditEvent])],
  controllers: [AuditConsumer, AuditMessageController],
  providers: [
    AuditService,
    { provide: IAuditEventRepository, useClass: MikroOrmAuditEventRepository },
  ],
})
export class AuditModule {}
