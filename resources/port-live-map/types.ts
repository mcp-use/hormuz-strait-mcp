import { z } from "zod";

export const liveShipSchema = z.object({
  mmsi: z.number(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  heading: z.number().nullable(),
  shipType: z.string(),
  stale: z.boolean(),
  distanceKm: z.number(),
});

export const propsSchema = z.object({
  port: z.object({
    portId: z.string(),
    portName: z.string(),
    country: z.string(),
    iso3: z.string(),
    lat: z.number(),
    lon: z.number(),
    annualTotal: z.number(),
    industry: z.string(),
  }),
  radiusKm: z.number(),
  fetchedAt: z.string(),
  totalShipsGlobally: z.number(),
  ships: z.array(liveShipSchema),
  typeCounts: z.record(z.string(), z.number()),
});

export type PortLiveShip = z.infer<typeof liveShipSchema>;
export type PortLiveProps = z.infer<typeof propsSchema>;
