import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  response.json({
    success: true,
    data: {
      service: "meetfair-server",
      status: "ok",
      checkedAt: new Date().toISOString(),
    },
  });
});
