import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const Opening: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Opening"
      style={{
        backgroundColor: "#2C1E18",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: 150,
      }}
    >
      <Interactive.Div
        name="Eyebrow"
        style={{
          fontFamily: "Inter",
          fontSize: 46,
          fontWeight: 600,
          letterSpacing: 12,
          color: "#BE8146",
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0, 18], ["0px 24px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        KITCHENER &amp; WATERLOO
      </Interactive.Div>

      <Interactive.Div
        name="Wordmark"
        style={{
          fontFamily: "Fraunces",
          fontSize: 172,
          fontWeight: 700,
          color: "#F4EFEB",
          lineHeight: 1.05,
          marginTop: 28,
          opacity: interpolate(frame, [10, 34], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [10, 40], ["0px 40px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Dinner By Derek
      </Interactive.Div>

      <Interactive.Div
        name="Rule"
        style={{
          height: 8,
          backgroundColor: "#BE8146",
          borderRadius: 4,
          marginTop: 44,
          marginBottom: 44,
          width: interpolate(frame, [34, 68], [0, 620], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />

      <Interactive.Div
        name="Promise"
        style={{
          fontFamily: "Inter",
          fontSize: 76,
          fontWeight: 400,
          color: "#EBC08C",
          lineHeight: 1.3,
          maxWidth: 1620,
          opacity: interpolate(frame, [56, 82], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [56, 86], ["0px 30px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        An installable web app
        <br />
        for taking supper-club orders.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
