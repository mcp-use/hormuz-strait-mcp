import React, { lazy, Suspense, useEffect, useState } from "react";
import { McpUseProvider, type WidgetMetadata } from "mcp-use/react";
import "../styles.css";
import { propsSchema } from "./types";
import { THEME } from "../shared/theme";

export const widgetMetadata: WidgetMetadata = {
  description:
    "Tactical live-AIS map zoomed on a Gulf port with radius scan and vessel ledger.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    prefersBorder: false,
    invoking: "Scanning AIS feed around port...",
    invoked: "Port feed online",
    csp: {
      resourceDomains: ["https://*.basemaps.cartocdn.com"],
    },
  },
};

const MapInner = lazy(() => import("./map-inner"));

function Fallback() {
  return (
    <div style={{
      height: 620,
      background: THEME.bg,
      color: THEME.amber,
      fontFamily: THEME.fontMono,
      fontSize: 11,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      letterSpacing: 1,
    }}>
      <div>{"// ESTABLISHING LINK …"}</div>
    </div>
  );
}

export default function PortLiveMapWidget() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <McpUseProvider>
      {ready ? (
        <Suspense fallback={<Fallback />}>
          <MapInner />
        </Suspense>
      ) : (
        <Fallback />
      )}
    </McpUseProvider>
  );
}
