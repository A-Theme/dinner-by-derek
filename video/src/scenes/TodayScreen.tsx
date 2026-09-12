import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

const tiles = [
  { n: "7", label: "Orders today" },
  { n: "12", label: "Orders tomorrow" },
  { n: "2", label: "Late requests" },
];

export const TodayScreen: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Today screen"
      style={{
        backgroundColor: "#5A6643",
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
          color: "#F4EFEB",
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
        Start here every day.
      </Interactive.Div>

      <Interactive.Div
        name="Next thing button"
        style={{
          fontFamily: "Inter",
          fontSize: 50,
          fontWeight: 600,
          color: "#2C1E18",
          backgroundColor: "#BE8146",
          padding: "24px 48px",
          borderRadius: 14,
          marginBottom: 40,
          opacity: interpolate(frame, [24, 44], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [24, 50], [0.94, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
        }}
      >
        Finish next week&apos;s draft →
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "row", gap: 48 }}>
        {tiles.map((t, i) => (
          <div
            key={t.label}
            style={{
              width: 508,
              boxSizing: "border-box",
              padding: "28px 40px",
              borderRadius: 16,
              backgroundColor: "#F4EFEB",
              opacity: interpolate(frame, [46 + i * 12, 68 + i * 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: interpolate(
                frame,
                [46 + i * 12, 74 + i * 12],
                ["0px 34px", "0px 0px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                },
              ),
            }}
          >
            <div
              style={{
                fontFamily: "Fraunces",
                fontSize: 96,
                fontWeight: 700,
                color: "#4A2A1A",
                lineHeight: 1.05,
              }}
            >
              {t.n}
            </div>
            <div
              style={{
                fontFamily: "Inter",
                fontSize: 42,
                color: "#6B4630",
                marginTop: 6,
              }}
            >
              {t.label}
            </div>
          </div>
        ))}
      </div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 48,
          color: "#EBC08C",
          marginTop: 44,
          maxWidth: 1620,
          lineHeight: 1.36,
          opacity: interpolate(frame, [100, 126], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Each number opens the list behind it. Underneath: what the kitchen has
        to cook, totalled and split by size.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
