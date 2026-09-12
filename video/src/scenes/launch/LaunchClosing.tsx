import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

/**
 * The address, held for three and a half seconds.
 *
 * Longer than it looks like it needs, and deliberately: this is the only frame
 * that asks the viewer to do something, and a web address read off a phone
 * needs to survive being watched twice. Nothing moves under it for that reason.
 */
export const LaunchClosing: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Launch closing"
      style={{
        backgroundColor: "#5A6643",
        justifyContent: "center",
        alignItems: "center",
        padding: 90,
        textAlign: "center",
      }}
    >
      <Interactive.Div
        name="Address"
        style={{
          fontFamily: "Fraunces",
          /* Sized so the address clears 900px of usable width in Fraunces 700,
             which is wider than a fallback serif suggests. This is the one
             frame that has to be read and copied down, so it never wraps. */
          fontSize: 88,
          fontWeight: 700,
          color: "#F4EFEB",
          lineHeight: 1.05,
          opacity: interpolate(frame, [0, 24], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [0, 34], [0.92, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
            output: "perceptual-scale",
          }),
        }}
      >
        dinnerbyderek.ca
      </Interactive.Div>

      <Interactive.Div
        name="Rule"
        style={{
          height: 6,
          backgroundColor: "#EBC08C",
          borderRadius: 3,
          marginTop: 48,
          marginBottom: 48,
          width: interpolate(frame, [18, 46], [0, 340], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />

      <Interactive.Div
        name="Line"
        style={{
          fontFamily: "Inter",
          fontSize: 40,
          color: "#F4EFEB",
          lineHeight: 1.4,
          maxWidth: 860,
          opacity: interpolate(frame, [28, 54], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        This week’s menu is on there now.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
