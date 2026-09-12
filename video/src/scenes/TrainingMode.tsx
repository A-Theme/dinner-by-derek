import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

const facts = [
  { title: "Every screen", body: "The real dashboard, on invented data." },
  {
    title: "Nothing real",
    body: "It can't touch the database, send email or post to the Page.",
  },
  {
    title: "An Outbox",
    body: "Emails and posts land here instead of going out.",
  },
];

export const TrainingMode: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Training mode"
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
        Practise on a copy.
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "row", gap: 48 }}>
        {facts.map((f, i) => (
          <div
            key={f.title}
            style={{
              width: 508,
              minHeight: 270,
              boxSizing: "border-box",
              padding: 44,
              borderRadius: 16,
              backgroundColor: "#FBF8F6",
              border: "3px solid #BE8146",
              opacity: interpolate(frame, [26 + i * 14, 48 + i * 14], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: interpolate(
                frame,
                [26 + i * 14, 54 + i * 14],
                ["0px 44px", "0px 0px"],
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
                fontSize: 58,
                fontWeight: 700,
                color: "#2C1E18",
                marginBottom: 16,
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
          fontSize: 44,
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
        One dish is left unreviewed on purpose — the first publish is refused.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
