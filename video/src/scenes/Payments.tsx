import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const Payments: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Payments"
      style={{
        backgroundColor: "#F4EFEB",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: 150,
      }}
    >
      <Interactive.Div
        name="Ready tag"
        style={{
          fontFamily: "Inter",
          fontSize: 34,
          fontWeight: 600,
          letterSpacing: 4,
          color: "#8A5A2B",
          border: "3px solid #BE8146",
          padding: "8px 26px",
          borderRadius: 999,
          marginBottom: 16,
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        READY TO SWITCH ON
      </Interactive.Div>

      <Interactive.Div
        name="Headline"
        style={{
          fontFamily: "Fraunces",
          fontSize: 108,
          fontWeight: 700,
          color: "#4A2A1A",
          lineHeight: 1.1,
          maxWidth: 1400,
          marginBottom: 36,
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
        No money moves through this app.
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
          name="Bank notification"
          style={{
            width: 700,
            padding: 40,
            borderRadius: 16,
            backgroundColor: "#FBF8F6",
            border: "3px solid rgba(190, 129, 70, 0.45)",
            opacity: interpolate(frame, [30, 54], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [30, 58], ["-40px 0px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 34,
              fontWeight: 600,
              letterSpacing: 4,
              color: "#8A5A2B",
              marginBottom: 20,
            }}
          >
            YOUR INBOX
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
            INTERAC e-Transfer
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 40,
              color: "#6B4630",
            }}
          >
            $48.00 received from J. Tran
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
            strokeDashoffset={interpolate(frame, [64, 92], [150, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            })}
          />
        </svg>

        <Interactive.Div
          name="Matched order"
          style={{
            width: 700,
            padding: 40,
            borderRadius: 16,
            backgroundColor: "#FBF8F6",
            border: "3px solid #5A6643",
            opacity: interpolate(frame, [88, 112], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [88, 116], ["40px 0px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 34,
              fontWeight: 600,
              letterSpacing: 4,
              color: "#414A2F",
              marginBottom: 20,
            }}
          >
            DASHBOARD — PAYMENTS
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
            Order #1042 · Tran
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 40,
              color: "#414A2F",
            }}
          >
            $48.00 · matched
          </div>
        </Interactive.Div>
      </div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 62,
          color: "#4A2A1A",
          marginTop: 36,
          maxWidth: 1620,
          lineHeight: 1.3,
          opacity: interpolate(frame, [124, 150], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        It reads the notification your bank already sends.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
