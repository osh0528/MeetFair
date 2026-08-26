-- New accounts allow casual pokes by default.
ALTER TABLE "User" ALTER COLUMN "casualPokesEnabled" SET DEFAULT true;
