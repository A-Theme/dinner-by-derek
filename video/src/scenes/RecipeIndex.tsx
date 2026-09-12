import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const RecipeIndex: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Recipe index"
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
          fontSize: 108,
          fontWeight: 700,
          color: "#F4EFEB",
          lineHeight: 1.1,
          maxWidth: 1400,
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
        A recipe index of industry standards.
      </Interactive.Div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: 48,
          width: 1620,
        }}
      >
        <Interactive.Div
          name="Preparations count"
          style={{
            width: 508,
            opacity: interpolate(frame, [30, 54], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [30, 58], ["0px 34px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div
            style={{
              fontFamily: "Fraunces",
              fontSize: 104,
              fontWeight: 700,
              color: "#EBC08C",
              lineHeight: 1.05,
            }}
          >
            253
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 46,
              color: "rgba(244, 239, 235, 0.78)",
              marginTop: 8,
            }}
          >
            Preparations
          </div>
        </Interactive.Div>

        <Interactive.Div
          name="Components count"
          style={{
            width: 508,
            opacity: interpolate(frame, [44, 68], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [44, 72], ["0px 34px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div
            style={{
              fontFamily: "Fraunces",
              fontSize: 104,
              fontWeight: 700,
              color: "#EBC08C",
              lineHeight: 1.05,
            }}
          >
            56
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 46,
              color: "rgba(244, 239, 235, 0.78)",
              marginTop: 8,
            }}
          >
            Components
          </div>
        </Interactive.Div>

        <Interactive.Div
          name="Dishes count"
          style={{
            width: 508,
            opacity: interpolate(frame, [58, 82], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [58, 86], ["0px 34px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div
            style={{
              fontFamily: "Fraunces",
              fontSize: 104,
              fontWeight: 700,
              color: "#EBC08C",
              lineHeight: 1.05,
            }}
          >
            106
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 46,
              color: "rgba(244, 239, 235, 0.78)",
              marginTop: 8,
            }}
          >
            Dishes
          </div>
        </Interactive.Div>
      </div>

      <Interactive.Div
        name="Provenance"
        style={{
          fontFamily: "Inter",
          fontSize: 44,
          color: "#F4EFEB",
          marginTop: 46,
          maxWidth: 1620,
          lineHeight: 1.32,
          opacity: interpolate(frame, [96, 122], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Classical ratios in our own words — scale any of them to a new yield.
      </Interactive.Div>

      <Interactive.Div
        name="Allergen link"
        style={{
          fontFamily: "Inter",
          fontSize: 42,
          color: "#EBC08C",
          marginTop: 22,
          maxWidth: 1620,
          lineHeight: 1.32,
          opacity: interpolate(frame, [132, 158], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Ingredients feed the allergen suggester — the butter “creamy” hides.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
