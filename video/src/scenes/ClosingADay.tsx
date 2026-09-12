import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const ClosingADay: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Closing a day"
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
          marginBottom: 60,
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
        Closed is not blank.
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "row", gap: 48 }}>
        <Interactive.Div
          name="A day"
          style={{
            width: 786,
            minHeight: 250,
            padding: 44,
            boxSizing: "border-box",
            borderRadius: 16,
            backgroundColor: "#F4EFEB",
            opacity: interpolate(frame, [26, 50], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [26, 56], ["0px 40px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div
            style={{
              fontFamily: "Fraunces",
              fontSize: 60,
              fontWeight: 700,
              color: "#2C1E18",
              marginBottom: 16,
            }}
          >
            Close a day
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 42,
              color: "#6B4630",
              lineHeight: 1.35,
            }}
          >
            Marked closed, and it can&apos;t be opened. Its link still answers,
            and says the kitchen is shut.
          </div>
        </Interactive.Div>

        <Interactive.Div
          name="A week"
          style={{
            width: 786,
            minHeight: 250,
            padding: 44,
            boxSizing: "border-box",
            borderRadius: 16,
            backgroundColor: "#F4EFEB",
            opacity: interpolate(frame, [42, 66], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [42, 72], ["0px 40px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div
            style={{
              fontFamily: "Fraunces",
              fontSize: 60,
              fontWeight: 700,
              color: "#2C1E18",
              marginBottom: 16,
            }}
          >
            Close a week
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 42,
              color: "#6B4630",
              lineHeight: 1.35,
            }}
          >
            One message instead of a menu — with a note, like “away for a
            wedding”.
          </div>
        </Interactive.Div>
      </div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 52,
          color: "#EBC08C",
          marginTop: 56,
          opacity: interpolate(frame, [96, 122], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Nothing is deleted — reopen it and every dish is back.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
