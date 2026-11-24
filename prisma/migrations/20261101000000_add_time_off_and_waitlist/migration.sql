-- AlterTable
ALTER TABLE "chargers" ADD COLUMN     "away_until" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "waitlist" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "consent_at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'landing',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_email_key" ON "waitlist"("email");


-- Row Level Security on with no policies, as for every table.
ALTER TABLE "waitlist" ENABLE ROW LEVEL SECURITY;
