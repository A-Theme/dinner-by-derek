import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

// The seeded Bechamel at x2.5. Pinch and to-taste are in the app's
// NON_SCALING set, so they come back exactly as written.
const lines = [
  { item: "Whole milk", from: "1 L", to: "2.5 L", scales: true },
  { item: "White roux", from: "120 g", to: "300 g", scales: true },
  { item: "Nutmeg", from: "1 pinch", to: "1 pinch", scales: false },
  { item: "Salt", from: "to taste", to: "to taste", scales: false },
];

export const ScalingARecipe: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Scaling a recipe"
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
          marginBottom: 50,
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
        Scale to the batch.
      </Interactive.Div>

      <Interactive.Div
        name="Recipe card"
        style={{
          width: 1620,
          boxSizing: "border-box",
          padding: "34px 44px",
          borderRadius: 16,
          backgroundColor: "#FBF8F6",
          border: "3px solid rgba(190, 129, 70, 0.45)",
          opacity: interpolate(frame, [24, 46], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontFamily: "Fraunces",
              fontSize: 58,
              fontWeight: 700,
              color: "#2C1E18",
            }}
          >
            Bechamel
          </div>
          <Interactive.Div
            name="Factor"
            style={{
              fontFamily: "Fraunces",
              fontSize: 54,
              fontWeight: 700,
              color: "#2C1E18",
              backgroundColor: "#BE8146",
              padding: "4px 28px",
              borderRadius: 999,
              opacity: interpolate(frame, [44, 60], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            × 2.5
          </Interactive.Div>
        </div>
        {lines.map((l, i) => (
          <div
            key={l.item}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "baseline",
              padding: "9px 0",
              borderTop: "2px solid rgba(190, 129, 70, 0.25)",
              fontFamily: "Inter",
              fontSize: 42,
            }}
          >
            <div style={{ width: 560, color: "#2C1E18" }}>{l.item}</div>
            <div style={{ width: 320, color: "#6B4630" }}>{l.from}</div>
            <div
              style={{
                width: 360,
                fontWeight: 600,
                color: l.scales ? "#414A2F" : "#6B4630",
                opacity: interpolate(
                  frame,
                  [60 + i * 10, 78 + i * 10],
                  [0, 1],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  },
                ),
              }}
            >
              → {l.to}
            </div>
            <div
              style={{
                fontSize: 34,
                color: "#8A5A2B",
                opacity: interpolate(
                  frame,
                  [72 + i * 10, 90 + i * 10],
                  [0, 1],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  },
                ),
              }}
            >
              {l.scales ? "" : "as written"}
            </div>
          </div>
        ))}
      </Interactive.Div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 46,
          color: "#4A2A1A",
          marginTop: 40,
          maxWidth: 1620,
          lineHeight: 1.36,
          opacity: interpolate(frame, [112, 138], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        The original never changes, and it flags what won&apos;t scale straight.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
