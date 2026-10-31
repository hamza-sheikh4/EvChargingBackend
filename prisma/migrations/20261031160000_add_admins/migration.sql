-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('superadmin', 'admin');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "AdminPermission" AS ENUM ('hosts_view', 'hosts_review', 'listings_view', 'listings_manage', 'users_view', 'users_suspend', 'bookings_view', 'team_manage', 'health_view');

-- AlterTable
ALTER TABLE "users" DROP COLUMN "is_admin";

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'admin',
    "permissions" "AdminPermission"[],
    "status" "AdminStatus" NOT NULL DEFAULT 'active',
    "password_hash" TEXT NOT NULL,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMP(3),
    "two_factor_secret" TEXT,
    "two_factor_enabled_at" TIMESTAMP(3),
    "two_factor_last_step" INTEGER,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_actions" (
    "id" UUID NOT NULL,
    "admin_id" UUID,
    "actor_email" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "details" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE INDEX "admin_actions_target_type_target_id_idx" ON "admin_actions"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "admin_actions_admin_id_created_at_idx" ON "admin_actions"("admin_id", "created_at");

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row Level Security on with no policies, as for every table.
ALTER TABLE "admins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_actions" ENABLE ROW LEVEL SECURITY;
