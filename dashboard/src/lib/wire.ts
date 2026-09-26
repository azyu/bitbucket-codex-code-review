import type {
  ILatestReviewStats,
  IRecentReview,
  IRepoStatsOverview,
  IReviewPrompt,
  IReviewRunDetail,
} from "../../../src/review/review.types";
import type {
  ISettingsScopeDocument,
} from "../../../src/settings/runtime-settings.types";

/**
 * The server declares its timestamps as `Date`; JSON hands us ISO strings.
 * Mapping them at the fetch boundary keeps one declaration of every response
 * shape — the backend's — instead of a hand-written frontend copy that drifts
 * the first time a column is added.
 *
 * `[T] extends [...]` rather than `T extends ...` so a nullable field is not
 * distributed into a union of both branches.
 */
type Stringify<T> = [T] extends [Date]
  ? string
  : [T] extends [Date | null]
    ? string | null
    : T;

type Wire<T> = { -readonly [K in keyof T]: Stringify<T[K]> };

export type RecentReview = Wire<IRecentReview>;
export type LatestReviewStats = Wire<ILatestReviewStats>;
export type ReviewDetail = Wire<IReviewRunDetail>;
export type ReviewPrompt = Wire<IReviewPrompt>;
export type SettingsScope = Wire<ISettingsScopeDocument>;

/** Nested document fields are composed explicitly — `Wire` is shallow. */
export type RepoStats = Omit<Wire<IRepoStatsOverview>, "latestReview"> & {
  latestReview: LatestReviewStats | null;
};

export type SettingsDocument = {
  global: SettingsScope;
  repositories: SettingsScope[];
};
