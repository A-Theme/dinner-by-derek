import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const PickupWindow: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Pickup window"
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
        No time slots to book.
      </Interactive.Div>

      <Interactive.Div
        name="Window label"
        style={{
          fontFamily: "Inter",
          fontSize: 38,
          fontWeight: 600,
          letterSpacing: 6,
          color: "#8A5A2B",
          opacity: interpolate(frame, [24, 44], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        PICKUP WINDOW
      </Interactive.Div>
      <Interactive.Div
        name="Window"
        style={{
          fontFamily: "Fraunces",
          fontSize: 156,
          fontWeight: 700,
          color: "#5A6643",
          lineHeight: 1.1,
          opacity: interpolate(frame, [30, 54], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [30, 60], [0.92, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
        }}
      >
        4:00 – 7:00 PM
      </Interactive.Div>

      <Interactive.Div
        name="Anytime"
        style={{
          fontFamily: "Inter",
          fontSize: 60,
          color: "#4A2A1A",
          marginTop: 36,
          opacity: interpolate(frame, [70, 94], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Come any time in it. One day can have its own.
      </Interactive.Div>

      <Interactive.Div
        name="Frozen onto the order"
        style={{
          fontFamily: "Inter",
          fontSize: 46,
          color: "#8A5A2B",
          marginTop: 30,
          maxWidth: 1620,
          lineHeight: 1.35,
          opacity: interpolate(frame, [108, 132], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Each order keeps the window and address it was placed with — rename a
        location later and no old order changes.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
