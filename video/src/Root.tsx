import { Composition, Folder } from "remotion";
import "./index.css";
import "./fonts";
import { Brief } from "./Brief";
import { Launch } from "./Launch";
import { Overview } from "./Overview";
import { AdminHomeScreen } from "./scenes/AdminHomeScreen";
import { AllergenDictionary } from "./scenes/AllergenDictionary";
import { AllergenGate } from "./scenes/AllergenGate";
import { BackupRestore } from "./scenes/BackupRestore";
import { BriefSlide } from "./scenes/BriefSlide";
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
import { LaunchClosing } from "./scenes/launch/LaunchClosing";
import { LaunchLine } from "./scenes/launch/LaunchLine";
import { LaunchOpening } from "./scenes/launch/LaunchOpening";
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

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Overview"
        component={Overview}
        durationInFrames={9490}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Brief"
        component={Brief}
        durationInFrames={1380}
        fps={30}
        width={1920}
        height={1080}
      />
      {/* The customer-facing cut. Same component at two heights: the feed wants
          4:5, stories want 9:16, and both are 1080 wide so nothing rescales.
          See src/Launch.tsx and marketing/README.md. */}
      <Composition
        id="Launch"
        component={Launch}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1350}
      />
      <Composition
        id="LaunchStory"
        component={Launch}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
      />
      <Folder name="Launch">
        <Composition
          id="LaunchOpening"
          component={LaunchOpening}
          durationInFrames={84}
          fps={30}
          width={1080}
          height={1350}
        />
        <Composition
          id="LaunchLine"
          component={LaunchLine}
          durationInFrames={120}
          fps={30}
          width={1080}
          height={1350}
          defaultProps={{
            kicker: "What it is",
            title: "A small menu, cooked the day you collect it.",
            line: "Not a restaurant. Not a meal kit. One kitchen, a few days a week.",
            background: "#2C1E18",
            ink: "#F4EFEB",
            accent: "#EBC08C",
          }}
        />
        <Composition
          id="LaunchClosing"
          component={LaunchClosing}
          durationInFrames={108}
          fps={30}
          width={1080}
          height={1350}
        />
      </Folder>
      <Folder name="Scenes">
        <Composition
          id="ChapterCard"
          component={ChapterCard}
          durationInFrames={90}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{
            number: "01",
            title: "For customers",
            line: "What the person ordering sees.",
          }}
        />
        <Composition
          id="BriefSlide"
          component={BriefSlide}
          durationInFrames={180}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{
            title: "Customers pick a day and order.",
            line: "It installs to a home screen. No app store, no accounts.",
            background: "#5A6643",
            ink: "#F4EFEB",
            accent: "#EBC08C",
          }}
        />
        <Composition
          id="Opening"
          component={Opening}
          durationInFrames={210}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="InstallsLikeAnApp"
          component={InstallsLikeAnApp}
          durationInFrames={250}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="OrderingADay"
          component={OrderingADay}
          durationInFrames={280}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Cutoff"
          component={Cutoff}
          durationInFrames={265}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="DeliveryArea"
          component={DeliveryArea}
          durationInFrames={285}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="PickupWindow"
          component={PickupWindow}
          durationInFrames={260}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="ThreeLevelMenu"
          component={ThreeLevelMenu}
          durationInFrames={265}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="ThisWeek"
          component={ThisWeek}
          durationInFrames={290}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="PasteThePost"
          component={PasteThePost}
          durationInFrames={295}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="MeatlessMonday"
          component={MeatlessMonday}
          durationInFrames={265}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="OtherOptions"
          component={OtherOptions}
          durationInFrames={275}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="HowManyToCook"
          component={HowManyToCook}
          durationInFrames={285}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="ClosingADay"
          component={ClosingADay}
          durationInFrames={255}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="SavedDishes"
          component={SavedDishes}
          durationInFrames={285}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="MenuHistory"
          component={MenuHistory}
          durationInFrames={265}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="AllergenGate"
          component={AllergenGate}
          durationInFrames={310}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="AllergenDictionary"
          component={AllergenDictionary}
          durationInFrames={285}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Proofreader"
          component={Proofreader}
          durationInFrames={255}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="RunTheWeek"
          component={RunTheWeek}
          durationInFrames={280}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="RecipeIndex"
          component={RecipeIndex}
          durationInFrames={315}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="ScalingARecipe"
          component={ScalingARecipe}
          durationInFrames={295}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="TodayScreen"
          component={TodayScreen}
          durationInFrames={275}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="OrdersScreen"
          component={OrdersScreen}
          durationInFrames={290}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="ServiceSheets"
          component={ServiceSheets}
          durationInFrames={280}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="WeekTotals"
          component={WeekTotals}
          durationInFrames={285}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Payments"
          component={Payments}
          durationInFrames={290}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Emails"
          component={Emails}
          durationInFrames={265}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="SocialGraphics"
          component={SocialGraphics}
          durationInFrames={265}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="CardStickerQr"
          component={CardStickerQr}
          durationInFrames={270}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="FacebookPublishing"
          component={FacebookPublishing}
          durationInFrames={275}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="SignIn"
          component={SignIn}
          durationInFrames={290}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="BackupRestore"
          component={BackupRestore}
          durationInFrames={260}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="AdminHomeScreen"
          component={AdminHomeScreen}
          durationInFrames={250}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="TrainingMode"
          component={TrainingMode}
          durationInFrames={255}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Closing"
          component={Closing}
          durationInFrames={230}
          fps={30}
          width={1920}
          height={1080}
        />
      </Folder>
    </>
  );
};
