import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

// Four real rows from the seeded term dictionary: the word a cook writes,
// and the priority allergen it suggests.
const terms = [
  { word: "ghee", allergen: "milk" },
  { word: "tahini", allergen: "sesame" },
  { word: "miso", allergen: "soy" },
  { word: "worcestershire", allergen: "fish" },
];

export const AllergenDictionary: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Allergen dictionary"
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
          maxWidth: 1620,
          marginBottom: 56,
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
        Teach it the kitchen&apos;s words.
      </Interactive.Div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "wrap",
          columnGap: 60,
          rowGap: 26,
          width: 1620,
        }}
      >
        {terms.map((t, i) => (
          <div
            key={t.word}
            style={{
              width: 780,
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 26,
              opacity: interpolate(frame, [28 + i * 12, 50 + i * 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <div
              style={{
                fontFamily: "Inter",
                fontSize: 48,
                color: "#2C1E18",
                backgroundColor: "#F4EFEB",
                padding: "14px 30px",
                borderRadius: 12,
              }}
            >
              {t.word}
            </div>
            <div
              style={{
                fontFamily: "Inter",
                fontSize: 48,
                color: "#EBC08C",
              }}
            >
              →
            </div>
            <div
              style={{
                fontFamily: "Inter",
                fontSize: 44,
                fontWeight: 600,
                color: "#2C1E18",
                backgroundColor: "#BE8146",
                padding: "12px 30px",
                borderRadius: 999,
                scale: interpolate(
                  frame,
                  [40 + i * 12, 60 + i * 12],
                  [0.7, 1],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.spring({ damping: 200 }),
                    output: "perceptual-scale",
                  },
                ),
              }}
            >
              {t.allergen}
            </div>
          </div>
        ))}
      </div>

      <Interactive.Div
        name="Source"
        style={{
          fontFamily: "Inter",
          fontSize: 54,
          color: "#F4EFEB",
          marginTop: 56,
          opacity: interpolate(frame, [96, 120], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Seeded from Health Canada&apos;s priority allergens.
      </Interactive.Div>
      <Interactive.Div
        name="Still a suggestion"
        style={{
          fontFamily: "Inter",
          fontSize: 48,
          color: "#EBC08C",
          marginTop: 18,
          opacity: interpolate(frame, [124, 148], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Add a word once and it suggests from then on — never applies.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
