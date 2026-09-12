import {
  AbsoluteFill,
  Easing,
  Img,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

/**
 * The first three seconds. Identity only — the mark, the name, and where this
 * is. A spot that opens on a proposition is a spot somebody scrolls past before
 * finding out whose it is.
 *
 * The mark is mark-gold.png, not icon-512.png: the icon is ink on a parchment
 * tile and reads as a white box on olive. See scripts/make-mark.js.
 */
export const LaunchOpening: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Launch opening"
      style={{
        backgroundColor: "#5A6643",
        justifyContent: "center",
        alignItems: "center",
        padding: 90,
        textAlign: "center",
      }}
    >
      <Interactive.Div
        name="Mark"
        style={{
          opacity: interpolate(frame, [0, 24], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [0, 40], [0.86, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
            output: "perceptual-scale",
          }),
        }}
      >
        <Img src={staticFile("icons/mark-gold.png")} style={{ width: 292, height: 300 }} />
      </Interactive.Div>

      <Interactive.Div
        name="Name"
        style={{
          fontFamily: "Fraunces",
          /* 96 rather than 104: Fraunces at 700 is wider than it looks in a
             fallback serif, and at 104 "Dinner By Derek" runs to within a few
             pixels of the 900px the padding leaves. A name that wraps is a
             worse opening frame than a name set slightly smaller. */
          fontSize: 96,
          fontWeight: 700,
          color: "#F4EFEB",
          lineHeight: 1.05,
          marginTop: 56,
          opacity: interpolate(frame, [16, 40], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Dinner By Derek
      </Interactive.Div>

      <Interactive.Div
        name="Where"
        style={{
          fontFamily: "Inter",
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: "#EBC08C",
          marginTop: 34,
          opacity: interpolate(frame, [30, 54], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Supper club · Kitchener &amp; Waterloo
      </Interactive.Div>
    </AbsoluteFill>
  );
};
