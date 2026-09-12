import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const Cutoff: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="The cutoff"
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
          marginBottom: 96,
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
        There are no
        <br />
        same-day orders.
      </Interactive.Div>

      <div style={{ position: "relative", width: 1620, height: 300 }}>
        <Interactive.Div
          name="Timeline rule"
          style={{
            position: "absolute",
            top: 36,
            left: 38,
            height: 6,
            backgroundColor: "#BE8146",
            borderRadius: 3,
            width: interpolate(frame, [26, 78], [0, 1160], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1620,
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Interactive.Div
            name="Stop one"
            style={{
              width: 460,
              opacity: interpolate(frame, [34, 56], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
                backgroundColor: "#EBC08C",
                marginBottom: 32,
              }}
            />
            <div
              style={{
                fontFamily: "Fraunces",
                fontSize: 66,
                fontWeight: 700,
                color: "#F4EFEB",
                marginBottom: 14,
              }}
            >
              Until 22:00
            </div>
            <div
              style={{
                fontFamily: "Inter",
                fontSize: 42,
                color: "rgba(244, 239, 235, 0.72)",
                lineHeight: 1.35,
              }}
            >
              Orders. They hold stock.
            </div>
          </Interactive.Div>

          <Interactive.Div
            name="Stop two"
            style={{
              width: 460,
              opacity: interpolate(frame, [52, 74], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
                backgroundColor: "#BE8146",
                marginBottom: 32,
              }}
            />
            <div
              style={{
                fontFamily: "Fraunces",
                fontSize: 66,
                fontWeight: 700,
                color: "#F4EFEB",
                marginBottom: 14,
              }}
            >
              Until 06:00
            </div>
            <div
              style={{
                fontFamily: "Inter",
                fontSize: 42,
                color: "rgba(244, 239, 235, 0.72)",
                lineHeight: 1.35,
              }}
            >
              Late requests. They hold nothing.
            </div>
          </Interactive.Div>

          <Interactive.Div
            name="Stop three"
            style={{
              width: 460,
              opacity: interpolate(frame, [70, 92], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
                border: "8px solid rgba(235, 192, 140, 0.45)",
                boxSizing: "border-box",
                marginBottom: 32,
              }}
            />
            <div
              style={{
                fontFamily: "Fraunces",
                fontSize: 66,
                fontWeight: 700,
                color: "#F4EFEB",
                marginBottom: 14,
              }}
            >
              After 06:00
            </div>
            <div
              style={{
                fontFamily: "Inter",
                fontSize: 42,
                color: "rgba(244, 239, 235, 0.72)",
                lineHeight: 1.35,
              }}
            >
              The form is gone. The server refuses too.
            </div>
          </Interactive.Div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
