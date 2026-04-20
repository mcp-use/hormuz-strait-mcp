import React, { useEffect, useMemo, useState } from "react";
import { useWidget } from "mcp-use/react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  Tooltip,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ALERT_COLORS,
  COUNTRY_COLORS,
  DARK_TILE_ATTR,
  DARK_TILE_URL,
  SHIP_TYPE_COLORS,
  THEME,
} from "../shared/theme";
import type {
  HistoryPoint,
  DisruptionEvent,
  LiveShip,
  PortData,
  SituationProps,
} from "./types";

const CENTER: [number, number] = [26.3, 56.5];
const ZOOM = 8;

function chokepointIcon(): L.DivIcon {
  const html = `
    <div style="
      width: 44px; height: 44px;
      position: relative; transform: translate(-50%, -50%);
    ">
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="${THEME.amber}" stroke-width="1.5">
        <circle cx="22" cy="22" r="9" stroke-dasharray="3 2"/>
        <circle cx="22" cy="22" r="16" stroke-dasharray="1 3" opacity="0.55"/>
        <line x1="22" y1="2"  x2="22" y2="10"/>
        <line x1="22" y1="34" x2="22" y2="42"/>
        <line x1="2"  y1="22" x2="10" y2="22"/>
        <line x1="34" y1="22" x2="42" y2="22"/>
        <circle cx="22" cy="22" r="2.5" fill="${THEME.amberBright}" stroke="none"/>
      </svg>
    </div>
  `;
  return L.divIcon({ html, className: "tactical-crosshair", iconSize: [0, 0], iconAnchor: [0, 0] });
}

function liveShipIcon(ship: LiveShip): L.DivIcon {
  const color = SHIP_TYPE_COLORS[ship.shipType] ?? THEME.textMuted;
  const rotation = ship.heading ?? 0;
  const hasHeading = ship.heading !== null;
  const opacity = ship.stale ? 0.3 : 1;
  const shape = hasHeading
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="${color}" stroke="${THEME.bg}" stroke-width="1">
         <path d="M12 2 L17 11 L14 22 L12 19 L10 22 L7 11 Z"/>
       </svg>`
    : `<svg width="9" height="9" viewBox="0 0 24 24" fill="${color}" stroke="${THEME.bg}" stroke-width="1">
         <rect x="4" y="4" width="16" height="16"/>
       </svg>`;
  const html = `
    <div style="
      width: 14px; height: 14px;
      display: flex; align-items: center; justify-content: center;
      transform: rotate(${rotation}deg);
      opacity: ${opacity};
      filter: drop-shadow(0 0 2px ${color}aa);
    ">${shape}</div>
  `;
  return L.divIcon({
    html,
    className: "tactical-ship",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function PortPopup({ port }: { port: PortData }) {
  const color = COUNTRY_COLORS[port.iso3] ?? THEME.textMuted;
  return (
    <div style={{
      minWidth: 220, fontFamily: THEME.fontMono, fontSize: 11, color: THEME.text,
      background: THEME.surface, padding: "8px 10px", margin: -12,
      border: `1px solid ${color}`,
    }}>
      <div style={{
        fontSize: 10, letterSpacing: 1.5, color, textTransform: "uppercase",
        fontWeight: 700, marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${THEME.border}`,
      }}>
        PORT · {port.iso3}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: THEME.text, fontFamily: THEME.fontSans, letterSpacing: 0.3 }}>
        {port.portName}
      </div>
      <div style={{ lineHeight: 1.7 }}>
        <KV k="COUNTRY" v={port.country} />
        <KV k="ID" v={port.portId} />
        {port.latestDay && (
          <>
            <KV k={port.latestDay.date.toUpperCase()} v={`${port.latestDay.total} calls`} />
            <KV k="BREAKDOWN" v={`T:${port.latestDay.tanker} C:${port.latestDay.container} DB:${port.latestDay.dryBulk}`} />
          </>
        )}
        <KV k="ANNUAL" v={port.annualTotal.toLocaleString()} />
        {port.industry && <KV k="INDUSTRY" v={port.industry} />}
      </div>
    </div>
  );
}

