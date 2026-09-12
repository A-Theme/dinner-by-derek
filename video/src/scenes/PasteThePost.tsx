import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const PasteThePost: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Paste the post"
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
          fontSize: 108,
          fontWeight: 700,
          color: "#4A2A1A",
          lineHeight: 1.1,
          marginBottom: 50,
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
        Paste the Facebook post.
      </Interactive.Div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 40,
          width: 1620,
        }}
      >
        <Interactive.Div
          name="The post"
          style={{
            width: 700,
            padding: 40,
            borderRadius: 16,
            backgroundColor: "#FBF8F6",
            border: "3px solid rgba(190, 129, 70, 0.45)",
            boxSizing: "border-box",
            opacity: interpolate(frame, [26, 50], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [26, 54], ["-40px 0px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: 4,
              color: "#8A5A2B",
              marginBottom: 20,
            }}
          >
            PASTED FROM THE PAGE
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 40,
              color: "#2C1E18",
              lineHeight: 1.5,
            }}
          >
            SUN — Roast pork loin
            <br />
            MON — Shepherd&apos;s pie
            <br />
            TUE — Butter chicken
            <br />
            WED — Braised beef
          </div>
        </Interactive.Div>

        <svg width="120" height="60" viewBox="0 0 120 60">
          <path
            d="M4 30 L104 30 M86 14 L104 30 L86 46"
            fill="none"
            stroke="#BE8146"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="150"
            strokeDashoffset={interpolate(frame, [58, 84], [150, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            })}
          />
        </svg>

        <Interactive.Div
          name="The preview"
          style={{
            width: 700,
            padding: 40,
            borderRadius: 16,
            backgroundColor: "#FBF8F6",
            border: "3px solid #5A6643",
            boxSizing: "border-box",
            opacity: interpolate(frame, [80, 104], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [80, 108], ["40px 0px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: 4,
              color: "#414A2F",
              marginBottom: 20,
            }}
          >
            PREVIEW · NOT SAVED YET
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 40,
              color: "#2C1E18",
              lineHeight: 1.5,
            }}
          >
            Sunday · Roast pork loin
            <br />
            Monday · Shepherd&apos;s pie
            <br />
            Tuesday · Butter chicken
            <br />
            Wednesday · Braised beef
          </div>
        </Interactive.Div>
      </div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 46,
          color: "#4A2A1A",
          marginTop: 46,
          maxWidth: 1620,
          lineHeight: 1.36,
          opacity: interpolate(frame, [118, 144], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Or copy last week — with every allergen review cleared, on purpose.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
