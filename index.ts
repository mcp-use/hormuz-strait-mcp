import { MCPServer, error, object, text, widget } from "mcp-use/server";
import { z } from "zod";
import {
  CHOKEPOINTS,
  GULF_ISO3,
  HORMUZ_ID,
  fetchChokepointHistory,
  fetchChokepointInfo,
  fetchDisruptions,
  fetchLatestForAllChokepoints,
  fetchLatestForPorts,
  fetchPortDaily,
  fetchPortsInCountries,
  summarise,
} from "./lib/portwatch-client.js";
import {
  bboxAround,
  fetchLiveShips,
  filterByRadius,
} from "./lib/vesselfinder-client.js";

const server = new MCPServer({
  name: "hormuz-ships-mcp",
  title: "Hormuz Watch",
  version: "1.0.0",
  description:
    "Tactical maritime situation dashboard for the Strait of Hormuz. IMF disruption polygons, daily chokepoint transit counts, Gulf port activity, and LIVE AIS vessel positions. Ask 'is Hormuz open?', 'what ships are near Fujairah?', 'how does Hormuz compare to Suez/Panama?'.",
  baseUrl: process.env.MCP_URL || "http://localhost:3000",
  host: "0.0.0.0",
  favicon: "favicon.ico",
  websiteUrl: "https://mcp-use.com",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
});

function decimatePolygon(
  poly: [number, number][],
  maxPoints: number,
): [number, number][] {
  if (poly.length <= maxPoints) return poly;
  const step = (poly.length - 1) / (maxPoints - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(poly[Math.round(i * step)]);
  }
  return out;
}

function nearestShips<T extends { lat: number; lon: number }>(
  ships: T[],
  lat: number,
  lon: number,
  max: number,
): T[] {
  if (ships.length <= max) return ships;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  return [...ships]
    .map((s) => {
      const dLat = (s.lat - lat) * 111;
      const dLon = (s.lon - lon) * 111 * cosLat;
      return { s, d2: dLat * dLat + dLon * dLon };
    })
    .sort((a, b) => a.d2 - b.d2)
    .slice(0, max)
    .map((x) => x.s);
}

// ==================== WIDGET TOOLS ====================

