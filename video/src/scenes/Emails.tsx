import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

// Subject lines in the shapes the mailer actually writes them.
const mails = [
  {
    to: "TO THE CUSTOMER",
    subject: "Order confirmed — Wednesday, September 16",
  },
  { to: "TO YOU", subject: "Wednesday, September 16 — Pickup — J. Tran" },
  {
    to: "AFTER THE CUTOFF",
    subject: "Late request received — Thursday, September 17",
  },
];

export const Emails: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Emails"
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
        Email, both ways.
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {mails.map((m, i) => (
          <div
            key={m.to}
            style={{
              width: 1620,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "row",
              alignItems: "baseline",
              gap: 36,
              padding: "24px 40px",
              borderRadius: 14,
              backgroundColor: "#F4EFEB",
              opacity: interpolate(frame, [26 + i * 14, 48 + i * 14], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: interpolate(
                frame,
                [26 + i * 14, 54 + i * 14],
                ["-34px 0px", "0px 0px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                },
              ),
            }}
          >
            <div
              style={{
                width: 380,
                flexShrink: 0,
                fontFamily: "Inter",
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: 3,
                color: "#8A5A2B",
              }}
            >
              {m.to}
            </div>
            <div
              style={{
                fontFamily: "Inter",
                fontSize: 42,
                color: "#2C1E18",
              }}
            >
              {m.subject}
            </div>
          </div>
        ))}
      </div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 48,
          color: "#EBC08C",
          marginTop: 46,
          maxWidth: 1620,
          lineHeight: 1.36,
          opacity: interpolate(frame, [96, 122], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Email switched off? Orders still save and still show on the dashboard.
        Nothing is lost.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
