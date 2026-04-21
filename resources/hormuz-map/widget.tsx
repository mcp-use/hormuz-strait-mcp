import React, { lazy, Suspense, useEffect, useState } from "react";
import { McpUseProvider, type WidgetMetadata } from "mcp-use/react";
import "../styles.css";
import { propsSchema } from "./types";
import { THEME } from "../shared/theme";

export const widgetMetadata: WidgetMetadata = {
  description:
    "Tactical Hormuz situation map: IMF disruption polygon, Gulf ports, live AIS vessels, transit trend.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    prefersBorder: false,
    invoking: "Acquiring Hormuz tactical feed...",
    invoked: "Hormuz feed online",
    csp: {
      resourceDomains: ["https://*.basemaps.cartocdn.com"],
    },
  },
};

const MapInner = lazy(() => import("./map-inner"));

function Fallback() {
  return (
    <div style={{
      height: 760, background: THEME.bg, color: THEME.amber,
      fontFamily: THEME.fontMono, fontSize: 11, letterSpacing: 1,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {"// ESTABLISHING LINK …"}
    </div>
  );
}

export default function HormuzMapWidget() {
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