server.tool(
  {
    name: "show-hormuz-situation",
    description:
      "PRIMARY TOOL. Render the full Strait of Hormuz tactical dashboard on an interactive map: IMF disruption polygon, all 65 Gulf ports (UAE, Iran, Oman, Qatar, Bahrain, Kuwait, Saudi Arabia) with their latest daily traffic, live AIS vessel positions, active disruption alerts, and a 30-day transit trend. Use for any Hormuz-situation question.",
    schema: z.object({
      days: z
        .number()
        .int()
        .min(7)
        .max(365)
        .optional()
        .describe("Days of history for the trend sparkline (default 30)"),
    }),
    annotations: { readOnlyHint: true },
    widget: {
      name: "hormuz-map",
      invoking: "Acquiring Hormuz tactical feed...",
      invoked: "Hormuz feed online",
    },
  },
  async ({ days = 30 }) => {
    const [info, history, ports, disruptions, live] = await Promise.all([
      fetchChokepointInfo(HORMUZ_ID),
      fetchChokepointHistory(HORMUZ_ID, days),
      fetchPortsInCountries(GULF_ISO3),
      fetchDisruptions({ affectedPortId: HORMUZ_ID, onlyActive: true, limit: 5 }),
      fetchLiveShips(
        { minLat: 25.0, minLon: 55.0, maxLat: 27.5, maxLon: 58.0 },
        9,
      ).catch(() => ({ ships: [], totalShips: 0, fetchedAt: Date.now(), cached: false })),
    ]);

    if (!info) return error("Could not load Strait of Hormuz metadata.");

    const portLatest = await fetchLatestForPorts(ports.map((p) => p.portId));
    const s = summarise(history);
    const latest = s?.latest;
    const historicalDaily = Math.round(info.vesselCountTotal / 365);

    const alert = disruptions[0];
    const alertSummary = alert
      ? `${alert.alertLevel} alert — ${alert.htmlName} (since ${alert.fromDate ?? "?"}).`
      : "No active disruption.";

    const decimatedLiveShips = nearestShips(
      live.ships,
      info.lat,
      info.lon,
      150,
    );

    return widget({
      props: {
        chokepoint: {
          portName: info.portName,
          lat: info.lat,
          lon: info.lon,
          historicalAnnual: info.vesselCountTotal,
          historicalDaily,
        },
        latest: latest
          ? {
              date: latest.date,
              total: latest.total,
              tanker: latest.tanker,
              container: latest.container,
              dryBulk: latest.dryBulk,
            }
          : null,
        history: history.map((d) => ({ date: d.date, total: d.total })),
        summary: s ? {
          avg7d: s.avg7d,
          avg30d: s.avg30d,
          peak30d: s.peak30d,
          trough30d: s.trough30d,
        } : null,
        disruptions: disruptions.map((d) => ({
          eventId: d.eventId,
          htmlName: d.htmlName,
          alertLevel: d.alertLevel,
          fromDate: d.fromDate,
          polygon: d.polygon ? decimatePolygon(d.polygon, 50) : null,
        })),
        ports: ports.map((p) => {
          const day = portLatest.get(p.portId);
          return {
            portId: p.portId,
            portName: p.portName,
            country: p.country,
            iso3: p.iso3,
            lat: p.lat,
            lon: p.lon,
            industry: p.industryTop1,
            annualTotal: p.vesselCountTotal,
            latestDay: day ? {
              date: day.date,
              total: day.portcalls,
              tanker: day.tanker,
              container: day.container,
              dryBulk: day.dryBulk,
            } : null,
          };
        }),
        liveShips: decimatedLiveShips.map((s) => ({
          mmsi: s.mmsi,
          name: s.name || `MMSI ${s.mmsi}`,
          lat: s.lat,
          lon: s.lon,
          heading: s.heading,
          shipType: s.shipType,
          stale: s.stale,
        })),
        liveFetchedAt: new Date(live.fetchedAt).toISOString(),
      },
      output: text(
        `Strait of Hormuz situation — ${alertSummary} ` +
          (latest
            ? `On ${latest.date}, ${latest.total} ships transited (vs ~${historicalDaily} historical daily avg — ${Math.round((1 - latest.total / historicalDaily) * 100)}% below baseline). `
            : "") +
          `${live.ships.length} live vessels tracked in strait bbox. ${ports.length} Gulf ports on display.`,
      ),
    });
  },
);

server.tool(
  {
    name: "show-port-live-map",
    description:
      "Render a focused LIVE AIS map zoomed on a single Gulf port, with a radius circle and every vessel currently inside it. Use when the user asks to see ships near or at a specific port (e.g. 'show me Fujairah right now', 'what's at Jebel Ali'). For portId, use values like 'port362' (Fujairah), 'port744' (Jebel Ali), 'port306' (Dubai), 'port561' (Khor Fakkan), 'port747' (Mina Saqr) — or let the user tell you and look it up from show-hormuz-situation's port list.",
    schema: z.object({
      portId: z
        .string()
        .describe("Gulf port ID, e.g. 'port362' Fujairah, 'port744' Jebel Ali, 'port306' Dubai"),
      radiusKm: z
        .number()
        .min(1)
        .max(100)
        .default(15)
        .describe("Radius around the port to scan, in km (default 15)"),
    }),
    annotations: { readOnlyHint: true },
    widget: {
      name: "port-live-map",
      invoking: "Scanning AIS feed around port...",
      invoked: "Port feed online",
    },
  },
  async ({ portId, radiusKm }) => {
    const ports = await fetchPortsInCountries(GULF_ISO3);
    const port = ports.find((p) => p.portId === portId);
    if (!port) {
      return error(`Port ${portId} not found. Call show-hormuz-situation to see available Gulf port IDs.`);
    }
    const bbox = bboxAround(port.lat, port.lon, radiusKm);
    const { ships, totalShips, fetchedAt } = await fetchLiveShips(bbox, 11);
    const inRadius = filterByRadius(ships, port.lat, port.lon, radiusKm);

    const typeCounts: Record<string, number> = {};
    for (const s of inRadius) typeCounts[s.shipType] = (typeCounts[s.shipType] ?? 0) + 1;

    return widget({
      props: {
        port: {
          portId: port.portId,
          portName: port.portName,
          country: port.country,
          iso3: port.iso3,
          lat: port.lat,
          lon: port.lon,
          annualTotal: port.vesselCountTotal,
          industry: port.industryTop1,
        },
        radiusKm,
        fetchedAt: new Date(fetchedAt).toISOString(),
        totalShipsGlobally: totalShips,
        ships: inRadius
          .map((s) => {
            const dLat = (s.lat - port.lat) * 111.0;
            const dLon = (s.lon - port.lon) * 111.0 * Math.cos((port.lat * Math.PI) / 180);
            const distanceKm = Math.sqrt(dLat * dLat + dLon * dLon);
            return {
              mmsi: s.mmsi,
              name: s.name || `MMSI ${s.mmsi}`,
              lat: s.lat,
              lon: s.lon,
              heading: s.heading,
              shipType: s.shipType,
              stale: s.stale,
              distanceKm: Math.round(distanceKm * 10) / 10,
            };
          })
          .sort((a, b) => a.distanceKm - b.distanceKm),
        typeCounts,
      },
      output: text(
        `${port.portName} (${port.country}) — ${inRadius.length} vessels within ${radiusKm}km. ` +
          Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([t, c]) => `${c} ${t.toLowerCase()}`)
            .join(", ") +
          ".",
      ),
    });
  },
);

