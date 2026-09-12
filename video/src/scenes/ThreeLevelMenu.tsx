import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const ThreeLevelMenu: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Three level menu"
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
          marginBottom: 44,
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
        One menu, three levels
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "row", gap: 48 }}>
        <Interactive.Div
          name="Level one card"
          style={{
            width: 508,
            minHeight: 250,
            padding: 44,
            borderRadius: 16,
            backgroundColor: "#FBF8F6",
            border: "3px solid #BE8146",
            opacity: interpolate(frame, [24, 46], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [24, 52], ["0px 44px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: 34,
              backgroundColor: "#BE8146",
              color: "#2C1E18",
              fontFamily: "Fraunces",
              fontSize: 40,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 28,
            }}
          >
            1
          </div>
          <div
            style={{
              fontFamily: "Fraunces",
              fontSize: 52,
              fontWeight: 700,
              color: "#2C1E18",
              marginBottom: 14,
            }}
          >
            Featured dish
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 40,
              color: "#6B4630",
              lineHeight: 1.35,
            }}
          >
            One per service day
          </div>
        </Interactive.Div>

        <Interactive.Div
          name="Level two card"
          style={{
            width: 508,
            minHeight: 250,
            padding: 44,
            borderRadius: 16,
            backgroundColor: "#FBF8F6",
            border: "3px solid #BE8146",
            opacity: interpolate(frame, [38, 60], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [38, 66], ["0px 44px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: 34,
              backgroundColor: "#BE8146",
              color: "#2C1E18",
              fontFamily: "Fraunces",
              fontSize: 40,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 28,
            }}
          >
            2
          </div>
          <div
            style={{
              fontFamily: "Fraunces",
              fontSize: 52,
              fontWeight: 700,
              color: "#2C1E18",
              marginBottom: 14,
            }}
          >
            Weekly items
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 40,
              color: "#6B4630",
              lineHeight: 1.35,
            }}
          >
            Soup, salad, dessert, meatless main
          </div>
        </Interactive.Div>

        <Interactive.Div
          name="Level three card"
          style={{
            width: 508,
            minHeight: 250,
            padding: 44,
            borderRadius: 16,
            backgroundColor: "#FBF8F6",
            border: "3px solid #BE8146",
            opacity: interpolate(frame, [52, 74], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [52, 80], ["0px 44px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: 34,
              backgroundColor: "#BE8146",
              color: "#2C1E18",
              fontFamily: "Fraunces",
              fontSize: 40,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 28,
            }}
          >
            3
          </div>
          <div
            style={{
              fontFamily: "Fraunces",
              fontSize: 52,
              fontWeight: 700,
              color: "#2C1E18",
              marginBottom: 14,
            }}
          >
            Standing items
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 40,
              color: "#6B4630",
              lineHeight: 1.35,
            }}
          >
            Carried across every week
          </div>
        </Interactive.Div>
      </div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 62,
          fontWeight: 400,
          color: "#4A2A1A",
          marginTop: 44,
          opacity: interpolate(frame, [96, 122], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Combined only when a customer opens a day.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
