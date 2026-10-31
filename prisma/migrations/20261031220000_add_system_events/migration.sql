-- CreateEnum
CREATE TYPE "SystemEventKind" AS ENUM ('error', 'crash', 'bug_report', 'event', 'security', 'uptime', 'ping');

-- CreateEnum
CREATE TYPE "SystemEventSource" AS ENUM ('api', 'job', 'mobile', 'admin', 'landing');

-- CreateEnum
CREATE TYPE "SystemEventLevel" AS ENUM ('info', 'warn', 'error');

-- CreateEnum
CREATE TYPE "SystemEventStatus" AS ENUM ('open', 'resolved');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminPermission" ADD VALUE 'health_view_logs';
ALTER TYPE "AdminPermission" ADD VALUE 'health_resolve';

-- CreateTable
CREATE TABLE "system_events" (
    "id" UUID NOT NULL,
    "kind" "SystemEventKind" NOT NULL,
    "source" "SystemEventSource" NOT NULL,
    "level" "SystemEventLevel" NOT NULL DEFAULT 'error',
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "stack" TEXT,
    "context" JSONB,
    "count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SystemEventStatus" NOT NULL DEFAULT 'open',
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "app_version" TEXT,
    "platform" TEXT,
    "device" TEXT,
    "user_id" UUID,
    "screenshot_key" TEXT,

    CONSTRAINT "system_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_events_fingerprint_key" ON "system_events"("fingerprint");

-- CreateIndex
CREATE INDEX "system_events_kind_last_seen_at_idx" ON "system_events"("kind", "last_seen_at");

-- CreateIndex
CREATE INDEX "system_events_source_kind_idx" ON "system_events"("source", "kind");


-- Row Level Security on with no policies, as for every table.
ALTER TABLE "system_events" ENABLE ROW LEVEL SECURITY;
