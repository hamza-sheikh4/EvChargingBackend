-- CreateEnum
CREATE TYPE "ChargerLocation" AS ENUM ('home', 'business');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cnic_back_key" TEXT,
ADD COLUMN     "cnic_front_key" TEXT;

-- CreateTable
CREATE TABLE "chargers" (
    "id" UUID NOT NULL,
    "host_id" UUID NOT NULL,
    "location_type" "ChargerLocation" NOT NULL,
    "area_id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "approx_latitude" DOUBLE PRECISION NOT NULL,
    "approx_longitude" DOUBLE PRECISION NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "connectors" "ConnectorType"[],
    "power_kw" DOUBLE PRECISION NOT NULL,
    "reports_energy" BOOLEAN NOT NULL,
    "charger_photo_key" TEXT,
    "connector_photo_key" TEXT,
    "rate_paisa" INTEGER NOT NULL,
    "hours" JSONB NOT NULL,
    "emergency_availability" BOOLEAN NOT NULL DEFAULT false,
    "listed" BOOLEAN NOT NULL DEFAULT true,
    "last_check_in_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chargers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chargers_host_id_idx" ON "chargers"("host_id");

-- AddForeignKey
ALTER TABLE "chargers" ADD CONSTRAINT "chargers_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security on with no policies, as for every table.
ALTER TABLE "chargers" ENABLE ROW LEVEL SECURITY;
