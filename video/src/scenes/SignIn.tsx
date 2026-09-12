import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

// The escalation as the README states it, quietest first.
const ladder = [
  { when: "8 tries in 10 minutes", then: "a flat refusal" },
  {
    when: "Past 3 in an hour",
    then: "each guess waits longer, up to 2 seconds",
  },
  { when: "5 in a day", then: "a note on the dashboard" },
  { when: "20 in an hour", then: "one email" },
];

export const SignIn: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Sign in"
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
          fontSize: 108,
          fontWeight: 700,
          color: "#4A2A1A",
          lineHeight: 1.1,
          marginBottom: 52,
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
        It never locks you out.
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {ladder.map((step, i) => (
          <div
            key={step.when}
            style={{
              width: 1620,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "row",
              alignItems: "baseline",
              padding: "20px 36px",
              borderRadius: 12,
              backgroundColor: "#FBF8F6",
              borderLeft: "10px solid #BE8146",
              opacity: interpolate(frame, [26 + i * 14, 48 + i * 14], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: interpolate(
                frame,
                [26 + i * 14, 54 + i * 14],
                ["-30px 0px", "0px 0px"],
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
                width: 600,
                flexShrink: 0,
                fontFamily: "Fraunces",
                fontSize: 48,
                fontWeight: 700,
                color: "#2C1E18",
              }}
            >
              {step.when}
            </div>
            <div
              style={{
                fontFamily: "Inter",
                fontSize: 44,
                color: "#6B4630",
              }}
            >
              → {step.then}
            </div>
          </div>
        ))}
      </div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 48,
          color: "#4A2A1A",
          marginTop: 44,
          maxWidth: 1620,
          lineHeight: 1.36,
          opacity: interpolate(frame, [104, 130], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        A lockout would let anyone keep you out on a Friday.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
