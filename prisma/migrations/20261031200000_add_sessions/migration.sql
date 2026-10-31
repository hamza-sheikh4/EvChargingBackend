-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('requested', 'declined', 'expired', 'cancelled', 'accepted', 'active', 'interrupted', 'ended', 'awaiting_host_energy', 'billed', 'flagged', 'paid', 'disputed', 'reviewed', 'resolved');

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "host_id" UUID NOT NULL,
    "charger_id" UUID NOT NULL,
    "state" "SessionState" NOT NULL DEFAULT 'requested',
    "rate_paisa" INTEGER NOT NULL,
    "charger_snapshot" JSONB NOT NULL,
    "driver_snapshot" JSONB NOT NULL,
    "respond_by" TIMESTAMP(3) NOT NULL,
    "start_percent" INTEGER,
    "end_percent" INTEGER,
    "interruption_reason" TEXT,
    "proof_keys" JSONB,
    "events" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_driver_id_created_at_idx" ON "sessions"("driver_id", "created_at");

-- CreateIndex
CREATE INDEX "sessions_host_id_created_at_idx" ON "sessions"("host_id", "created_at");

-- CreateIndex
CREATE INDEX "sessions_charger_id_state_idx" ON "sessions"("charger_id", "state");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_charger_id_fkey" FOREIGN KEY ("charger_id") REFERENCES "chargers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row Level Security on with no policies, as for every table.
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
