import React, { useEffect, useState } from "react";
import { useWidget } from "mcp-use/react";
import { Circle, MapContainer, Marker, Popup, TileLayer, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  COUNTRY_COLORS,
  DARK_TILE_ATTR,
  DARK_TILE_URL,
  SHIP_TYPE_COLORS,
  THEME,
} from "../shared/theme";
import type { PortLiveProps, PortLiveShip } from "./types";

function crosshairIcon(color: string): L.DivIcon {
  const html = `
    <div style="
      width: 48px; height: 48px;
      position: relative;
      transform: translate(-50%, -50%);
    ">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="${color}" stroke-width="1.5">
        <circle cx="24" cy="24" r="10" stroke-dasharray="3 2"/>
        <circle cx="24" cy="24" r="18" stroke-dasharray="1 3" opacity="0.6"/>
        <line x1="24" y1="2" x2="24" y2="12" />
        <line x1="24" y1="36" x2="24" y2="46" />
        <line x1="2" y1="24" x2="12" y2="24" />
        <line x1="36" y1="24" x2="46" y2="24" />
        <circle cx="24" cy="24" r="2" fill="${color}" stroke="none"/>
      </svg>
    </div>
  `;
  return L.divIcon({
    html,
    className: "port-crosshair",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function shipIcon(ship: PortLiveShip): L.DivIcon {
  const color = SHIP_TYPE_COLORS[ship.shipType] ?? THEME.textMuted;
  const rotation = ship.heading ?? 0;
  const hasHeading = ship.heading !== null;
  const opacity = ship.stale ? 0.35 : 1;

  const arrow = hasHeading
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="${color}" stroke="${THEME.bg}" stroke-width="1.2">
         <path d="M12 1 L18 11 L15 22 L12 18 L9 22 L6 11 Z"/>
       </svg>`
    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="${color}" stroke="${THEME.bg}" stroke-width="1.2">
         <rect x="4" y="4" width="16" height="16"/>
       </svg>`;

  const html = `
    <div style="
      width: 20px; height: 20px;
      display: flex; align-items: center; justify-content: center;
      transform: rotate(${rotation}deg);
      opacity: ${opacity};
      filter: drop-shadow(0 0 3px ${color}88);
    ">
      ${arrow}
    </div>
  `;
  return L.divIcon({
    html,
    className: "tactical-ship",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function ShipPopup({ ship }: { ship: PortLiveShip }) {
  const color = SHIP_TYPE_COLORS[ship.shipType] ?? THEME.textMuted;
  return (
    <div style={{
      minWidth: 200,
      fontFamily: THEME.fontMono,
      fontSize: 11,
      color: THEME.text,
      background: THEME.surface,
      padding: "8px 10px",
      margin: -12,
      border: `1px solid ${color}`,
    }}>
      <div style={{
        fontSize: 10, letterSpacing: 1, color, textTransform: "uppercase",
        fontWeight: 700, marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${THEME.border}`,
      }}>
        VESSEL · {ship.shipType.toUpperCase()}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: THEME.text, fontFamily: THEME.fontSans, letterSpacing: 0.3 }}>
        {ship.name}
      </div>
      <div style={{ lineHeight: 1.7 }}>
        <Row k="MMSI" v={String(ship.mmsi)} />
        <Row k="LAT/LON" v={`${ship.lat.toFixed(4)},${ship.lon.toFixed(4)}`} />
        <Row k="HDG" v={ship.heading !== null ? `${ship.heading}°` : "—"} />
        <Row k="RANGE" v={`${ship.distanceKm.toFixed(1)} km`} />
        {ship.stale && <div style={{ color: THEME.amber, marginTop: 4 }}>◈ STALE</div>}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: THEME.textMuted, width: 55, fontSize: 10, letterSpacing: 0.6 }}>{k}</span>
      <span style={{ color: THEME.text, flex: 1, fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
}

function TelemetryChip({ label, value, color = THEME.amber }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2,
      padding: "8px 10px",
      borderLeft: `2px solid ${color}`,
      background: THEME.surface,
      minWidth: 0,
    }}>
      <span style={{ fontSize: 9, color: THEME.textMuted, letterSpacing: 1.2, fontWeight: 600, textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontSize: 15, color: THEME.text, fontFamily: THEME.fontMono, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

function LiveTimer({ fetchedAt }: { fetchedAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ageSec = Math.max(0, Math.round((now - new Date(fetchedAt).getTime()) / 1000));
  return (
    <span style={{ color: THEME.textMuted, fontSize: 10, letterSpacing: 1 }}>
      T+{String(ageSec).padStart(3, "0")}S
    </span>
  );
}

export default function PortLiveMapInner() {
  const { props, isPending } = useWidget<PortLiveProps>();
  const [selectedMmsi, setSelectedMmsi] = useState<number | null>(null);

  if (isPending || !props?.port) {
    return (
      <div style={{
        height: 620, background: THEME.bg, color: THEME.amber,
        fontFamily: THEME.fontMono, fontSize: 11, letterSpacing: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {"// ACQUIRING AIS LINK …"}
      </div>
    );
  }

  const { port, radiusKm, fetchedAt, totalShipsGlobally, ships, typeCounts } = props;
  const portColor = COUNTRY_COLORS[port.iso3] ?? THEME.amber;
  const center: [number, number] = [port.lat, port.lon];

  const radiusMeters = radiusKm * 1000;

  const typeList = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{
      background: THEME.bg, color: THEME.text,
      fontFamily: THEME.fontSans,
      border: `1px solid ${THEME.border}`,
      overflow: "hidden",
    }}>
      <style>{`
        .tactical-ship { background: transparent !important; border: 0 !important; }
        .port-crosshair { background: transparent !important; border: 0 !important; pointer-events: none; }
        .leaflet-container { font-family: ${THEME.fontSans}; background: ${THEME.bg}; }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: transparent !important; box-shadow: none !important; border: 0 !important;
          padding: 0 !important;
        }
        .leaflet-popup-content { margin: 12px !important; width: auto !important; }
        .leaflet-control-zoom a {
          background: ${THEME.surface} !important; color: ${THEME.text} !important;
          border: 1px solid ${THEME.border} !important;
        }
        .leaflet-control-attribution {
          background: ${THEME.surface}dd !important; color: ${THEME.textMuted} !important;
          border: 1px solid ${THEME.border}; font-size: 9px !important; letter-spacing: 0.5px;
        }
        .leaflet-control-attribution a { color: ${THEME.textSecondary} !important; }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes scan-line {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* HEADER BAR */}
      <div style={{
        padding: "10px 14px",
        background: THEME.bgGrid,
        borderBottom: `1px solid ${THEME.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 8, height: 8, background: THEME.green,
            animation: "pulse-dot 1.5s ease-in-out infinite",
            boxShadow: `0 0 6px ${THEME.green}`,
          }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <div style={{ fontSize: 9, color: THEME.textMuted, letterSpacing: 2, fontWeight: 600 }}>
              HORMUZ-WATCH · PORT RECON
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: THEME.text, letterSpacing: 0.3 }}>
              {port.portName.toUpperCase()} <span style={{ color: THEME.textMuted, fontWeight: 400 }}>/ {port.country.toUpperCase()}</span>
            </div>
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          fontFamily: THEME.fontMono, fontSize: 10, color: THEME.textSecondary, letterSpacing: 1,
        }}>
          <span>{port.portId.toUpperCase()}</span>
          <span style={{ color: THEME.textDim }}>·</span>
          <span>{port.lat.toFixed(4)}°N {port.lon.toFixed(4)}°E</span>
          <span style={{ color: THEME.textDim }}>·</span>
          <LiveTimer fetchedAt={fetchedAt} />
        </div>
      </div>

      {/* TELEMETRY STRIP */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 1,
        background: THEME.border,
        borderBottom: `1px solid ${THEME.border}`,
      }}>
        <TelemetryChip label="VESSELS IN RADIUS" value={ships.length} color={THEME.amber} />
        <TelemetryChip label="SCAN RADIUS" value={`${radiusKm} KM`} color={THEME.cyan} />
        <TelemetryChip label="ANNUAL BASELINE" value={port.annualTotal.toLocaleString()} color={THEME.textSecondary} />
        <TelemetryChip label="GLOBAL AIS TRACKED" value={totalShipsGlobally.toLocaleString()} color={THEME.textSecondary} />
        <TelemetryChip label="FEED" value="VF/AIS" color={THEME.green} />
      </div>

      {/* MAIN: map + sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", height: 560 }}>
        {/* MAP */}
        <div style={{ position: "relative", background: THEME.bgGrid, borderRight: `1px solid ${THEME.border}` }}>
          <MapContainer
            center={center}
            zoom={11}
            style={{ width: "100%", height: "100%", background: THEME.bg }}
            scrollWheelZoom
          >
            <TileLayer url={DARK_TILE_URL} attribution={DARK_TILE_ATTR} />

            {/* Outer scan radius */}
            <Circle
              center={center}
              radius={radiusMeters}
              pathOptions={{
                color: portColor,
                weight: 1.5,
                fillOpacity: 0.04,
                fillColor: portColor,
                dashArray: "2 4",
              }}
            />
            {/* Inner 3km inset */}
            <Circle
              center={center}
              radius={Math.max(1000, radiusMeters * 0.33)}
              pathOptions={{
                color: portColor,
                weight: 1,
                fillOpacity: 0,
                dashArray: "1 3",
                opacity: 0.5,
              }}
            />

            <Marker position={center} icon={crosshairIcon(portColor)} interactive={false} />

            {ships.map((ship) => (
              <Marker
                key={ship.mmsi}
                position={[ship.lat, ship.lon]}
                icon={shipIcon(ship)}
                eventHandlers={{ click: () => setSelectedMmsi(ship.mmsi) }}
              >
                <Tooltip direction="top" offset={[0, -6]}>
                  <span style={{ fontFamily: THEME.fontMono, fontSize: 10 }}>
                    <strong>{ship.name}</strong> · {ship.shipType} · {ship.distanceKm.toFixed(1)}km
                  </span>
                </Tooltip>
                <Popup>
                  <ShipPopup ship={ship} />
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Classification bar */}
          <div style={{
            position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
            zIndex: 1000,
            background: `${THEME.surface}dd`,
            border: `1px solid ${THEME.border}`,
            padding: "4px 10px",
            fontFamily: THEME.fontMono, fontSize: 9, letterSpacing: 2, color: THEME.textSecondary,
          }}>
            UNCLASS // OPEN-SOURCE // AIS-DERIVED
          </div>
        </div>

        {/* SIDEBAR */}
        <div style={{ display: "flex", flexDirection: "column", background: THEME.bg, overflow: "hidden" }}>
          {/* Composition block */}
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 9, color: THEME.textMuted, letterSpacing: 1.5, fontWeight: 700, marginBottom: 8 }}>
              VESSEL CLASSIFICATION
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {typeList.map(([type, count]) => {
                const color = SHIP_TYPE_COLORS[type] ?? THEME.textMuted;
                const pct = ships.length > 0 ? (count / ships.length) * 100 : 0;
                return (
                  <div key={type} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                    <div style={{ width: 8, height: 8, background: color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: THEME.text, fontFamily: THEME.fontSans }}>{type}</span>
                    <span style={{ color: THEME.textSecondary, fontFamily: THEME.fontMono, fontVariantNumeric: "tabular-nums", fontSize: 10, width: 34, textAlign: "right" }}>
                      {pct.toFixed(0)}%
                    </span>
                    <span style={{ color: THEME.text, fontFamily: THEME.fontMono, fontWeight: 700, fontVariantNumeric: "tabular-nums", width: 24, textAlign: "right" }}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ship list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{
              padding: "8px 12px",
              fontSize: 9, color: THEME.textMuted, letterSpacing: 1.5, fontWeight: 700,
              borderBottom: `1px solid ${THEME.border}`,
              background: THEME.bgGrid,
              display: "flex", justifyContent: "space-between",
            }}>
              <span>VESSEL LEDGER · SORTED BY RANGE</span>
              <span style={{ color: THEME.amber }}>{ships.length}</span>
            </div>
            {ships.length === 0 ? (
              <div style={{ padding: "20px 12px", color: THEME.textMuted, fontFamily: THEME.fontMono, fontSize: 11 }}>
                {"// NO VESSELS IN RADIUS"}
              </div>
            ) : ships.slice(0, 80).map((ship) => {
              const color = SHIP_TYPE_COLORS[ship.shipType] ?? THEME.textMuted;
              const selected = selectedMmsi === ship.mmsi;
              return (
                <button
                  key={ship.mmsi}
                  onClick={() => setSelectedMmsi(ship.mmsi)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "12px 1fr 52px",
                    gap: 8,
                    padding: "6px 12px",
                    width: "100%",
                    background: selected ? THEME.surfaceElevated : "transparent",
                    border: 0,
                    borderLeft: `2px solid ${selected ? color : "transparent"}`,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: THEME.fontMono,
                    fontSize: 10,
                    color: THEME.text,
                    borderBottom: `1px solid ${THEME.border}`,
                  }}
                >
                  <div style={{
                    width: 8, height: 8, background: color,
                    marginTop: 4,
                    opacity: ship.stale ? 0.35 : 1,
                  }} />
                  <div style={{ overflow: "hidden" }}>
                    <div style={{
                      fontFamily: THEME.fontSans, fontSize: 11, color: THEME.text,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {ship.name}
                    </div>
                    <div style={{ color: THEME.textMuted, fontSize: 9, letterSpacing: 0.6 }}>
                      {ship.shipType.toUpperCase()} · MMSI {ship.mmsi}
                    </div>
                  </div>
                  <div style={{
                    textAlign: "right", color: THEME.text, fontVariantNumeric: "tabular-nums",
                    fontSize: 10, display: "flex", flexDirection: "column", alignItems: "flex-end",
                  }}>
                    <span style={{ color: THEME.amber, fontWeight: 700 }}>{ship.distanceKm.toFixed(1)}km</span>
                    {ship.heading !== null && (
                      <span style={{ color: THEME.textMuted, fontSize: 9 }}>{ship.heading}°</span>
                    )}
                  </div>
                </button>
              );
            })}
            {ships.length > 80 && (
              <div style={{ padding: "8px 12px", color: THEME.textMuted, fontFamily: THEME.fontMono, fontSize: 10 }}>
                {"// +" + (ships.length - 80) + " more …"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{
        padding: "6px 14px",
        background: THEME.bgGrid,
        borderTop: `1px solid ${THEME.border}`,
        fontSize: 9, color: THEME.textMuted, letterSpacing: 1,
        display: "flex", justifyContent: "space-between", fontFamily: THEME.fontMono,
      }}>
        <span>SRC · VESSELFINDER AIS / OSM DARK TILES</span>
        <span>TOP INDUSTRY · {port.industry?.toUpperCase() || "UNKNOWN"}</span>
      </div>
    </div>
  );
}
