import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { interpolate, staticFile } from "remotion";
import { AdminHomeScreen } from "./scenes/AdminHomeScreen";
import { AllergenDictionary } from "./scenes/AllergenDictionary";
import { AllergenGate } from "./scenes/AllergenGate";
import { BackupRestore } from "./scenes/BackupRestore";
import { CardStickerQr } from "./scenes/CardStickerQr";
import { ChapterCard } from "./scenes/ChapterCard";
import { Closing } from "./scenes/Closing";
import { ClosingADay } from "./scenes/ClosingADay";
import { Cutoff } from "./scenes/Cutoff";
import { DeliveryArea } from "./scenes/DeliveryArea";
import { Emails } from "./scenes/Emails";
import { FacebookPublishing } from "./scenes/FacebookPublishing";
import { HowManyToCook } from "./scenes/HowManyToCook";
import { InstallsLikeAnApp } from "./scenes/InstallsLikeAnApp";
import { MeatlessMonday } from "./scenes/MeatlessMonday";
import { MenuHistory } from "./scenes/MenuHistory";
import { Opening } from "./scenes/Opening";
import { OrderingADay } from "./scenes/OrderingADay";
import { OrdersScreen } from "./scenes/OrdersScreen";
import { OtherOptions } from "./scenes/OtherOptions";
import { PasteThePost } from "./scenes/PasteThePost";
import { Payments } from "./scenes/Payments";
import { PickupWindow } from "./scenes/PickupWindow";
import { Proofreader } from "./scenes/Proofreader";
import { RecipeIndex } from "./scenes/RecipeIndex";
import { RunTheWeek } from "./scenes/RunTheWeek";
import { SavedDishes } from "./scenes/SavedDishes";
import { ScalingARecipe } from "./scenes/ScalingARecipe";
import { ServiceSheets } from "./scenes/ServiceSheets";
import { SignIn } from "./scenes/SignIn";
import { SocialGraphics } from "./scenes/SocialGraphics";
import { ThisWeek } from "./scenes/ThisWeek";
import { ThreeLevelMenu } from "./scenes/ThreeLevelMenu";
import { TodayScreen } from "./scenes/TodayScreen";
import { TrainingMode } from "./scenes/TrainingMode";
import { WeekTotals } from "./scenes/WeekTotals";

// The full tour: six chapters, 35 feature slides, a title card opening each
// chapter. Durations are inline so they can be trimmed in the Studio timeline.
// Each transition overlaps its two neighbours, so the composition is
// 600 frames shorter than the 41 durations added up:
// 10090 - 40 * 15 = 9490. Change a duration here and the
// total in Root.tsx, and the fade-out below, have to move with it.
export const Overview: React.FC = () => {
  return (
    <>
      <Audio
        name="Backing track"
        src={staticFile("music/lofi-jazz.mp3")}
        durationInFrames={9490}
        volume={(f) =>
          interpolate(f, [0, 40, 9420, 9489], [0, 0.65, 0.65, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={210} name="Opening">
          <Opening />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={90} name="Chapter 01">
          <ChapterCard
            number="01"
            title="For customers"
            line="What the person ordering sees."
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence
          durationInFrames={250}
          name="Installs like an app"
        >
          <InstallsLikeAnApp />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={280} name="Ordering a day">
          <OrderingADay />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={265} name="The cutoff">
          <Cutoff />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={285} name="Delivery area">
          <DeliveryArea />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={260} name="Pickup window">
          <PickupWindow />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={90} name="Chapter 02">
          <ChapterCard
            number="02"
            title="Building the week"
            line="How the menu gets made."
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence
          durationInFrames={265}
          name="Three level menu"
        >
          <ThreeLevelMenu />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={290} name="This week">
          <ThisWeek />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={295} name="Paste the post">
          <PasteThePost />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence
          durationInFrames={265}
          name="Meatless Monday"
        >
          <MeatlessMonday />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={275} name="Other options">
          <OtherOptions />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence
          durationInFrames={285}
          name="How many to cook"
        >
          <HowManyToCook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={255} name="Closing a day">
          <ClosingADay />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={285} name="Saved dishes">
          <SavedDishes />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={265} name="Menu history">
          <MenuHistory />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={90} name="Chapter 03">
          <ChapterCard
            number="03"
            title="Getting it right"
            line="The checks between a draft and a customer."
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={310} name="Allergen gate">
          <AllergenGate />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence
          durationInFrames={285}
          name="Allergen dictionary"
        >
          <AllergenDictionary />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={255} name="Proofreader">
          <Proofreader />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={280} name="Publishing">
          <RunTheWeek />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={90} name="Chapter 04">
          <ChapterCard
            number="04"
            title="The kitchen"
            line="Cooking, counting, and paper."
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={315} name="Recipe index">
          <RecipeIndex />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence
          durationInFrames={295}
          name="Scaling a recipe"
        >
          <ScalingARecipe />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={275} name="Today screen">
          <TodayScreen />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={290} name="Orders screen">
          <OrdersScreen />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={280} name="Service sheets">
          <ServiceSheets />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={285} name="Week totals">
          <WeekTotals />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={90} name="Chapter 05">
          <ChapterCard
            number="05"
            title="Money & reach"
            line="Getting paid, and getting seen."
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={290} name="Payments">
          <Payments />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={265} name="Emails">
          <Emails />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence
          durationInFrames={265}
          name="Social graphics"
        >
          <SocialGraphics />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence
          durationInFrames={270}
          name="Card sticker and QR"
        >
          <CardStickerQr />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence
          durationInFrames={275}
          name="Facebook publishing"
        >
          <FacebookPublishing />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={90} name="Chapter 06">
          <ChapterCard
            number="06"
            title="Running it"
            line="Keeping it safe, and teaching it."
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={290} name="Sign in">
          <SignIn />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence
          durationInFrames={260}
          name="Backup and restore"
        >
          <BackupRestore />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence
          durationInFrames={250}
          name="Admin home screen"
        >
          <AdminHomeScreen />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={255} name="Training mode">
          <TrainingMode />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={230} name="Closing">
          <Closing />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </>
  );
};
