import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const AllergenGate: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Allergen gate"
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
          maxWidth: 1400,
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
        It suggests allergens.
        <br />
        You decide them.
      </Interactive.Div>

      <Interactive.Div
        name="Dish card"
        style={{
          width: 1620,
          padding: 44,
          borderRadius: 16,
          backgroundColor: "#EAE2DB",
          border: "3px solid rgba(190, 129, 70, 0.4)",
          opacity: interpolate(frame, [30, 54], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [30, 58], ["0px 34px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            fontFamily: "Fraunces",
            fontSize: 54,
            fontWeight: 600,
            color: "#2C1E18",
            marginBottom: 26,
          }}
        >
          Braised beef with buttered mash
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 38,
              color: "#6B4630",
              marginRight: 12,
            }}
          >
            Suggested
          </div>
          <Interactive.Div
            name="Chip milk"
            style={{
              fontFamily: "Inter",
              fontSize: 40,
              fontWeight: 600,
              color: "#2C1E18",
              backgroundColor: "#BE8146",
              padding: "14px 34px",
              borderRadius: 999,
              opacity: interpolate(frame, [60, 78], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              scale: interpolate(frame, [60, 80], [0.7, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.spring({ damping: 200 }),
                output: "perceptual-scale",
              }),
            }}
          >
            milk
          </Interactive.Div>
          <Interactive.Div
            name="Chip wheat"
            style={{
              fontFamily: "Inter",
              fontSize: 40,
              fontWeight: 600,
              color: "#2C1E18",
              backgroundColor: "#BE8146",
              padding: "14px 34px",
              borderRadius: 999,
              opacity: interpolate(frame, [72, 90], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              scale: interpolate(frame, [72, 92], [0.7, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.spring({ damping: 200 }),
                output: "perceptual-scale",
              }),
            }}
          >
            wheat
          </Interactive.Div>
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Review acknowledgement"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 32,
          marginTop: 46,
          opacity: interpolate(frame, [100, 124], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            position: "relative",
            width: 72,
            height: 72,
            borderRadius: 10,
            border: "5px solid #4A2A1A",
            boxSizing: "border-box",
          }}
        >
          <Interactive.Div
            name="Tick fill"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 62,
              height: 62,
              borderRadius: 6,
              backgroundColor: "#5A6643",
              opacity: interpolate(frame, [128, 146], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          />
          <svg
            width="72"
            height="72"
            viewBox="0 0 72 72"
            style={{ position: "absolute", top: -5, left: -5 }}
          >
            <path
              d="M18 37 L31 50 L55 24"
              fill="none"
              stroke="#F4EFEB"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="64"
              strokeDashoffset={interpolate(frame, [138, 158], [64, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              })}
            />
          </svg>
        </div>
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 56,
            color: "#4A2A1A",
          }}
        >
          I have reviewed the allergen information for this dish.
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Consequence"
        style={{
          fontFamily: "Inter",
          fontSize: 44,
          color: "#8A5A2B",
          marginTop: 28,
          opacity: interpolate(frame, [162, 186], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Until then the dish is absent from the menu — not greyed out.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
