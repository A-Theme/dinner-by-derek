import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { interpolate, staticFile } from "remotion";
import { BriefSlide } from "./scenes/BriefSlide";
import { Closing } from "./scenes/Closing";
import { Opening } from "./scenes/Opening";

// The 45-second cut: the same story as the tour, told in six statements.
// It shares the opening and closing with the tour and nothing else -- the
// tour's slides take too long to assemble themselves to be worth trimming.
// Each transition overlaps its two neighbours, so the composition is
// 105 frames shorter than the 8 durations added up:
// 1485 - 7 * 15 = 1380. Change a duration here and the
// total in Root.tsx, and the fade-out below, have to move with it.
export const Brief: React.FC = () => {
  return (
    <>
      <Audio
        name="Backing track"
        src={staticFile("music/lofi-jazz.mp3")}
        durationInFrames={1380}
        volume={(f) =>
          interpolate(f, [0, 40, 1310, 1379], [0, 0.65, 0.65, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={180} name="Opening">
          <Opening />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={180} name="Ordering">
          <BriefSlide
            title="It installs like an app."
            line="Customers pick a day and order. No accounts."
            background="#5A6643"
            ink="#F4EFEB"
            accent="#EBC08C"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={180} name="The cutoff">
          <BriefSlide
            title="Orders close at 22:00."
            line="The night before. Late requests until six."
            background="#2C1E18"
            ink="#F4EFEB"
            accent="#EBC08C"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence
          durationInFrames={195}
          name="The allergen gate"
        >
          <BriefSlide
            title="Nothing publishes until allergens are reviewed."
            line="The app suggests. You decide, and you tick."
            background="#F4EFEB"
            ink="#4A2A1A"
            accent="#8A5A2B"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={180} name="Fulfilment">
          <BriefSlide
            title="Pickup, or delivery by postal code."
            line="Paid by e-transfer, matched automatically."
            background="#5A6643"
            ink="#F4EFEB"
            accent="#EBC08C"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={180} name="The kitchen">
          <BriefSlide
            title="Recipes, saved dishes, printed sheets."
            line="415 recipes to scale, the day on one page."
            background="#2C1E18"
            ink="#F4EFEB"
            accent="#EBC08C"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={180} name="Running it">
          <BriefSlide
            title="You run it from a phone."
            line="It publishes itself on Saturday at noon."
            background="#F4EFEB"
            ink="#4A2A1A"
            accent="#8A5A2B"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={210} name="Closing">
          <Closing />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </>
  );
};
