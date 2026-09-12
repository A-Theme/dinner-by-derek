import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

// The one scene used more than once, so it is the one that takes props. The
// words differ per chapter; the layout and timing must not, or the six breaks
// stop reading as the same device.
export const ChapterCard: React.FC<{
  number: string;
  title: string;
  line: string;
}> = ({ number, title, line }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Chapter card"
      style={{
        backgroundColor: "#4A2A1A",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: 150,
      }}
    >
      <Interactive.Div
        name="Chapter number"
        style={{
          fontFamily: "Inter",
          fontSize: 46,
          fontWeight: 600,
          letterSpacing: 12,
          color: "#BE8146",
          opacity: interpolate(frame, [0, 16], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        CHAPTER {number}
      </Interactive.Div>
      <Interactive.Div
        name="Chapter title"
        style={{
          fontFamily: "Fraunces",
          fontSize: 168,
          fontWeight: 700,
          color: "#F4EFEB",
          lineHeight: 1.05,
          marginTop: 24,
          opacity: interpolate(frame, [6, 28], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [6, 34], ["0px 36px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        {title}
      </Interactive.Div>
      <Interactive.Div
        name="Chapter rule"
        style={{
          height: 8,
          backgroundColor: "#BE8146",
          borderRadius: 4,
          marginTop: 40,
          marginBottom: 40,
          width: interpolate(frame, [20, 50], [0, 520], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />
      <Interactive.Div
        name="Chapter line"
        style={{
          fontFamily: "Inter",
          fontSize: 66,
          color: "#EBC08C",
          maxWidth: 1620,
          lineHeight: 1.3,
          opacity: interpolate(frame, [30, 52], [0, 1], {
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
