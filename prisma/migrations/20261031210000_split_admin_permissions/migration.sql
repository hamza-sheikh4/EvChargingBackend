-- Split the 9 broad admin permissions into specific ones grouped by page.
-- Every existing admin keeps the same access: each old value maps to its new, finer values.

ALTER TYPE "AdminPermission" RENAME TO "AdminPermission_old";

CREATE TYPE "AdminPermission" AS ENUM (
  'hosts_view', 'hosts_view_documents', 'hosts_approve', 'hosts_reject',
  'listings_view', 'listings_view_location', 'listings_pause', 'listings_relist',
  'users_view', 'users_suspend', 'users_unsuspend',
  'bookings_view', 'bookings_view_photos',
  'team_view', 'team_add', 'team_edit', 'team_suspend', 'team_reset', 'team_remove',
  'health_view'
);

CREATE FUNCTION pg_temp.split_permission(old text) RETURNS text[] AS $$
  SELECT CASE old
    WHEN 'hosts_view'      THEN ARRAY['hosts_view', 'hosts_view_documents']
    WHEN 'hosts_review'    THEN ARRAY['hosts_view', 'hosts_approve', 'hosts_reject']
    WHEN 'listings_view'   THEN ARRAY['listings_view', 'listings_view_location']
    WHEN 'listings_manage' THEN ARRAY['listings_view', 'listings_pause', 'listings_relist']
    WHEN 'users_view'      THEN ARRAY['users_view']
    WHEN 'users_suspend'   THEN ARRAY['users_view', 'users_suspend', 'users_unsuspend']
    WHEN 'bookings_view'   THEN ARRAY['bookings_view', 'bookings_view_photos']
    WHEN 'team_manage'     THEN ARRAY['team_view', 'team_add', 'team_edit', 'team_suspend', 'team_reset', 'team_remove']
    WHEN 'health_view'     THEN ARRAY['health_view']
    ELSE ARRAY[]::text[]
  END
$$ LANGUAGE sql IMMUTABLE;

ALTER TABLE "admins" ADD COLUMN "permissions_new" "AdminPermission"[] NOT NULL DEFAULT ARRAY[]::"AdminPermission"[];

UPDATE "admins" SET "permissions_new" = COALESCE((
  SELECT array_agg(DISTINCT value::"AdminPermission")
  FROM unnest("permissions") AS old, unnest(pg_temp.split_permission(old::text)) AS value
), ARRAY[]::"AdminPermission"[]);

ALTER TABLE "admins" DROP COLUMN "permissions";
ALTER TABLE "admins" RENAME COLUMN "permissions_new" TO "permissions";
ALTER TABLE "admins" ALTER COLUMN "permissions" DROP DEFAULT;

DROP TYPE "AdminPermission_old";
