const BASE = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services";

const CACHE_TTL_MS = 60 * 60 * 1000;

export interface ChokepointDay {
  date: string;
  portId: string;
  portName: string;
  total: number;
  tanker: number;
  container: number;
  dryBulk: number;
  generalCargo: number;
  cargo: number;
  roro: number;
  capacity: number;
  capacityByType: {
    tanker: number;
    container: number;
    dryBulk: number;
    generalCargo: number;
    roro: number;
    cargo: number;
  };
}

export interface ChokepointInfo {
  portId: string;
  portName: string;
  fullName: string;
  lat: number;
  lon: number;
  vesselCountTotal: number;
  vesselCountTanker: number;
  vesselCountContainer: number;
  vesselCountDryBulk: number;
  vesselCountGeneralCargo: number;
  vesselCountRoRo: number;
  topIndustries: string[];
}

export interface DisruptionEvent {
  eventId: number;
  eventName: string;
  eventType: string;
  htmlName: string;
  htmlDescription: string;
  alertLevel: string;
  country: string | null;
  fromDate: string | null;
  toDate: string | null;
  lat: number;
  lon: number;
  severityText: string | null;
  affectedPorts: string | null;
  polygon?: [number, number][];
}

export interface PortInfo {
  portId: string;
  portName: string;
  country: string;
  iso3: string;
  lat: number;
  lon: number;
  vesselCountTotal: number;
  vesselCountTanker: number;
  vesselCountContainer: number;
  vesselCountDryBulk: number;
  industryTop1: string;
}

export interface PortDay {
  date: string;
  portId: string;
  portName: string;
  country: string;
  portcalls: number;
  tanker: number;
  container: number;
  dryBulk: number;
  generalCargo: number;
  cargo: number;
  roro: number;
}

interface CacheEntry<T> {
  fetchedAt: number;
  data: T;
}

const cache = new Map<string, CacheEntry<unknown>>();

function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(hit.data);
  }
  return loader().then((data) => {
    cache.set(key, { fetchedAt: Date.now(), data });
    return data;
  });
}

