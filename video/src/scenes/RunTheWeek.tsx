import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const RunTheWeek: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Run the week"
      style={{
        backgroundColor: "#2C1E18",
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
          color: "#F4EFEB",
          lineHeight: 1.1,
          maxWidth: 1400,
          marginBottom: 64,
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
        You run the week from a phone.
      </Interactive.Div>

      <Interactive.Div
        name="Step one"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "baseline",
          gap: 34,
          marginBottom: 26,
          opacity: interpolate(frame, [30, 54], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [30, 58], ["-30px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            fontFamily: "Fraunces",
            fontSize: 64,
            fontWeight: 700,
            color: "#BE8146",
          }}
        >
          01
        </div>
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 68,
            color: "#F4EFEB",
          }}
        >
          Build the week as a draft.
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Step two"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "baseline",
          gap: 34,
          marginBottom: 26,
          opacity: interpolate(frame, [54, 78], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [54, 82], ["-30px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            fontFamily: "Fraunces",
            fontSize: 64,
            fontWeight: 700,
            color: "#BE8146",
          }}
        >
          02
        </div>
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 68,
            color: "#F4EFEB",
          }}
        >
          It publishes itself, Saturday at noon.
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Step three"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "baseline",
          gap: 34,
          opacity: interpolate(frame, [78, 102], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [78, 106], ["-30px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            fontFamily: "Fraunces",
            fontSize: 64,
            fontWeight: 700,
            color: "#BE8146",
          }}
        >
          03
        </div>
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 68,
            color: "#F4EFEB",
          }}
        >
          Unless something still needs review.
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 46,
          color: "#EBC08C",
          marginTop: 50,
          maxWidth: 1620,
          lineHeight: 1.35,
          opacity: interpolate(frame, [116, 142], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Nothing built by Thursday noon? One email: cook it, or close the week.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
