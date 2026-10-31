-- CreateEnum
CREATE TYPE "VehicleCategory" AS ENUM ('car', 'bike');

-- CreateEnum
CREATE TYPE "ConnectorType" AS ENUM ('type2', 'ccs2', 'chademo', 'gbt');

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" "VehicleCategory" NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "connectors" "ConnectorType"[],
    "uses_adapter" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicles_user_id_idx" ON "vehicles"("user_id");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security on with no policies, as for every table.
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
