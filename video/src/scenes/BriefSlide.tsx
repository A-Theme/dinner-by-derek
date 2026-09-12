import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

/**
 * One idea, told big, for the 45-second cut.
 *
 * The tour's slides take four or five seconds to assemble themselves, which is
 * most of a short cut's slide gone before there is anything to read. These
 * settle inside two, and then hold. Same reason they carry a line rather than a
 * table: at this length the viewer gets one thing, so it may as well be legible.
 *
 * It takes props because it is used six times; the tour's slides are each
 * written out in full, because each is different.
 */
export const BriefSlide: React.FC<{
  title: string;
  line: string;
  background: string;
  ink: string;
  accent: string;
}> = ({ title, line, background, ink, accent }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Brief slide"
      style={{
        backgroundColor: background,
        justifyContent: "center",
        alignItems: "flex-start",
        padding: 150,
      }}
    >
      <Interactive.Div
        name="Title"
        style={{
          fontFamily: "Fraunces",
          fontSize: 124,
          fontWeight: 700,
          color: ink,
          lineHeight: 1.1,
          maxWidth: 1620,
          opacity: interpolate(frame, [0, 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0, 26], ["0px 34px", "0px 0px"], {
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
          height: 8,
          backgroundColor: accent,
          borderRadius: 4,
          marginTop: 44,
          marginBottom: 44,
          width: interpolate(frame, [18, 44], [0, 420], {
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
          fontSize: 70,
          color: accent,
          lineHeight: 1.3,
          maxWidth: 1620,
          opacity: interpolate(frame, [28, 52], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [28, 56], ["0px 24px", "0px 0px"], {
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
