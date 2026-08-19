# MeetFair backend

## Start locally

1. Copy `apps/server/.env.example` to `apps/server/.env`.
2. Set `DATABASE_URL` to a running PostgreSQL database and replace `JWT_SECRET` with a private value of at least 32 characters.
3. Run the following commands from the repository root.

```powershell
npm run prisma:generate --workspace @meetfair/server
npm run prisma:migrate --workspace @meetfair/server
npm run dev:server
```

The server starts at `http://localhost:4000`. Every endpoint other than `/api/health`, `/api/auth/register`, and `/api/auth/login` needs this header:

```text
Authorization: Bearer <accessToken>
```

## Implemented HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account and return an access token |
| POST | `/api/auth/login` | Sign in and return an access token |
| GET | `/api/auth/me` | Read the current user |
| POST | `/api/meetings` | Create a meeting and host participation |
| GET | `/api/meetings` | List the current user's meetings |
| POST | `/api/meetings/join` | Join with an invite code |
| GET | `/api/meetings/:meetingId` | Read meeting, participants, candidates, and votes |
| PUT | `/api/meetings/:meetingId/origin` | Save the caller's starting point |
| POST | `/api/meetings/:meetingId/recommendations` | Replace candidates and rank them fairly |
| POST | `/api/meetings/:meetingId/votes` | Cast or change the caller's vote |
| PATCH | `/api/meetings/:meetingId/confirm` | Host confirms a candidate |
| PATCH | `/api/meetings/:meetingId/location-consent` | Grant or revoke location sharing consent |
| PATCH | `/api/meetings/:meetingId/readiness` | Set readiness status |
| POST | `/api/meetings/:meetingId/pokes` | Send a real-time poke to another participant |
| POST | `/api/meetings/:meetingId/complete` | Host ends a meeting and revokes sharing consent |

## Fair-place ranking

The recommendations endpoint takes place candidates plus a travel-time estimate for every participant. This keeps map-provider code separate from the meeting domain while the chosen maps API is undecided. Candidates are ranked by:

1. Lowest maximum travel time.
2. Smallest gap between the shortest and longest participant travel time.
3. Lowest average travel time.

This favors the least-disadvantaged participant before overall convenience.

```json
{
  "candidates": [
    {
      "name": "City Hall Cafe",
      "address": "1 Central Street",
      "latitude": 37.5665,
      "longitude": 126.978,
      "category": "cafe",
      "travelEstimates": [
        { "userId": "participant-uuid", "durationMinutes": 25, "distanceMeters": 6300 }
      ]
    }
  ]
}
```

## Real-time events

Socket.IO connections authenticate with `auth: { token: accessToken }`. A client must emit `meeting:join` before receiving that meeting's events. The server verifies participation and location-sharing consent for every location or status update. Locations are broadcast only; they are not stored in PostgreSQL.
