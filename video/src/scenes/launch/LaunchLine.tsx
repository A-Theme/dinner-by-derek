import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

/**
 * One statement, for the customer-facing cut.
 *
 * The tour and the brief are both 1920×1080 and both made for whoever runs the
 * app. This is the other audience: somebody scrolling a feed on a phone who has
 * never heard of any of it. So it is portrait, it is centred, and it holds each
 * statement long enough to be read by a person who is not paying attention.
 *
 * Type sizes are literal rather than derived from useVideoConfig, which looks
 * like an oversight and is not. Launch and LaunchStory are both 1080 wide and
 * differ only in height, so nothing here needs to scale — and a literal keeps
 * the property editable on the Studio canvas, which a computed value greys out.
 *
 * Every pairing used by the three launch scenes is one CONTRAST.md measured.
 * Parchment on olive is 5.38:1. Tan-lift on olive is 3.64:1, which clears the
 * 3:1 bar for large text only — so it is used for the kicker at 34px, for the
 * rule, and never for a body line.
 */
export const LaunchLine: React.FC<{
  kicker: string;
  title: string;
  line: string;
  background: string;
  ink: string;
  accent: string;
}> = ({ kicker, title, line, background, ink, accent }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Launch line"
      style={{
        backgroundColor: background,
        justifyContent: "center",
        alignItems: "center",
        padding: 90,
        textAlign: "center",
      }}
    >
      <Interactive.Div
        name="Kicker"
        style={{
          fontFamily: "Inter",
          fontSize: 34,
          fontWeight: 600,
          letterSpacing: 10,
          textTransform: "uppercase",
          color: accent,
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        {kicker}
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontFamily: "Fraunces",
          fontSize: 92,
          fontWeight: 700,
          color: ink,
          lineHeight: 1.12,
          maxWidth: 900,
          marginTop: 46,
          opacity: interpolate(frame, [6, 26], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [6, 32], ["0px 30px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        {title}
      </Interactive.Div>

      <Interactive.Div
        name="Rule"
        style={{
          height: 6,
          backgroundColor: accent,
          borderRadius: 3,
          marginTop: 44,
          marginBottom: 44,
          width: interpolate(frame, [22, 48], [0, 300], {
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
          fontSize: 42,
          color: ink,
          lineHeight: 1.4,
          maxWidth: 860,
          opacity: interpolate(frame, [34, 58], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [34, 62], ["0px 22px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        {line}
      </Interactive.Div>
    </AbsoluteFill>
  );
};
