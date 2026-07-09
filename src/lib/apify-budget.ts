import { adminDb } from "@/lib/firebase-admin";

// Shared Apify spend limiter — one budget per constituency covering EVERY
// Apify-backed feature (social tracker, opposition tracker). Sized against
// $5/month/constituency at ~$0.40 per 1,000 scraped posts.
//
// Worst case: 90 runs/month × 5 accounts × 20 posts = 9,000 posts ≈
// $3.60/month, leaving headroom under the cap.
export const APIFY_MAX_RUNS_PER_DAY = 6;
export const APIFY_MAX_RUNS_PER_MONTH = 90;

const USAGE_COLLECTION = "social_usage";

export interface ApifyBudgetLimits {
  runsToday: number;
  maxRunsPerDay: number;
  runsThisMonth: number;
  maxRunsPerMonth: number;
}

interface UsageDoc {
  month: string; // YYYY-MM — counters reset when the month rolls over
  runs: number;
  posts: number;
  days: Record<string, number>; // YYYY-MM-DD → runs that day
}

const monthKey = () => new Date().toISOString().slice(0, 7);
const dayKey = () => new Date().toISOString().slice(0, 10);

/**
 * Check the constituency's Apify budget and, if within limits, consume one
 * run (counted BEFORE the Apify call — a crash mid-run still spends budget,
 * which is the safe direction for a hard cap). Returns whether the run may
 * proceed plus the post-consumption counters.
 */
export async function consumeApifyRun(
  slug: string,
  postsEstimate: number
): Promise<{ allowed: boolean; limits: ApifyBudgetLimits }> {
  const ref = adminDb().collection(USAGE_COLLECTION).doc(slug);
  const snap = await ref.get();

  let usage = (snap.data() as UsageDoc | undefined) ?? {
    month: monthKey(),
    runs: 0,
    posts: 0,
    days: {},
  };
  if (usage.month !== monthKey()) {
    usage = { month: monthKey(), runs: 0, posts: 0, days: {} };
  }
  const runsToday = usage.days[dayKey()] ?? 0;

  const allowed =
    runsToday < APIFY_MAX_RUNS_PER_DAY && usage.runs < APIFY_MAX_RUNS_PER_MONTH;

  if (allowed) {
    usage.runs += 1;
    usage.days[dayKey()] = runsToday + 1;
    usage.posts += postsEstimate;
    await ref.set(usage);
  }

  return {
    allowed,
    limits: {
      runsToday: allowed ? runsToday + 1 : runsToday,
      maxRunsPerDay: APIFY_MAX_RUNS_PER_DAY,
      runsThisMonth: usage.runs,
      maxRunsPerMonth: APIFY_MAX_RUNS_PER_MONTH,
    },
  };
}
