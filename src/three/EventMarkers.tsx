import { Html } from "@react-three/drei";
import { parcelById } from "../engine/city";
import type { LogKind } from "../engine/types";
import { useUiStore } from "../store/uiStore";

const EMOJI: Record<LogKind, string> = {
  info: "📄",
  warn: "❗",
  buy: "🔑",
  sell: "💰",
  upg: "🔨",
  income: "✅",
  expense: "⚠️",
  event: "🏷️",
};

/** Tillfälliga, klickbara händelsemarkörer ovanför tomtrutor. */
export function EventMarkers() {
  const markers = useUiStore((s) => s.markers);
  const select = useUiStore((s) => s.select);
  const requestFocus = useUiStore((s) => s.requestFocus);

  return (
    <>
      {markers.map((m) => {
        const pc = parcelById(m.parcelId);
        if (!pc) return null;
        return (
          <Html key={m.id} position={[pc.x, 26, pc.z]} center zIndexRange={[30, 0]}>
            <div
              className="map-marker"
              title="Visa på kartan"
              onClick={() => {
                select(m.parcelId);
                requestFocus(m.parcelId);
              }}
            >
              {EMOJI[m.kind]}
            </div>
          </Html>
        );
      })}
    </>
  );
}