function LiveShipPopup({ ship }: { ship: LiveShip }) {
  const color = SHIP_TYPE_COLORS[ship.shipType] ?? THEME.textMuted;
  return (
    <div style={{
      minWidth: 200, fontFamily: THEME.fontMono, fontSize: 11, color: THEME.text,
      background: THEME.surface, padding: "8px 10px", margin: -12,
      border: `1px solid ${color}`,
    }}>
      <div style={{
        fontSize: 10, letterSpacing: 1.5, color, textTransform: "uppercase",
        fontWeight: 700, marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${THEME.border}`,
      }}>
        VESSEL · {ship.shipType.toUpperCase()}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: THEME.text, fontFamily: THEME.fontSans, letterSpacing: 0.3 }}>
        {ship.name}
      </div>
      <div style={{ lineHeight: 1.7 }}>
        <KV k="MMSI" v={String(ship.mmsi)} />
        <KV k="LAT/LON" v={`${ship.lat.toFixed(4)},${ship.lon.toFixed(4)}`} />
        <KV k="HDG" v={ship.heading !== null ? `${ship.heading}°` : "—"} />
        {ship.stale && <div style={{ color: THEME.amber, marginTop: 4 }}>◈ STALE POSITION</div>}
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: THEME.textMuted, width: 70, fontSize: 10, letterSpacing: 0.8 }}>{k}</span>
      <span style={{ color: THEME.text, flex: 1, fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
}

function TelemetryChip({
  label, value, sublabel, color = THEME.amber,
}: { label: string; value: string | number; sublabel?: string; color?: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2,
      padding: "10px 12px",
      borderLeft: `2px solid ${color}`,
      background: THEME.surface,
      minWidth: 0,
    }}>
      <span style={{ fontSize: 9, color: THEME.textMuted, letterSpacing: 1.2, fontWeight: 600, textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontSize: 18, color: THEME.text, fontFamily: THEME.fontMono, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
        {value}
      </span>
      {sublabel && (
        <span style={{ fontSize: 9, color: THEME.textMuted, letterSpacing: 0.5 }}>
          {sublabel}
        </span>
      )}
    </div>
  );
}

function AlertBar({ disruption }: { disruption: DisruptionEvent | undefined }) {
  if (!disruption) {
    return (
      <div style={{
        padding: "8px 14px",
        background: `${THEME.green}15`,
        borderBottom: `2px solid ${THEME.green}`,
        fontFamily: THEME.fontMono, fontSize: 11, letterSpacing: 1,
        display: "flex", alignItems: "center", gap: 10,
        color: THEME.green,
      }}>
        <div style={{ width: 6, height: 6, background: THEME.green, boxShadow: `0 0 6px ${THEME.green}` }} />
        <strong>STATUS NOMINAL</strong>
        <span style={{ color: THEME.textMuted }}>· NO ACTIVE IMF DISRUPTION AFFECTING CHOKEPOINT6</span>
      </div>
    );
  }
  const color = ALERT_COLORS[disruption.alertLevel] ?? THEME.textMuted;
  return (
    <div style={{
      padding: "10px 14px",
      background: `${color}18`,
      borderBottom: `2px solid ${color}`,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      fontFamily: THEME.fontMono,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 8, height: 8, background: color,
          boxShadow: `0 0 8px ${color}`,
          animation: "pulse-dot 1.5s ease-in-out infinite",
        }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, fontWeight: 700, color }}>
            ALERT · {disruption.alertLevel} · ONGOING SINCE {disruption.fromDate?.toUpperCase()}
          </div>
          <div style={{ fontSize: 13, color: THEME.text, fontFamily: THEME.fontSans, fontWeight: 600 }}>
            {disruption.htmlName}
          </div>
        </div>
      </div>
      <div style={{
        fontSize: 9, padding: "4px 10px", letterSpacing: 1.5, fontWeight: 700,
        background: color, color: THEME.bg,
      }}>
        IMF · PORTWATCH
      </div>
    </div>
  );
}

function LiveTimer({ at }: { at: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ageSec = Math.max(0, Math.round((now - new Date(at).getTime()) / 1000));
  return <span>T+{String(ageSec).padStart(3, "0")}S</span>;
}

function Sparkline({ history, width = 640, height = 70 }: { history: HistoryPoint[]; width?: number; height?: number }) {
  const { path, area, max, points } = useMemo(() => {
    if (history.length === 0) return { path: "", area: "", max: 1, points: [] as Array<{x:number;y:number;d:HistoryPoint}> };
    const reversed = [...history].reverse();
    const max = Math.max(...reversed.map((d) => d.total), 1);
    const stepX = width / Math.max(reversed.length - 1, 1);
    const pts = reversed.map((d, i) => {
      const x = i * stepX;
      const y = height - (d.total / max) * (height - 8) - 4;
      return { x, y, d };
    });
    return {
      path: pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
      area: `M0,${height} ${pts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} L${width},${height} Z`,
      max,
      points: pts,
    };
  }, [history, width, height]);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={THEME.amber} stopOpacity="0.28" />
          <stop offset="1" stopColor={THEME.amber} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* grid */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} y1={height * f} x2={width} y2={height * f}
          stroke={THEME.border} strokeWidth={0.5} strokeDasharray="2 3" />
      ))}
      <path d={area} fill="url(#sparkFill)" />
      <path d={path} fill="none" stroke={THEME.amber} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
      {points.length > 0 && (
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={3} fill={THEME.amberBright} />
      )}
      <text x={4} y={11} fontSize="9" fill={THEME.textMuted} style={{ fontFamily: THEME.fontMono, letterSpacing: 1 }}>
        MAX {max}
      </text>
      <text x={width - 4} y={11} fontSize="9" fill={THEME.textMuted} textAnchor="end" style={{ fontFamily: THEME.fontMono, letterSpacing: 1 }}>
        LATEST {history[0]?.total ?? 0}
      </text>
    </svg>
  );
}

function portRadius(annual: number): number {
  if (annual <= 0) return 3;
  return Math.max(3, Math.min(14, Math.sqrt(annual) / 11));
}

function Legend({ showPorts, showLive }: { showPorts: boolean; showLive: boolean }) {
  return (
    <div style={{
      position: "absolute", bottom: 12, right: 12, zIndex: 1000,
      background: `${THEME.surface}ee`,
      border: `1px solid ${THEME.border}`,
      padding: "10px 12px", minWidth: 180,
      fontFamily: THEME.fontMono, fontSize: 10, color: THEME.textSecondary,
    }}>
      <div style={{ fontSize: 9, color: THEME.textMuted, letterSpacing: 1.5, fontWeight: 700, marginBottom: 6 }}>
        LEGEND
      </div>
      {showLive && (
        <>
          <div style={{ color: THEME.textMuted, fontSize: 9, margin: "6px 0 3px" }}>VESSELS</div>
          {Object.entries(SHIP_TYPE_COLORS).slice(0, 6).map(([k, c]) => (
            <div key={k} style={{ display: "flex", gap: 6, alignItems: "center", margin: "2px 0" }}>
              <div style={{ width: 8, height: 8, background: c }} />
              <span>{k}</span>
            </div>
          ))}
        </>
      )}
      {showPorts && (
        <>
          <div style={{ color: THEME.textMuted, fontSize: 9, margin: "8px 0 3px" }}>PORTS · BY COUNTRY</div>
          {Object.entries(COUNTRY_COLORS).map(([iso3, c]) => (
            <div key={iso3} style={{ display: "flex", gap: 6, alignItems: "center", margin: "2px 0" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
              <span>{iso3}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default function HormuzMapInner() {
  const { props, isPending } = useWidget<SituationProps>();
  const [showLive, setShowLive] = useState(true);
  const [showPorts, setShowPorts] = useState(true);

  if (isPending || !props?.chokepoint) {
    return (
      <div style={{
        height: 760, background: THEME.bg, color: THEME.amber,
        fontFamily: THEME.fontMono, fontSize: 11, letterSpacing: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {"// ACQUIRING HORMUZ TACTICAL FEED …"}
      </div>
    );
  }

  const { chokepoint, latest, history, summary, disruptions, ports, liveShips, liveFetchedAt } = props;
  const activeDisruption = disruptions[0];
  const latestTotal = latest?.total ?? 0;
  const baseline = chokepoint.historicalDaily;
  const pctOfBaseline = baseline > 0 ? Math.round((latestTotal / baseline) * 100) : 0;
  const drop = 100 - pctOfBaseline;
  const dropColor = drop > 50 ? THEME.red : drop > 20 ? THEME.orange : THEME.green;

  return (
    <div style={{
      background: THEME.bg, color: THEME.text,
      fontFamily: THEME.fontSans,
      border: `1px solid ${THEME.border}`,
      overflow: "hidden",
    }}>
      <style>{`
        .tactical-ship, .tactical-crosshair { background: transparent !important; border: 0 !important; }
        .tactical-crosshair { pointer-events: none; }
        .leaflet-container { font-family: ${THEME.fontSans}; background: ${THEME.bg}; }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: transparent !important; box-shadow: none !important; border: 0 !important; padding: 0 !important;
        }
        .leaflet-popup-content { margin: 12px !important; width: auto !important; }
        .leaflet-control-zoom a {
          background: ${THEME.surface} !important; color: ${THEME.text} !important;
          border: 1px solid ${THEME.border} !important;
        }
        .leaflet-control-attribution {
          background: ${THEME.surface}dd !important; color: ${THEME.textMuted} !important;
          border: 1px solid ${THEME.border}; font-size: 9px !important;
        }
        .leaflet-control-attribution a { color: ${THEME.textSecondary} !important; }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>

      {/* HEADER */}
      <div style={{
        padding: "10px 14px",
        background: THEME.bgGrid,
        borderBottom: `1px solid ${THEME.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 8, height: 8, background: THEME.amber,
            animation: "pulse-dot 1.5s ease-in-out infinite",
            boxShadow: `0 0 8px ${THEME.amber}`,
          }} />
          <div>
            <div style={{ fontSize: 9, color: THEME.textMuted, letterSpacing: 2, fontWeight: 700 }}>
              HORMUZ-WATCH · STRAIT TACTICAL OVERVIEW
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: THEME.text, letterSpacing: 0.3, marginTop: 2 }}>
              STRAIT OF HORMUZ <span style={{ color: THEME.textMuted, fontWeight: 400 }}>/ CHOKEPOINT6</span>
            </div>
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          fontFamily: THEME.fontMono, fontSize: 10, color: THEME.textSecondary, letterSpacing: 1,
        }}>
          <span>{chokepoint.lat.toFixed(4)}°N {chokepoint.lon.toFixed(4)}°E</span>
          <span style={{ color: THEME.textDim }}>·</span>
          <LiveTimer at={liveFetchedAt} />
        </div>
      </div>

      <AlertBar disruption={activeDisruption} />

      {/* TELEMETRY */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 1,
        background: THEME.border,
        borderBottom: `1px solid ${THEME.border}`,
      }}>
        <TelemetryChip label="TRANSITS" value={latest ? latest.total : "—"} sublabel={latest?.date ?? ""} color={THEME.amber} />
        <TelemetryChip label="BASELINE" value={`~${baseline}`} sublabel="SHIPS/DAY (HIST.)" color={THEME.textSecondary} />
        <TelemetryChip label="Δ vs BASELINE" value={latest ? `−${drop}%` : "—"} sublabel={latest ? "BELOW NORMAL" : ""} color={dropColor} />
        <TelemetryChip label="30D AVG / PEAK" value={summary ? `${summary.avg30d} / ${summary.peak30d}` : "—"} color={THEME.textSecondary} />
        <TelemetryChip label="LIVE VESSELS" value={liveShips.length} sublabel="IN BBOX" color={THEME.cyan} />
      </div>

      {/* MAP */}
      <div style={{ position: "relative", height: 500, background: THEME.bgGrid }}>
        <MapContainer center={CENTER} zoom={ZOOM} style={{ width: "100%", height: "100%", background: THEME.bg }} scrollWheelZoom>
          <TileLayer url={DARK_TILE_URL} attribution={DARK_TILE_ATTR} />

          {disruptions.map((d) =>
            d.polygon && d.polygon.length > 2 ? (
              <Polygon
                key={d.eventId}
                positions={d.polygon}
                pathOptions={{
                  color: ALERT_COLORS[d.alertLevel] ?? THEME.textMuted,
                  weight: 1.5,
                  fillOpacity: 0.1,
                  fillColor: ALERT_COLORS[d.alertLevel] ?? THEME.textMuted,
                  dashArray: "4 3",
                }}
              >
                <Tooltip direction="top" sticky>
                  <span style={{ fontFamily: THEME.fontMono, fontSize: 10 }}>
                    <strong>{d.htmlName}</strong> · {d.alertLevel}
                  </span>
                </Tooltip>
              </Polygon>
            ) : null,
          )}

          <Marker position={[chokepoint.lat, chokepoint.lon]} icon={chokepointIcon()}>
            <Popup>
              <div style={{
                minWidth: 220, fontFamily: THEME.fontMono, fontSize: 11, color: THEME.text,
                background: THEME.surface, padding: "8px 10px", margin: -12,
                border: `1px solid ${THEME.amber}`,
              }}>
                <div style={{
                  fontSize: 10, letterSpacing: 1.5, color: THEME.amber, textTransform: "uppercase",
                  fontWeight: 700, marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${THEME.border}`,
                }}>
                  CHOKEPOINT · STRAIT
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: THEME.text, fontFamily: THEME.fontSans }}>
                  {chokepoint.portName}
                </div>
                {latest && (
                  <>
                    <KV k="TRANSITS" v={`${latest.total} · ${latest.date}`} />
                    <KV k="TANKER" v={String(latest.tanker)} />
                    <KV k="DRY BULK" v={String(latest.dryBulk)} />
                    <KV k="CONTAINER" v={String(latest.container)} />
                  </>
                )}
                <KV k="BASELINE" v={`~${baseline}/day`} />
                <KV k="ANNUAL" v={chokepoint.historicalAnnual.toLocaleString()} />
              </div>
            </Popup>
          </Marker>

          {showPorts && ports.map((port) => (
            <CircleMarker
              key={port.portId}
              center={[port.lat, port.lon]}
              radius={portRadius(port.annualTotal)}
              pathOptions={{
                color: THEME.bg,
                weight: 1.2,
                fillColor: COUNTRY_COLORS[port.iso3] ?? THEME.textMuted,
                fillOpacity: 0.9,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <span style={{ fontFamily: THEME.fontMono, fontSize: 10 }}>
                  <strong>{port.portName}</strong> · {port.iso3}
                  {port.latestDay ? ` · ${port.latestDay.total} calls ${port.latestDay.date}` : ""}
                </span>
              </Tooltip>
              <Popup>
                <PortPopup port={port} />
              </Popup>
            </CircleMarker>
          ))}

          {showLive && liveShips.map((ship) => (
            <Marker
              key={`live-${ship.mmsi}`}
              position={[ship.lat, ship.lon]}
              icon={liveShipIcon(ship)}
            >
              <Popup>
                <LiveShipPopup ship={ship} />
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Layer panel */}
        <div style={{
          position: "absolute", top: 12, left: 12, zIndex: 1000,
          background: `${THEME.surface}ee`,
          border: `1px solid ${THEME.border}`,
          padding: "10px 12px",
          fontFamily: THEME.fontMono, fontSize: 11, color: THEME.text,
          minWidth: 180,
        }}>
          <div style={{ fontSize: 9, color: THEME.textMuted, letterSpacing: 1.5, fontWeight: 700, marginBottom: 6 }}>
            LAYERS
          </div>
          <LayerToggle label="Live vessels" checked={showLive} onChange={setShowLive} count={liveShips.length} color={THEME.cyan} />
          <LayerToggle label="Ports" checked={showPorts} onChange={setShowPorts} count={ports.length} color={THEME.amber} />
        </div>

        {/* Classification */}
        <div style={{
          position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 1000,
          background: `${THEME.surface}dd`,
          border: `1px solid ${THEME.border}`,
          padding: "4px 10px",
          fontFamily: THEME.fontMono, fontSize: 9, letterSpacing: 2, color: THEME.textSecondary,
        }}>
          UNCLASS // OPEN-SOURCE // IMF+AIS
        </div>

        <Legend showLive={showLive} showPorts={showPorts} />
      </div>

      {/* TREND */}
      <div style={{
        padding: "12px 14px",
        borderTop: `1px solid ${THEME.border}`,
        background: THEME.bgGrid,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: THEME.textMuted, letterSpacing: 2, fontWeight: 700 }}>
            TRANSIT TREND · {history.length}D · IMF CHOKEPOINT6
          </div>
          {summary && (
            <div style={{ fontFamily: THEME.fontMono, fontSize: 10, color: THEME.textSecondary, letterSpacing: 1 }}>
              AVG {summary.avg30d} · PEAK {summary.peak30d} · TROUGH {summary.trough30d}
            </div>
          )}
        </div>
        <Sparkline history={history} />
      </div>

      {/* FOOTER */}
      <div style={{
        padding: "6px 14px", background: THEME.bgGrid,
        borderTop: `1px solid ${THEME.border}`,
        fontSize: 9, color: THEME.textMuted, letterSpacing: 1,
        display: "flex", justifyContent: "space-between", fontFamily: THEME.fontMono,
      }}>
        <span>SRC · IMF PORTWATCH / VESSELFINDER AIS / CARTO DARK</span>
        <span>{ports.length} GULF PORTS · {disruptions.length} ACTIVE EVENT{disruptions.length === 1 ? "" : "S"}</span>
      </div>
    </div>
  );
}

function LayerToggle({
  label, checked, onChange, count, color,
}: { label: string; checked: boolean; onChange: (b: boolean) => void; count: number; color: string }) {
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer",
    }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 14, height: 14,
          border: `1px solid ${checked ? color : THEME.border}`,
          background: checked ? color : "transparent",
          position: "relative",
        }}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={THEME.bg} strokeWidth="3" style={{ display: "block" }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <span style={{ flex: 1, color: THEME.text, fontFamily: THEME.fontSans, fontSize: 11 }}>{label}</span>
      <span style={{ color, fontFamily: THEME.fontMono, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{count}</span>
    </label>
  );
}
