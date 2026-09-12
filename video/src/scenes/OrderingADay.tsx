import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const OrderingADay: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Ordering a day"
      style={{
        backgroundColor: "#5A6643",
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
        Pick a day, then order.
      </Interactive.Div>

      <Interactive.Div
        name="Day tabs"
        style={{
          display: "flex",
          flexDirection: "row",
          gap: 18,
          marginBottom: 30,
          opacity: interpolate(frame, [22, 44], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 42,
            fontWeight: 600,
            color: "#F4EFEB",
            padding: "14px 34px",
            borderRadius: 999,
            border: "3px solid rgba(244, 239, 235, 0.5)",
          }}
        >
          Sun
        </div>
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 42,
            fontWeight: 600,
            color: "#F4EFEB",
            padding: "14px 34px",
            borderRadius: 999,
            border: "3px solid rgba(244, 239, 235, 0.5)",
          }}
        >
          Mon
        </div>
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 42,
            fontWeight: 600,
            color: "#F4EFEB",
            padding: "14px 34px",
            borderRadius: 999,
            border: "3px solid rgba(244, 239, 235, 0.5)",
          }}
        >
          Tue
        </div>
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 42,
            fontWeight: 600,
            color: "#2C1E18",
            backgroundColor: "#EBC08C",
            padding: "14px 34px",
            borderRadius: 999,
            border: "3px solid #EBC08C",
          }}
        >
          Wed
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Dish card"
        style={{
          width: 1620,
          padding: 44,
          borderRadius: 18,
          backgroundColor: "#F4EFEB",
          boxSizing: "border-box",
          opacity: interpolate(frame, [36, 60], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [36, 64], ["0px 34px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 30,
          }}
        >
          <div
            style={{
              fontFamily: "Fraunces",
              fontSize: 60,
              fontWeight: 700,
              color: "#2C1E18",
            }}
          >
            Braised beef with buttered mash
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 34,
              fontWeight: 600,
              color: "#F4EFEB",
              backgroundColor: "#414A2F",
              padding: "8px 22px",
              borderRadius: 999,
            }}
          >
            Halal
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "row", gap: 24 }}>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 44,
              color: "#2C1E18",
              padding: "20px 36px",
              borderRadius: 12,
              border: "3px solid #BE8146",
            }}
          >
            Full size · $48
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 44,
              color: "#2C1E18",
              padding: "20px 36px",
              borderRadius: 12,
              border: "3px solid #BE8146",
            }}
          >
            Meal for one · $16
          </div>
          <Interactive.Div
            name="Scarcity badge"
            style={{
              fontFamily: "Inter",
              fontSize: 40,
              fontWeight: 600,
              color: "#8A5A2B",
              alignSelf: "center",
              marginLeft: 16,
              opacity: interpolate(frame, [80, 98], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            Only 4 left for today
          </Interactive.Div>
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 62,
          color: "#EBC08C",
          marginTop: 44,
          opacity: interpolate(frame, [108, 134], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Every day has its own link to share.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
