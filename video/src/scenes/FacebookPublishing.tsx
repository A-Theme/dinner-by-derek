import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const FacebookPublishing: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Facebook publishing"
      style={{
        backgroundColor: "#2C1E18",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: 150,
      }}
    >
      <Interactive.Div
        name="Ready tag"
        style={{
          fontFamily: "Inter",
          fontSize: 34,
          fontWeight: 600,
          letterSpacing: 4,
          color: "#EBC08C",
          border: "3px solid #BE8146",
          padding: "8px 26px",
          borderRadius: 999,
          marginBottom: 26,
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        READY TO SWITCH ON — ONCE THE PAGE IS CONNECTED
      </Interactive.Div>

      <Interactive.Div
        name="Headline"
        style={{
          fontFamily: "Fraunces",
          fontSize: 108,
          fontWeight: 700,
          color: "#F4EFEB",
          lineHeight: 1.1,
          marginBottom: 48,
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
        Post the week in one tap.
      </Interactive.Div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 60,
        }}
      >
        <Interactive.Div
          name="Post preview"
          style={{
            width: 1000,
            boxSizing: "border-box",
            padding: "32px 40px",
            borderRadius: 16,
            backgroundColor: "#F4EFEB",
            opacity: interpolate(frame, [28, 50], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [28, 56], ["0px 34px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 38,
              fontWeight: 600,
              color: "#2C1E18",
              marginBottom: 14,
            }}
          >
            Dinner By Derek
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 38,
              color: "#4A2A1A",
              lineHeight: 1.45,
            }}
          >
            This week, Sunday to Wednesday — roast pork loin, shepherd&apos;s
            pie, butter chicken and braised beef. Order by 10 the night before.
          </div>
        </Interactive.Div>

        <Interactive.Div
          name="Post button"
          style={{
            fontFamily: "Inter",
            fontSize: 48,
            fontWeight: 600,
            color: "#2C1E18",
            backgroundColor: "#BE8146",
            padding: "26px 44px",
            borderRadius: 14,
            opacity: interpolate(frame, [52, 72], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            scale: interpolate(frame, [52, 78], [0.9, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.spring({ damping: 200 }),
              output: "perceptual-scale",
            }),
          }}
        >
          Post to Page
        </Interactive.Div>
      </div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 48,
          color: "#EBC08C",
          marginTop: 46,
          maxWidth: 1620,
          lineHeight: 1.36,
          opacity: interpolate(frame, [96, 122], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        No app can post to a Facebook Group since 2024 — for those, Copy post
        text does it in one tap instead.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
