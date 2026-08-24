-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('PLANNING', 'CONFIRMED', 'TRACKING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SharingStatus" AS ENUM ('NOT_STARTED', 'SHARING', 'PAUSED', 'ARRIVED');

-- CreateEnum
CREATE TYPE "FriendRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MeetingInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "MeetingVisibility" AS ENUM ('PRIVATE', 'PUBLIC_FRIENDS');

-- CreateEnum
CREATE TYPE "LocationShareMode" AS ENUM ('DAY_OF', 'BEFORE_START', 'OFF');

-- CreateEnum
CREATE TYPE "TravelMetric" AS ENUM ('TRANSIT', 'CAR', 'DISTANCE');

-- CreateEnum
CREATE TYPE "OriginType" AS ENUM ('HOME', 'CURRENT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PokeType" AS ENUM ('MEETING', 'CASUAL');

-- CreateEnum
CREATE TYPE "MeetingCallStatus" AS ENUM ('RINGING', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "MeetingCallParticipantStatus" AS ENUM ('RINGING', 'JOINED', 'DECLINED', 'MISSED', 'LEFT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "accountIdChanged" BOOLEAN NOT NULL DEFAULT false,
    "homeAddress" TEXT,
    "homeLatitude" DOUBLE PRECISION,
    "homeLongitude" DOUBLE PRECISION,
    "shareExactLocationWithFriends" BOOLEAN NOT NULL DEFAULT false,
    "currentLatitude" DOUBLE PRECISION,
    "currentLongitude" DOUBLE PRECISION,
    "currentAccuracy" DOUBLE PRECISION,
    "currentLocationUpdatedAt" TIMESTAMP(3),
    "casualPokesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pokeQuietStartMinutes" INTEGER,
    "pokeQuietEndMinutes" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Seoul',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'PLANNING',
    "visibility" "MeetingVisibility" NOT NULL DEFAULT 'PRIVATE',
    "categories" TEXT[],
    "travelMetric" "TravelMetric" NOT NULL DEFAULT 'DISTANCE',
    "locationShareMode" "LocationShareMode" NOT NULL DEFAULT 'BEFORE_START',
    "shareMinutesBefore" INTEGER,
    "voteCountdownEndsAt" TIMESTAMP(3),
    "votingClosedAt" TIMESTAMP(3),
    "placeFinalizedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "locationPurgeAt" TIMESTAMP(3),
    "confirmedPlaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originAddress" TEXT,
    "originType" "OriginType",
    "originLatitude" DOUBLE PRECISION,
    "originLongitude" DOUBLE PRECISION,
    "locationConsent" BOOLEAN NOT NULL DEFAULT false,
    "sharingStatus" "SharingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "readinessVerifiedAt" TIMESTAMP(3),
    "cameraPermissionGranted" BOOLEAN NOT NULL DEFAULT false,
    "microphonePermissionGranted" BOOLEAN NOT NULL DEFAULT false,
    "arrivedAt" TIMESTAMP(3),
    "lastLatitude" DOUBLE PRECISION,
    "lastLongitude" DOUBLE PRECISION,
    "lastAccuracy" DOUBLE PRECISION,
    "lastLocationAt" TIMESTAMP(3),
    "arrivalProximityCount" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationSample" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingJoinRequest" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAAllowsPokesFromB" BOOLEAN NOT NULL DEFAULT true,
    "userBAllowsPokesFromA" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" "FriendRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingInvitation" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "status" "MeetingInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceCandidate" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "providerPlaceId" TEXT,
    "createdById" TEXT,
    "recommendationRank" INTEGER,

    CONSTRAINT "PlaceCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelEstimate" (
    "id" TEXT NOT NULL,
    "placeCandidateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "distanceMeters" INTEGER NOT NULL,

    CONSTRAINT "TravelEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "placeCandidateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poke" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT,
    "senderId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" "PokeType" NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "summarizedAt" TIMESTAMP(3),

    CONSTRAINT "Poke_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingCall" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "status" "MeetingCallStatus" NOT NULL DEFAULT 'RINGING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingCallParticipant" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MeetingCallParticipantStatus" NOT NULL DEFAULT 'RINGING',
    "respondedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "MeetingCallParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_accountId_key" ON "User"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_expoPushToken_key" ON "DeviceToken"("expoPushToken");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_inviteCode_key" ON "Meeting"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_confirmedPlaceId_key" ON "Meeting"("confirmedPlaceId");

-- CreateIndex
CREATE INDEX "Meeting_hostId_idx" ON "Meeting"("hostId");

-- CreateIndex
CREATE INDEX "Meeting_scheduledAt_idx" ON "Meeting"("scheduledAt");

-- CreateIndex
CREATE INDEX "MeetingParticipant_userId_idx" ON "MeetingParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_userId_key" ON "MeetingParticipant"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "LocationSample_participantId_capturedAt_idx" ON "LocationSample"("participantId", "capturedAt");

-- CreateIndex
CREATE INDEX "MeetingJoinRequest_meetingId_status_idx" ON "MeetingJoinRequest"("meetingId", "status");

-- CreateIndex
CREATE INDEX "MeetingJoinRequest_requesterId_status_idx" ON "MeetingJoinRequest"("requesterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingJoinRequest_meetingId_requesterId_key" ON "MeetingJoinRequest"("meetingId", "requesterId");

-- CreateIndex
CREATE INDEX "Friendship_userAId_idx" ON "Friendship"("userAId");

-- CreateIndex
CREATE INDEX "Friendship_userBId_idx" ON "Friendship"("userBId");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_userAId_userBId_key" ON "Friendship"("userAId", "userBId");

-- CreateIndex
CREATE INDEX "FriendRequest_recipientId_status_idx" ON "FriendRequest"("recipientId", "status");

-- CreateIndex
CREATE INDEX "FriendRequest_requesterId_status_idx" ON "FriendRequest"("requesterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FriendRequest_requesterId_recipientId_key" ON "FriendRequest"("requesterId", "recipientId");

-- CreateIndex
CREATE INDEX "MeetingInvitation_invitedUserId_status_idx" ON "MeetingInvitation"("invitedUserId", "status");

-- CreateIndex
CREATE INDEX "MeetingInvitation_invitedById_idx" ON "MeetingInvitation"("invitedById");

-- CreateIndex
CREATE INDEX "MeetingInvitation_meetingId_idx" ON "MeetingInvitation"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingInvitation_meetingId_invitedUserId_key" ON "MeetingInvitation"("meetingId", "invitedUserId");

-- CreateIndex
CREATE INDEX "PlaceCandidate_meetingId_idx" ON "PlaceCandidate"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceCandidate_meetingId_providerPlaceId_key" ON "PlaceCandidate"("meetingId", "providerPlaceId");

-- CreateIndex
CREATE INDEX "TravelEstimate_userId_idx" ON "TravelEstimate"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelEstimate_placeCandidateId_userId_key" ON "TravelEstimate"("placeCandidateId", "userId");

-- CreateIndex
CREATE INDEX "Vote_placeCandidateId_idx" ON "Vote"("placeCandidateId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_meetingId_userId_key" ON "Vote"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "Poke_meetingId_targetId_createdAt_idx" ON "Poke"("meetingId", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "Poke_senderId_idx" ON "Poke"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "Poke_senderId_clientRequestId_key" ON "Poke"("senderId", "clientRequestId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingCall_meetingId_key" ON "MeetingCall"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingCall_roomName_key" ON "MeetingCall"("roomName");

-- CreateIndex
CREATE INDEX "MeetingCall_meetingId_createdAt_idx" ON "MeetingCall"("meetingId", "createdAt");

-- CreateIndex
CREATE INDEX "MeetingCallParticipant_userId_status_idx" ON "MeetingCallParticipant"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingCallParticipant_callId_userId_key" ON "MeetingCallParticipant"("callId", "userId");

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_confirmedPlaceId_fkey" FOREIGN KEY ("confirmedPlaceId") REFERENCES "PlaceCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationSample" ADD CONSTRAINT "LocationSample_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "MeetingParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingJoinRequest" ADD CONSTRAINT "MeetingJoinRequest_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingJoinRequest" ADD CONSTRAINT "MeetingJoinRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingInvitation" ADD CONSTRAINT "MeetingInvitation_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingInvitation" ADD CONSTRAINT "MeetingInvitation_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingInvitation" ADD CONSTRAINT "MeetingInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceCandidate" ADD CONSTRAINT "PlaceCandidate_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelEstimate" ADD CONSTRAINT "TravelEstimate_placeCandidateId_fkey" FOREIGN KEY ("placeCandidateId") REFERENCES "PlaceCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelEstimate" ADD CONSTRAINT "TravelEstimate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_placeCandidateId_fkey" FOREIGN KEY ("placeCandidateId") REFERENCES "PlaceCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poke" ADD CONSTRAINT "Poke_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poke" ADD CONSTRAINT "Poke_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poke" ADD CONSTRAINT "Poke_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingCall" ADD CONSTRAINT "MeetingCall_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingCallParticipant" ADD CONSTRAINT "MeetingCallParticipant_callId_fkey" FOREIGN KEY ("callId") REFERENCES "MeetingCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingCallParticipant" ADD CONSTRAINT "MeetingCallParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
