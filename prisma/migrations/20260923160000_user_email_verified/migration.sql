-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Client logins are only ever created after an emailed code.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "role" = 'CLIENT';

-- Worker/ambassador logins whose address has already been proved with an emailed code.
UPDATE "User" AS u
SET "emailVerifiedAt" = c.first_used
FROM (
  SELECT lower("email") AS email, MIN("usedAt") AS first_used
  FROM "PortalLoginCode"
  WHERE "usedAt" IS NOT NULL
  GROUP BY lower("email")
) AS c
WHERE lower(u."email") = c.email AND u."emailVerifiedAt" IS NULL;
