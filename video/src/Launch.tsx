import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { interpolate, staticFile } from "remotion";
import { LaunchClosing } from "./scenes/launch/LaunchClosing";
import { LaunchLine } from "./scenes/launch/LaunchLine";
import { LaunchOpening } from "./scenes/launch/LaunchOpening";

/**
 * The customer-facing cut. Twenty seconds, portrait, no voiceover.
 *
 * The two videos this project already holds are a tour of the app, made for
 * whoever runs it. Showing either to a customer would answer questions nobody
 * outside the kitchen has asked. This one answers the four a stranger actually
 * has, in the order they have them: what is this, when do I order, how do I get
 * it, how do I pay. Then the address, held.
 *
 * It is built to work with the sound off, because that is how it will be
 * watched. The backing track is the project's own synthesised one, carrying no
 * licence, and nothing in the edit depends on hearing it.
 *
 * Registered twice in Root.tsx at the same width and two heights: Launch at
 * 1080×1350 for the feed, LaunchStory at 1080×1920 for stories and reels.
 * Both are the same component; only the vertical breathing room differs, which
 * the scenes absorb by centring.
 *
 * Each transition overlaps its two neighbours, so the composition is 60 frames
 * shorter than the six durations added up: 660 - 5 * 12 = 600. Change a
 * duration here and the total in Root.tsx, and the fade-out below, move with
 * it.
 */
export const Launch: React.FC = () => {
  return (
    <>
      <Audio
        name="Backing track"
        src={staticFile("music/lofi-jazz.mp3")}
        durationInFrames={600}
        volume={(f) =>
          interpolate(f, [0, 30, 540, 599], [0, 0.55, 0.55, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={84} name="Opening">
          <LaunchOpening />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={120} name="What it is">
          <LaunchLine
            kicker="What it is"
            title="A small menu, cooked the day you collect it."
            line="Not a restaurant. Not a meal kit. One kitchen, a few days a week."
            background="#2C1E18"
            ink="#F4EFEB"
            accent="#EBC08C"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={120} name="When to order">
          <LaunchLine
            kicker="When"
            title="Order by 10 PM the night before."
            line="Everything is cooked the day you get it, so there are no same-day orders."
            background="#5A6643"
            ink="#F4EFEB"
            accent="#EBC08C"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={120} name="How you get it">
          <LaunchLine
            kicker="How you get it"
            title="Collect it, or I bring it to you."
            line="Pickup 4:00–7:00 PM. Delivery across Kitchener and Waterloo."
            background="#3C2114"
            ink="#F4EFEB"
            accent="#EBC08C"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={108} name="Paying">
          <LaunchLine
            kicker="Paying"
            title="E-transfer or cash."
            line="No account, no app store, nothing to download."
            background="#2C1E18"
            ink="#F4EFEB"
            accent="#EBC08C"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={108} name="Closing">
          <LaunchClosing />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </>
  );
};
