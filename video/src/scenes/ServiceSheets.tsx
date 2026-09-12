import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const ServiceSheets: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Service sheets"
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
        Three printed sheets.
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "row", gap: 48 }}>
        <Interactive.Div
          name="Kitchen sheet card"
          style={{
            width: 508,
            minHeight: 300,
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
              fontFamily: "Fraunces",
              fontSize: 58,
              fontWeight: 700,
              color: "#2C1E18",
              marginBottom: 18,
            }}
          >
            Kitchen
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 40,
              color: "#6B4630",
              lineHeight: 1.35,
            }}
          >
            The cook list, in totals — and every allergy note a customer left
          </div>
        </Interactive.Div>

        <Interactive.Div
          name="Pickup sheet card"
          style={{
            width: 508,
            minHeight: 300,
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
              fontFamily: "Fraunces",
              fontSize: 58,
              fontWeight: 700,
              color: "#2C1E18",
              marginBottom: 18,
            }}
          >
            Pickup
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 40,
              color: "#6B4630",
              lineHeight: 1.35,
            }}
          >
            Who is coming, grouped by location, with a box to tick
          </div>
        </Interactive.Div>

        <Interactive.Div
          name="Delivery sheet card"
          style={{
            width: 508,
            minHeight: 300,
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
              fontFamily: "Fraunces",
              fontSize: 58,
              fontWeight: 700,
              color: "#2C1E18",
              marginBottom: 18,
            }}
          >
            Delivery run
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 40,
              color: "#6B4630",
              lineHeight: 1.35,
            }}
          >
            Stops grouped by postal area, addresses and phones
          </div>
        </Interactive.Div>
      </div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 70,
          color: "#4A2A1A",
          marginTop: 60,
          opacity: interpolate(frame, [96, 122], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        One page each. Print it, or save it as a PDF.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
