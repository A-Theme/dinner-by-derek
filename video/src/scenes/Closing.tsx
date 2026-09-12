import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const Closing: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Closing"
      style={{
        backgroundColor: "#5A6643",
        justifyContent: "center",
        alignItems: "center",
        padding: 150,
      }}
    >
      <Interactive.Div
        name="Wordmark"
        style={{
          fontFamily: "Fraunces",
          fontSize: 156,
          fontWeight: 700,
          color: "#F4EFEB",
          lineHeight: 1.05,
          opacity: interpolate(frame, [0, 26], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [0, 34], [0.9, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
        }}
      >
        Dinner By Derek
      </Interactive.Div>

      <Interactive.Div
        name="Rule"
        style={{
          height: 8,
          backgroundColor: "#EBC08C",
          borderRadius: 4,
          marginTop: 48,
          marginBottom: 48,
          width: interpolate(frame, [28, 62], [0, 520], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />

      <Interactive.Div
        name="Three absences"
        style={{
          fontFamily: "Inter",
          fontSize: 62,
          color: "#F4EFEB",
          textAlign: "center",
          opacity: interpolate(frame, [52, 78], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        No app store. No accounts. No online payment.
      </Interactive.Div>

      <Interactive.Div
        name="Address"
        style={{
          fontFamily: "Fraunces",
          fontSize: 92,
          fontWeight: 700,
          color: "#EBC08C",
          marginTop: 56,
          opacity: interpolate(frame, [86, 112], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [86, 116], ["0px 26px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        dinnerbyderek.ca
      </Interactive.Div>
    </AbsoluteFill>
  );
};
