import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

const facts = [
  { title: "Its own price", body: "Not set by the other mains." },
  { title: "Its own ceiling", body: "25 of each — not 25 between them." },
  { title: "Skip a week", body: "Leave the name blank." },
];

export const MeatlessMonday: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Meatless Monday"
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
          maxWidth: 1400,
          marginBottom: 60,
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
        Meatless Monday is a second main.
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "row", gap: 48 }}>
        {facts.map((f, i) => (
          <div
            key={f.title}
            style={{
              width: 508,
              minHeight: 200,
              padding: 40,
              boxSizing: "border-box",
              borderRadius: 16,
              backgroundColor: "#F4EFEB",
              opacity: interpolate(frame, [28 + i * 14, 50 + i * 14], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: interpolate(
                frame,
                [28 + i * 14, 56 + i * 14],
                ["0px 40px", "0px 0px"],
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
                fontSize: 56,
                fontWeight: 700,
                color: "#2C1E18",
                marginBottom: 14,
              }}
            >
              {f.title}
            </div>
            <div
              style={{
                fontFamily: "Inter",
                fontSize: 40,
                color: "#6B4630",
                lineHeight: 1.35,
              }}
            >
              {f.body}
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
          marginTop: 52,
          maxWidth: 1620,
          lineHeight: 1.36,
          opacity: interpolate(frame, [98, 124], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Picked from your saved mains — the same aloo gobi is one entry, whatever
        heading it ran under.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
