import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import qr from "../data/qr.json";

// A real, scannable code for the live site, encoded by the app's own
// scripts/qr.js (see src/data/qr.json). Drawn with the quiet zone QR readers
// need: four modules of light on every side.
const MODULE = 8;
const QUIET = 4;
const QR_PX = (qr.size + QUIET * 2) * MODULE;

export const CardStickerQr: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Card sticker and QR"
      style={{
        backgroundColor: "#F4EFEB",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: 150,
      }}
    >
      <Interactive.Div
        name="Headline"
        style={{
          fontFamily: "Fraunces",
          fontSize: 116,
          fontWeight: 700,
          color: "#4A2A1A",
          lineHeight: 1.1,
          marginBottom: 56,
          opacity: interpolate(frame, [0, 22], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0, 26], ["0px 30px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Card, sticker and QR.
      </Interactive.Div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 70,
        }}
      >
        <Interactive.Div
          name="Business card"
          style={{
            width: 520,
            height: 300,
            borderRadius: 14,
            backgroundColor: "#4A2A1A",
            boxSizing: "border-box",
            padding: 40,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            opacity: interpolate(frame, [26, 48], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            rotate: interpolate(frame, [26, 60], ["-6deg", "-2deg"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.spring({ damping: 200 }),
            }),
          }}
        >
          <div
            style={{
              fontFamily: "Fraunces",
              fontSize: 46,
              fontWeight: 700,
              color: "#F4EFEB",
            }}
          >
            Dinner By Derek
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 22,
              letterSpacing: 4,
              color: "#EBC08C",
            }}
          >
            SUPPER CLUB · KITCHENER-WATERLOO
          </div>
        </Interactive.Div>

        <Interactive.Div
          name="Sticker"
          style={{
            width: 280,
            height: 280,
            borderRadius: 140,
            backgroundColor: "#5A6643",
            border: "10px solid #EBC08C",
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontFamily: "Fraunces",
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1.05,
            color: "#F4EFEB",
            opacity: interpolate(frame, [40, 62], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            scale: interpolate(frame, [40, 66], [0.8, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.spring({ damping: 14 }),
              output: "perceptual-scale",
            }),
          }}
        >
          Dinner
          <br />
          By Derek
        </Interactive.Div>

        <Interactive.Div
          name="QR code"
          style={{
            width: QR_PX,
            height: QR_PX,
            backgroundColor: "#FFFFFF",
            borderRadius: 10,
            opacity: interpolate(frame, [54, 76], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <svg
            width={QR_PX}
            height={QR_PX}
            viewBox={`0 0 ${qr.size + QUIET * 2} ${qr.size + QUIET * 2}`}
            shapeRendering="crispEdges"
          >
            {qr.rows.map((row, y) =>
              row
                .split("")
                .map((c, x) =>
                  c === "1" ? (
                    <rect
                      key={`${x}-${y}`}
                      x={x + QUIET}
                      y={y + QUIET}
                      width={1}
                      height={1}
                      fill="#2C1E18"
                    />
                  ) : null,
                ),
            )}
          </svg>
        </Interactive.Div>
      </div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 46,
          color: "#4A2A1A",
          marginTop: 50,
          maxWidth: 1620,
          lineHeight: 1.36,
          opacity: interpolate(frame, [96, 122], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Card at 300 DPI with bleed. Sticker drawn at the roll&apos;s own size.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
