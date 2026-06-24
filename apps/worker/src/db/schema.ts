import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  avatar: text('avatar'),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  deviceName: text('device_name').notNull(),
  hostname: text('hostname').notNull(),
  os: text('os').notNull(),
  publicKey: text('public_key').notNull(),
  unattendedEnabled: integer('unattended_enabled').notNull().default(0),
  accessPasswordHash: text('access_password_hash'),
  online: integer('online').notNull().default(0),
  lastSeen: integer('last_seen'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  deviceId: text('device_id').notNull(),
  status: text('status').notNull().default('pending'),
  startedAt: integer('started_at'),
  endedAt: integer('ended_at'),
  ip: text('ip'),
  userAgent: text('user_agent'),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  deviceId: text('device_id'),
  action: text('action').notNull(),
  ip: text('ip'),
  metadata: text('metadata'),
  createdAt: integer('created_at').notNull(),
});
