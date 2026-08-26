INSERT INTO "MiniHome" ("id", "userId", "profileStatus", "profileBio", "profileEmoji", "profileTheme", "profileMusicTitle", "profileMusicData", "profileMusicMimeType", "profileMusicUpdatedAt", "profileUpdatedAt", "createdAt")
SELECT
  gen_random_uuid()::text,
  u.id,
  u."profileStatus",
  u."profileBio",
  u."profileEmoji",
  u."profileTheme",
  u."profileMusicTitle",
  u."profileMusicData",
  u."profileMusicMimeType",
  u."profileMusicUpdatedAt",
  u."profileUpdatedAt",
  NOW()
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1 FROM "MiniHome" m WHERE m."userId" = u.id
);
