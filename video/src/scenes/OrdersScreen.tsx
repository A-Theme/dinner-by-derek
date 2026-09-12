import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

const filters = ["Wed, Sep 16", "Pickup", "Any location", "Name or phone…"];

export const OrdersScreen: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Orders screen"
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
          fontSize: 112,
          fontWeight: 700,
          color: "#F4EFEB",
          lineHeight: 1.1,
          marginBottom: 48,
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
        Every order, findable.
      </Interactive.Div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: 18,
          marginBottom: 30,
        }}
      >
        {filters.map((f, i) => (
          <div
            key={f}
            style={{
              fontFamily: "Inter",
              fontSize: 38,
              color: i === 3 ? "rgba(244, 239, 235, 0.55)" : "#F4EFEB",
              padding: "12px 28px",
              borderRadius: 10,
              border: "3px solid rgba(244, 239, 235, 0.35)",
              opacity: interpolate(frame, [22 + i * 6, 40 + i * 6], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            {f}
          </div>
        ))}
      </div>

      <Interactive.Div
        name="Order row"
        style={{
          width: 1620,
          boxSizing: "border-box",
          padding: "34px 44px",
          borderRadius: 16,
          backgroundColor: "#F4EFEB",
          opacity: interpolate(frame, [48, 70], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [48, 76], ["0px 34px", "0px 0px"], {
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
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <div
            style={{
              fontFamily: "Fraunces",
              fontSize: 54,
              fontWeight: 700,
              color: "#2C1E18",
            }}
          >
            J. Tran
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 46,
              fontWeight: 600,
              color: "#2C1E18",
            }}
          >
            $80.00
          </div>
        </div>
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 40,
            color: "#6B4630",
            marginTop: 8,
          }}
        >
          Full size × 1 · Meal for one × 2 · Pickup
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 20,
            marginTop: 24,
          }}
        >
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 38,
              fontWeight: 600,
              color: "#F4EFEB",
              backgroundColor: "#5A6643",
              padding: "10px 28px",
              borderRadius: 999,
            }}
          >
            ✓ Paid
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 38,
              fontWeight: 600,
              color: "#4A2A1A",
              border: "3px solid #4A2A1A",
              padding: "7px 28px",
              borderRadius: 999,
            }}
          >
            Handed over
          </div>
        </div>
        <Interactive.Div
          name="Allergy note"
          style={{
            fontFamily: "Inter",
            fontSize: 42,
            fontWeight: 600,
            color: "#8A5A2B",
            marginTop: 24,
            opacity: interpolate(frame, [84, 104], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          Allergy note: no sesame, please.
        </Interactive.Div>
      </Interactive.Div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 50,
          color: "#EBC08C",
          marginTop: 40,
          opacity: interpolate(frame, [112, 138], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Both toggles undo. Allergy notes print on the kitchen sheet too.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
