import { z } from "zod";

export const latestDaySchema = z.object({
  date: z.string(),
  total: z.number(),
  tanker: z.number(),
  container: z.number(),
  dryBulk: z.number(),
});

export const historyPointSchema = z.object({
  date: z.string(),
  total: z.number(),
});

export const disruptionSchema = z.object({
  eventId: z.number(),
  htmlName: z.string(),
  alertLevel: z.string(),
  fromDate: z.string().nullable(),
  polygon: z.array(z.tuple([z.number(), z.number()])).nullable(),
});

export const portSchema = z.object({
  portId: z.string(),
  portName: z.string(),
  country: z.string(),
  iso3: z.string(),
  lat: z.number(),
  lon: z.number(),
  industry: z.string(),
  annualTotal: z.number(),
  latestDay: z
    .object({
      date: z.string(),
      total: z.number(),
      tanker: z.number(),
      container: z.number(),
      dryBulk: z.number(),
    })
    .nullable(),
});

export const liveShipSchema = z.object({
  mmsi: z.number(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  heading: z.number().nullable(),
  shipType: z.string(),
  stale: z.boolean(),
});

export const propsSchema = z.object({
  chokepoint: z.object({
    portName: z.string(),
    lat: z.number(),
    lon: z.number(),
    historicalAnnual: z.number(),
    historicalDaily: z.number(),
  }),
  latest: latestDaySchema.nullable(),
  history: z.array(historyPointSchema),
  summary: z
    .object({
      avg7d: z.number(),
      avg30d: z.number(),
      peak30d: z.number(),
      trough30d: z.number(),
    })
    .nullable(),
  disruptions: z.array(disruptionSchema),
  ports: z.array(portSchema),
  liveShips: z.array(liveShipSchema),
  liveFetchedAt: z.string(),
});

export type LatestDay = z.infer<typeof latestDaySchema>;
export type HistoryPoint = z.infer<typeof historyPointSchema>;
export type DisruptionEvent = z.infer<typeof disruptionSchema>;
export type PortData = z.infer<typeof portSchema>;
export type LiveShip = z.infer<typeof liveShipSchema>;
export type SituationProps = z.infer<typeof propsSchema>;

export { ALERT_COLORS, COUNTRY_COLORS, SHIP_TYPE_COLORS } from "../shared/theme";
