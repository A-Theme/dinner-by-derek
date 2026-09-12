import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const Proofreader: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Proofreader"
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
        A proofreader that only suggests.
      </Interactive.Div>

      <Interactive.Div
        name="Text box"
        style={{
          width: 1620,
          boxSizing: "border-box",
          padding: "30px 40px",
          borderRadius: 12,
          backgroundColor: "#FBF8F6",
          border: "3px solid #6B4630",
          fontFamily: "Inter",
          fontSize: 54,
          color: "#2C1E18",
          opacity: interpolate(frame, [26, 48], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Slow-braised beef in{" "}
        <span
          style={{
            textDecoration: "underline",
            textDecorationColor: "#BE8146",
            textDecorationThickness: 6,
            textUnderlineOffset: 10,
          }}
        >
          it&apos;s
        </span>{" "}
        own jus, with buttered mash
      </Interactive.Div>

      <Interactive.Div
        name="Suggestion chip"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 26,
          marginTop: 26,
          padding: "16px 30px",
          borderRadius: 999,
          backgroundColor: "#EAE2DB",
          opacity: interpolate(frame, [56, 76], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [56, 80], ["0px -16px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div style={{ fontFamily: "Inter", fontSize: 46, color: "#2C1E18" }}>
          it&apos;s → its
        </div>
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 42,
            fontWeight: 600,
            color: "#F4EFEB",
            backgroundColor: "#5A6643",
            width: 64,
            height: 64,
            borderRadius: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✓
        </div>
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 42,
            fontWeight: 600,
            color: "#4A2A1A",
            border: "3px solid #4A2A1A",
            boxSizing: "border-box",
            width: 64,
            height: 64,
            borderRadius: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 50,
          color: "#4A2A1A",
          marginTop: 50,
          opacity: interpolate(frame, [96, 122], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Nothing moves until you tap. It saves exactly what you typed.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
