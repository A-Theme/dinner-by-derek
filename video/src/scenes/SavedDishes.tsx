import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const SavedDishes: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Saved dishes"
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
          maxWidth: 1620,
          marginBottom: 46,
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
        Every dish you cook is kept.
      </Interactive.Div>

      <Interactive.Div
        name="Sort label"
        style={{
          fontFamily: "Inter",
          fontSize: 36,
          fontWeight: 600,
          letterSpacing: 5,
          color: "#8A5A2B",
          marginBottom: 24,
          opacity: interpolate(frame, [24, 44], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        SORTED BY — COOKED MOST OFTEN
      </Interactive.Div>

      <Interactive.Div
        name="Dish row one"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: 1620,
          padding: "14px 32px",
          borderRadius: 12,
          backgroundColor: "#FBF8F6",
          border: "3px solid rgba(190, 129, 70, 0.4)",
          marginBottom: 14,
          opacity: interpolate(frame, [34, 56], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [34, 60], ["-28px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 52,
            color: "#2C1E18",
          }}
        >
          Beef Stroganoff
        </div>
        <div
          style={{
            fontFamily: "Fraunces",
            fontSize: 42,
            fontWeight: 700,
            color: "#2C1E18",
            backgroundColor: "#BE8146",
            padding: "8px 26px",
            borderRadius: 999,
          }}
        >
          14×
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Dish row two"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: 1620,
          padding: "14px 32px",
          borderRadius: 12,
          backgroundColor: "#FBF8F6",
          border: "3px solid rgba(190, 129, 70, 0.4)",
          marginBottom: 14,
          opacity: interpolate(frame, [46, 68], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [46, 72], ["-28px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 52,
            color: "#2C1E18",
          }}
        >
          Chicken Parmesan
        </div>
        <div
          style={{
            fontFamily: "Fraunces",
            fontSize: 42,
            fontWeight: 700,
            color: "#2C1E18",
            backgroundColor: "#BE8146",
            padding: "8px 26px",
            borderRadius: 999,
          }}
        >
          11×
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Dish row three"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: 1620,
          padding: "14px 32px",
          borderRadius: 12,
          backgroundColor: "#FBF8F6",
          border: "3px solid rgba(190, 129, 70, 0.4)",
          opacity: interpolate(frame, [58, 80], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [58, 84], ["-28px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 52,
            color: "#2C1E18",
          }}
        >
          Shepherd&apos;s Pie
        </div>
        <div
          style={{
            fontFamily: "Fraunces",
            fontSize: 42,
            fontWeight: 700,
            color: "#2C1E18",
            backgroundColor: "#BE8146",
            padding: "8px 26px",
            borderRadius: 999,
          }}
        >
          9×
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 50,
          color: "#4A2A1A",
          marginTop: 36,
          maxWidth: 1620,
          lineHeight: 1.3,
          opacity: interpolate(frame, [104, 130], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Pick one and the day fills in. The review tick never travels.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
