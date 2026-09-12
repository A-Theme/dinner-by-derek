import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

const rules = [
  "25 a day by default — both sizes count together.",
  "Under five, customers see how many are left.",
  "A late request never eats into it.",
];

export const HowManyToCook: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="How many to cook"
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
        How many you&apos;ll cook.
      </Interactive.Div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
          width: 1620,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 44,
            fontWeight: 600,
            color: "#4A2A1A",
          }}
        >
          Wednesday —{" "}
          {Math.round(
            interpolate(frame, [30, 90], [0, 21], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.33, 1, 0.68, 1),
            }),
          )}{" "}
          of 25
        </div>
        <Interactive.Div
          name="Only left badge"
          style={{
            fontFamily: "Inter",
            fontSize: 40,
            fontWeight: 600,
            color: "#F4EFEB",
            backgroundColor: "#8A5A2B",
            padding: "8px 26px",
            borderRadius: 999,
            opacity: interpolate(frame, [86, 100], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          Only 4 left
        </Interactive.Div>
      </div>
      <div
        style={{
          width: 1620,
          height: 40,
          borderRadius: 20,
          backgroundColor: "#EAE2DB",
          overflow: "hidden",
        }}
      >
        <Interactive.Div
          name="Meter fill"
          style={{
            height: 40,
            borderRadius: 20,
            backgroundColor: "#5A6643",
            width: interpolate(frame, [30, 90], [0, 1361], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.33, 1, 0.68, 1),
            }),
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          marginTop: 56,
        }}
      >
        {rules.map((r, i) => (
          <div
            key={r}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 28,
              opacity: interpolate(
                frame,
                [100 + i * 14, 122 + i * 14],
                [0, 1],
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
                width: 36,
                height: 8,
                borderRadius: 4,
                backgroundColor: "#BE8146",
              }}
            />
            <div
              style={{
                fontFamily: "Inter",
                fontSize: 54,
                color: "#4A2A1A",
              }}
            >
              {r}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