async function query<T>(layer: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}/${layer}/FeatureServer/0/query`);
  url.searchParams.set("f", "json");
  url.searchParams.set("outFields", "*");
  url.searchParams.set("outSR", "4326");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`PortWatch ${layer} failed: ${res.status}`);
  return (await res.json()) as T;
}

export const HORMUZ_ID = "chokepoint6";

export const CHOKEPOINTS: Record<string, string> = {
  chokepoint1: "Suez Canal",
  chokepoint2: "Panama Canal",
  chokepoint3: "Bosporus Strait",
  chokepoint4: "Bab el-Mandeb Strait",
  chokepoint5: "Malacca Strait",
  chokepoint6: "Strait of Hormuz",
  chokepoint7: "Cape of Good Hope",
  chokepoint8: "Gibraltar Strait",
  chokepoint9: "Dover Strait",
  chokepoint10: "Oresund Strait",
  chokepoint11: "Taiwan Strait",
  chokepoint12: "Korea Strait",
  chokepoint13: "Tsugaru Strait",
  chokepoint14: "Luzon Strait",
  chokepoint15: "Lombok Strait",
  chokepoint16: "Ombai Strait",
  chokepoint17: "Bohai Strait",
  chokepoint18: "Torres Strait",
  chokepoint19: "Sunda Strait",
  chokepoint20: "Makassar Strait",
  chokepoint21: "Magellan Strait",
  chokepoint22: "Yucatan Channel",
  chokepoint23: "Windward Passage",
  chokepoint24: "Mona Passage",
  chokepoint25: "Balabac Strait",
  chokepoint26: "Bering Strait",
  chokepoint27: "Mindoro Strait",
  chokepoint28: "Kerch Strait",
};

export const GULF_ISO3 = ["ARE", "IRN", "OMN", "QAT", "BHR", "KWT", "SAU"];

// ==================== Daily chokepoint transits ====================

interface ArcFeature<A> {
  attributes: A;
  geometry?: { x?: number; y?: number; rings?: number[][][] };
}

interface DayAttrs {
  date: number; portid: string; portname: string;
  n_container?: number; n_dry_bulk?: number; n_general_cargo?: number;
  n_roro?: number; n_tanker?: number; n_cargo?: number; n_total?: number;
  capacity_container?: number; capacity_dry_bulk?: number; capacity_general_cargo?: number;
  capacity_roro?: number; capacity_tanker?: number; capacity_cargo?: number; capacity?: number;
}

export function fetchChokepointHistory(portId: string, days = 60): Promise<ChokepointDay[]> {
  return cached(`daily:${portId}:${days}`, async () => {
    const data = await query<{ features: ArcFeature<DayAttrs>[] }>(
      "Daily_Chokepoints_Data",
      {
        where: `portid='${portId}'`,
        orderByFields: "date DESC",
        resultRecordCount: String(days),
      },
    );
    return (data.features ?? []).map((f) => {
      const a = f.attributes;
      return {
        date: new Date(a.date).toISOString().slice(0, 10),
        portId: a.portid,
        portName: a.portname,
        total: a.n_total ?? 0,
        tanker: a.n_tanker ?? 0,
        container: a.n_container ?? 0,
        dryBulk: a.n_dry_bulk ?? 0,
        generalCargo: a.n_general_cargo ?? 0,
        cargo: a.n_cargo ?? 0,
        roro: a.n_roro ?? 0,
        capacity: a.capacity ?? 0,
        capacityByType: {
          tanker: a.capacity_tanker ?? 0,
          container: a.capacity_container ?? 0,
          dryBulk: a.capacity_dry_bulk ?? 0,
          generalCargo: a.capacity_general_cargo ?? 0,
          roro: a.capacity_roro ?? 0,
          cargo: a.capacity_cargo ?? 0,
        },
      };
    });
  });
}

export async function fetchLatestForAllChokepoints(): Promise<ChokepointDay[]> {
  return cached("all-latest", async () => {
    const ids = Object.keys(CHOKEPOINTS);
    const results = await Promise.all(
      ids.map((id) => fetchChokepointHistory(id, 1).catch(() => [])),
    );
    return results.map((r) => r[0]).filter((x): x is ChokepointDay => Boolean(x));
  });
}

export function summarise(days: ChokepointDay[]) {
  if (days.length === 0) return null;
  const latest = days[0];
  const last7 = days.slice(0, 7);
  const last30 = days.slice(0, 30);
  const avg = (arr: ChokepointDay[], k: keyof ChokepointDay): number =>
    arr.length === 0 ? 0 : Math.round((arr.reduce((s, d) => s + (d[k] as number), 0) / arr.length) * 10) / 10;
  return {
    latest,
    latestDate: latest.date,
    avg7d: avg(last7, "total"),
    avg30d: avg(last30, "total"),
    capacity7d: avg(last7, "capacity"),
    peak30d: Math.max(...last30.map((d) => d.total)),
    trough30d: Math.min(...last30.map((d) => d.total)),
  };
}

// ==================== Chokepoint info (historical baseline) ====================

interface ChokepointAttrs {
  portid: string; portname: string; fullname: string;
  lat: number; lon: number;
  vessel_count_total: number;
  vessel_count_tanker: number;
  vessel_count_container: number;
  vessel_count_dry_bulk: number;
  vessel_count_general_cargo: number;
  vessel_count_RoRo: number;
  industry_top1?: string; industry_top2?: string; industry_top3?: string;
}

export function fetchChokepointInfo(portId: string): Promise<ChokepointInfo | null> {
  return cached(`info:${portId}`, async () => {
    const data = await query<{ features: ArcFeature<ChokepointAttrs>[] }>(
      "PortWatch_chokepoints_database",
      { where: `portid='${portId}'` },
    );
    const f = data.features?.[0];
    if (!f) return null;
    const a = f.attributes;
    return {
      portId: a.portid,
      portName: a.portname,
      fullName: a.fullname,
      lat: a.lat,
      lon: a.lon,
      vesselCountTotal: a.vessel_count_total,
      vesselCountTanker: a.vessel_count_tanker,
      vesselCountContainer: a.vessel_count_container,
      vesselCountDryBulk: a.vessel_count_dry_bulk,
      vesselCountGeneralCargo: a.vessel_count_general_cargo,
      vesselCountRoRo: a.vessel_count_RoRo,
      topIndustries: [a.industry_top1, a.industry_top2, a.industry_top3].filter(
        (x): x is string => Boolean(x),
      ),
    };
  });
}

// ==================== Disruptions ====================

interface DisruptionAttrs {
  eventid: number; eventtype: string; eventname: string;
  htmlname: string; htmldescription: string;
  alertlevel: string; country: string | null;
  fromdate: number | null; todate: number | null; year?: number;
  severitytext: string | null;
  lat: number; long: number;
  affectedports: string | null;
  n_affectedports?: number;
}

function toDate(ms: number | null | undefined): string | null {
  if (!ms || typeof ms !== "number" || ms < 1e11) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

export function fetchDisruptions(filter: {
  affectedPortId?: string;
  onlyActive?: boolean;
  limit?: number;
}): Promise<DisruptionEvent[]> {
  const key = `disruptions:${filter.affectedPortId ?? "all"}:${filter.limit ?? 20}`;
  return cached(key, async () => {
    const where = filter.affectedPortId
      ? `affectedports LIKE '%${filter.affectedPortId}%'`
      : "1=1";
    const data = await query<{ features: ArcFeature<DisruptionAttrs>[] }>(
      "portwatch_disruptions_database",
      {
        where,
        orderByFields: "fromdate DESC",
        resultRecordCount: String((filter.limit ?? 20) * 3),
      },
    );
    const events = (data.features ?? []).map((f) => {
      const a = f.attributes;
      const geom = f.geometry;
      const polygon = geom?.rings?.[0]?.map((p) => [p[1], p[0]] as [number, number]);
      return {
        eventId: a.eventid,
        eventName: a.eventname,
        eventType: a.eventtype,
        htmlName: a.htmlname,
        htmlDescription: a.htmldescription,
        alertLevel: a.alertlevel,
        country: a.country,
        fromDate: toDate(a.fromdate),
        toDate: toDate(a.todate),
        lat: a.lat,
        lon: a.long,
        severityText: a.severitytext,
        affectedPorts: a.affectedports,
        polygon,
      };
    });
    const now = Date.now();
    const filtered = filter.onlyActive
      ? events.filter((e) => {
          if (!e.toDate) return true;
          return new Date(e.toDate).getTime() > now;
        })
      : events;
    return filtered.slice(0, filter.limit ?? 20);
  });
}

// ==================== Nearby ports ====================

interface PortAttrs {
  portid: string; portname: string; country: string; ISO3: string;
  lat: number; lon: number;
  vessel_count_total: number; vessel_count_tanker: number;
  vessel_count_container: number; vessel_count_dry_bulk: number;
  industry_top1?: string;
}

export function fetchPortsInCountries(iso3s: string[]): Promise<PortInfo[]> {
  return cached(`ports:${iso3s.sort().join(",")}`, async () => {
    const list = iso3s.map((c) => `'${c}'`).join(",");
    const data = await query<{ features: ArcFeature<PortAttrs>[] }>(
      "PortWatch_ports_database",
      { where: `ISO3 IN (${list})` },
    );
    return (data.features ?? []).map((f) => {
      const a = f.attributes;
      return {
        portId: a.portid,
        portName: a.portname,
        country: a.country,
        iso3: a.ISO3,
        lat: a.lat,
        lon: a.lon,
        vesselCountTotal: a.vessel_count_total ?? 0,
        vesselCountTanker: a.vessel_count_tanker ?? 0,
        vesselCountContainer: a.vessel_count_container ?? 0,
        vesselCountDryBulk: a.vessel_count_dry_bulk ?? 0,
        industryTop1: a.industry_top1 ?? "",
      };
    });
  });
}

// ==================== Daily port calls ====================

interface PortDayAttrs {
  date: number; portid: string; portname: string; country: string;
  portcalls: number; portcalls_tanker: number; portcalls_container: number;
  portcalls_dry_bulk: number; portcalls_general_cargo: number; portcalls_roro: number;
  portcalls_cargo: number;
}

export function fetchPortDaily(portId: string, days = 30): Promise<PortDay[]> {
  return cached(`portdaily:${portId}:${days}`, async () => {
    const data = await query<{ features: ArcFeature<PortDayAttrs>[] }>(
      "Daily_Ports_Data",
      {
        where: `portid='${portId}'`,
        orderByFields: "date DESC",
        resultRecordCount: String(days),
      },
    );
    return (data.features ?? []).map((f) => {
      const a = f.attributes;
      return {
        date: new Date(a.date).toISOString().slice(0, 10),
        portId: a.portid,
        portName: a.portname,
        country: a.country,
        portcalls: a.portcalls ?? 0,
        tanker: a.portcalls_tanker ?? 0,
        container: a.portcalls_container ?? 0,
        dryBulk: a.portcalls_dry_bulk ?? 0,
        generalCargo: a.portcalls_general_cargo ?? 0,
        cargo: a.portcalls_cargo ?? 0,
        roro: a.portcalls_roro ?? 0,
      };
    });
  });
}

export function fetchLatestForPorts(portIds: string[]): Promise<Map<string, PortDay>> {
  return cached(`portslatest:${portIds.sort().join(",")}`, async () => {
    const list = portIds.map((p) => `'${p}'`).join(",");
    const data = await query<{ features: ArcFeature<PortDayAttrs>[] }>(
      "Daily_Ports_Data",
      {
        where: `portid IN (${list})`,
        orderByFields: "date DESC",
        resultRecordCount: String(portIds.length * 2),
      },
    );
    const map = new Map<string, PortDay>();
    for (const f of data.features ?? []) {
      const a = f.attributes;
      if (map.has(a.portid)) continue;
      map.set(a.portid, {
        date: new Date(a.date).toISOString().slice(0, 10),
        portId: a.portid,
        portName: a.portname,
        country: a.country,
        portcalls: a.portcalls ?? 0,
        tanker: a.portcalls_tanker ?? 0,
        container: a.portcalls_container ?? 0,
        dryBulk: a.portcalls_dry_bulk ?? 0,
        generalCargo: a.portcalls_general_cargo ?? 0,
        cargo: a.portcalls_cargo ?? 0,
        roro: a.portcalls_roro ?? 0,
      });
    }
    return map;
  });
}