// ==================== DATA-ONLY TOOLS ====================

server.tool(
  {
    name: "get-hormuz-disruptions",
    description:
      "List active and recent trade-disruption events affecting the Strait of Hormuz (IMF PortWatch alerts). Returns alert level, name, description, date range, and affected area. Use when the user asks whether there's an event or emergency in Hormuz.",
    schema: z.object({
      onlyActive: z
        .boolean()
        .default(true)
        .describe("Only currently-ongoing events (true) or include recent historical too (false)"),
      limit: z.number().int().min(1).max(50).default(10),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ onlyActive, limit }) => {
    const events = await fetchDisruptions({ affectedPortId: HORMUZ_ID, onlyActive, limit });
    return object({
      count: events.length,
      events: events.map((e) => ({
        eventName: e.eventName,
        title: e.htmlName,
        description: e.htmlDescription,
        alertLevel: e.alertLevel,
        fromDate: e.fromDate,
        toDate: e.toDate,
        affectedPorts: e.affectedPorts,
      })),
    });
  },
);

server.tool(
  {
    name: "get-port-traffic",
    description:
      "Get daily ship-call HISTORY for a specific Gulf port as JSON (not live — 5–7 day lag). Returns last N days with vessel-type breakdown. Use for trend analysis. For live positions, use show-port-live-map instead.",
    schema: z.object({
      portId: z
        .string()
        .describe("Port ID like 'port362' (Fujairah). Available IDs come from show-hormuz-situation."),
      days: z.number().int().min(1).max(90).default(14),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ portId, days }) => {
    const history = await fetchPortDaily(portId, days);
    if (history.length === 0) {
      return error(`No traffic data found for ${portId}. Use show-hormuz-situation to see valid IDs.`);
    }
    return object({
      portId,
      portName: history[0].portName,
      country: history[0].country,
      source: "IMF PortWatch Daily Ports Data",
      days: history,
    });
  },
);

server.tool(
  {
    name: "compare-chokepoints",
    description:
      "Rank all 28 global shipping chokepoints (Suez, Panama, Malacca, Gibraltar, Dover, Bab el-Mandeb, Hormuz, etc.) by latest daily transit count or by a specific vessel type. Use for 'where does Hormuz rank?' or 'busiest chokepoint right now'.",
    schema: z.object({
      vesselType: z
        .enum(["total", "tanker", "container", "dryBulk", "generalCargo", "roro"])
        .default("total"),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ vesselType }) => {
    const latest = await fetchLatestForAllChokepoints();
    const ranked = [...latest].sort(
      (a, b) => (b[vesselType] as number) - (a[vesselType] as number),
    );
    return object({
      metric: vesselType,
      source: "IMF PortWatch Daily Chokepoints Data",
      rankings: ranked.map((d, i) => ({
        rank: i + 1,
        portId: d.portId,
        portName: d.portName,
        date: d.date,
        value: d[vesselType] as number,
        total: d.total,
        capacity: d.capacity,
      })),
    });
  },
);

server.listen().then(() => {
  console.log("Hormuz Watch MCP server online (PortWatch + VesselFinder AIS)");
});
