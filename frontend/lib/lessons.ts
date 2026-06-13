export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  summary: string;
  body: string[];
}

// Starter beginner curriculum (static for v1; moves to the backend + RAG later).
export const LESSONS: Lesson[] = [
  {
    id: "what-is-trading",
    title: "What is trading, really?",
    minutes: 3,
    summary: "The simplest possible explanation — no jargon.",
    body: [
      "Trading just means buying something hoping to sell it later for more than you paid (or selling first if you think it'll get cheaper).",
      "In this app you'll trade crypto like Bitcoin using practice money — real prices, fake cash. Nothing here can cost you a cent.",
      "The goal isn't to get rich today. It's to build judgement: noticing what moves prices, and learning to manage risk so one bad call never wipes you out.",
      "Rule of thumb you'll hear a lot: amateurs think about how much they can make; professionals think first about how much they could lose.",
    ],
  },
  {
    id: "reading-a-chart",
    title: "How to read a price chart",
    minutes: 4,
    summary: "Candles, up and down, and what they tell you.",
    body: [
      "A price chart shows how the price changed over time. Each 'candle' is one slice of time (say, one minute).",
      "A green candle means the price finished that minute higher than it started; red means it finished lower. The thin wicks show the highest and lowest points reached.",
      "You're not trying to predict the future precisely — you're reading the mood: is price drifting up, down, or going sideways?",
      "Open the Trade screen and just watch Bitcoin's chart for a minute. Notice how it never sits still. That constant motion is the market.",
    ],
  },
  {
    id: "order-types",
    title: "Buying and selling: order types",
    minutes: 4,
    summary: "Market vs limit, in plain English.",
    body: [
      "A 'market' order means: buy (or sell) right now at whatever the current price is. Simple and instant — that's what the Trade screen uses by default.",
      "A 'limit' order means: only buy if the price drops to the level I choose (or only sell if it rises to my level). It waits patiently until your price is hit.",
      "Beginners should start with small market orders to get a feel for it. You'll learn limit orders once you're comfortable.",
      "Every order you place here also gets checked by your built-in risk manager — it'll stop you from betting too much on a single coin.",
    ],
  },
  {
    id: "risk-management",
    title: "The most important lesson: risk",
    minutes: 5,
    summary: "How to not blow up your account.",
    body: [
      "Most people lose money trading not because they pick wrong, but because they bet too big and can't survive a normal losing streak.",
      "A classic guideline: never risk more than 1–2% of your account on a single trade going wrong. That way you can be wrong many times in a row and still be fine.",
      "Position sizing matters more than being right. A great call with too much money on it can still ruin you if it turns.",
      "Trade-Assist enforces a 25% cap per coin and won't let you go 'all in' — that's a guardrail, not a limit on your learning. As you progress, you'll feel why it's there.",
      "Whenever you're unsure, ask your Coach: 'is this a sensible size?' That's exactly what it's here for.",
    ],
  },
];

export function getLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
