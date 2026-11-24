-- Old phone codes are useless once login is by email.
DELETE FROM "otp_codes";
DROP INDEX "otp_codes_phone_created_at_idx";
ALTER TABLE "otp_codes" RENAME COLUMN "phone" TO "email";
ALTER TABLE "otp_codes" ADD COLUMN "purpose" TEXT NOT NULL;
CREATE INDEX "otp_codes_email_created_at_idx" ON "otp_codes"("email", "created_at");

-- Phone is collected in onboarding now, so it may be empty. Email is the login.
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMP(3);
UPDATE "users" SET "email" = lower("email") WHERE "email" IS NOT NULL;
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
