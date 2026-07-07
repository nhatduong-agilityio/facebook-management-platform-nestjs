import { describe, it, expect, vi } from 'vitest';
import { NotificationService } from './notification.service';
import { INotificationRepository } from './ports/notification.repository.port';
import type { Notification, NotificationType } from './entities/notification.entity';

function makeRepo(opts: {
  findForUser?: () => Promise<Array<Notification & { readStatus: boolean; readAt: Date | null }>>;
  markRead?: (id: string, userId: string) => Promise<boolean>;
}) {
  return {
    findForUser: vi.fn(opts.findForUser ?? (() => Promise.resolve([]))),
    markRead: vi.fn(opts.markRead ?? (() => Promise.resolve(true))),
  } as unknown as INotificationRepository;
}

function makeNotification(overrides: Partial<Notification & { readStatus: boolean; readAt: Date | null }> = {}) {
  return {
    id: 'notif-001',
    workspaceId: 'ws-001',
    type: 'posts.published' as NotificationType,
    title: 'Post published',
    message: 'Your post was published.',
    payload: undefined,
    createdAt: new Date('2026-07-07T00:00:00Z'),
    readStatus: false,
    readAt: null,
    ...overrides,
  };
}

describe('NotificationService', () => {
  it('returns mapped DTOs for user notifications', async () => {
    const repo = makeRepo({ findForUser: () => Promise.resolve([makeNotification()]) });
    const service = new NotificationService(repo);
    const result = await service.getNotificationsForUser('ws-001', 'user-001');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('notif-001');
    expect(result[0].readStatus).toBe(false);
    expect(result[0].readAt).toBeNull();
    expect(result[0].createdAt).toBe('2026-07-07T00:00:00.000Z');
  });

  it('maps readAt to ISO string when present', async () => {
    const readAt = new Date('2026-07-07T01:00:00Z');
    const repo = makeRepo({ findForUser: () => Promise.resolve([makeNotification({ readStatus: true, readAt })]) });
    const service = new NotificationService(repo);
    const [r] = await service.getNotificationsForUser('ws-001', 'user-001');
    expect(r.readAt).toBe('2026-07-07T01:00:00.000Z');
  });

  it('delegates markAsRead to repo.markRead', async () => {
    const repo = makeRepo({});
    const service = new NotificationService(repo);
    const result = await service.markAsRead('notif-001', 'user-001');
    expect(repo.markRead).toHaveBeenCalledWith('notif-001', 'user-001');
    expect(result).toBe(true);
  });

  it('returns false when notification not found', async () => {
    const repo = makeRepo({ markRead: () => Promise.resolve(false) });
    const service = new NotificationService(repo);
    const result = await service.markAsRead('unknown-id', 'user-001');
    expect(result).toBe(false);
  });
});
