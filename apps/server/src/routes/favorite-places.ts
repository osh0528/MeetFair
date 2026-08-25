import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

export const favoritePlacesRouter = Router();
favoritePlacesRouter.use(requireAuth);

function userId(request: AuthenticatedRequest) {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

favoritePlacesRouter.get("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const places = await prisma.favoritePlace.findMany({
      where: { userId: userId(request) },
      orderBy: { createdAt: "asc" },
    });
    response.json({
      success: true,
      data: { places: places.map((place) => ({ ...place, createdAt: place.createdAt.toISOString() })) },
    });
  } catch (error) { next(error); }
});

favoritePlacesRouter.post("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = z.object({
      name: z.string().trim().min(1).max(255),
      address: z.string().trim().min(1).max(255),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }).parse(request.body);
    const place = await prisma.favoritePlace.create({
      data: { userId: userId(request), ...input },
    });
    response.status(201).json({
      success: true,
      data: { place: { ...place, createdAt: place.createdAt.toISOString() } },
    });
  } catch (error) { next(error); }
});

favoritePlacesRouter.delete("/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const id = z.string().uuid().parse(request.params.id);
    const result = await prisma.favoritePlace.deleteMany({ where: { id, userId: userId(request) } });
    if (result.count === 0) throw new AppError(404, "FAVORITE_PLACE_NOT_FOUND", "Favorite place was not found.");
    response.status(204).send();
  } catch (error) { next(error); }
});
