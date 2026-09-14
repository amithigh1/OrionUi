# survey

`<o-survey>` (multi-page JSON surveys), `<o-poll>` (single-question poll with result bars),
`Orion.feedback()` (a floating feedback launcher) and `<o-reviews>` (rating summary + review list + write-a-
review form). Depends on `validation` (per-question rules/required) and `conditional` (skip logic). Docs:
`docs/components/survey-poll.html` and `docs/components/feedback-reviews.html`.

## Files

| File | Contents |
|---|---|
| `10-survey.js` | `<o-survey>`, `Orion.survey()`, `Orion.survey.summarize()` |
| `20-poll.js` | `<o-poll>`, `Orion.polls()` |
| `30-feedback.js` | `Orion.feedback()` |
| `40-reviews.js` | `<o-reviews>` |
| `survey.css` | All four widgets' styling |

## `<o-survey>`

```ts
interface SurveySchema {
  title?: string; description?: string; progress?: boolean;         // progress default true
  pages?: SurveyPage[];                     // or a flat top-level `questions` (treated as one page)
  questions?: SurveyQuestion[];
  thankYou?: { title?: string; description?: string } | ((answers: object) => string);
  nextText?: string; backText?: string; submitText?: string;
}
interface SurveyPage { id?: string; title?: string; description?: string; showIf?: Cond; skipIf?: Cond; questions: SurveyQuestion[]; }
interface SurveyQuestion {
  id: string;
  type: 'single' | 'multiple' | 'text' | 'longtext' | 'rating' | 'nps' | 'emoji' | 'matrix' | 'likert' | 'dropdown' | 'ranking' | 'date';
  label?: string; help?: string; required?: boolean; placeholder?: string; default?: any;
  rules?: string;                            // extra Orion.validate rule string (text/longtext/date)
  options?: (string | { value: string; label?: string; goTo?: string | number })[];   // single/multiple/dropdown/ranking; goTo branches to a page id/index
  rows?: (string | { value; label })[]; columns?: (string | { value; label })[];       // matrix / likert
  scale?: number;                            // rating (default 5) / emoji (default 5) point count
  labels?: { low?: string; high?: string };   // end captions for rating / nps / emoji
  showIf?: Cond; skipIf?: Cond;                // per-question skip logic (same shape as the conditional package)
}
class OSurvey extends OElement {
  schema: SurveySchema; texts?: Record<string, string>;
  readonly page: number; readonly pages: number;
  getAnswers(): Record<string, any>; setAnswers(answers: object): void;
  next(): Promise<boolean>; prev(): boolean; goToPage(idOrIndex: string | number): boolean;
  finish(): Promise<boolean>; reset(): void;
}
function survey(target: Element | string, schema?: SurveySchema, opts?: { onComplete?(answers, event) }): OSurvey;
survey.summarize(schema: SurveySchema, responses: object[]): Record<string, {
  type: string; total: number;
  counts?: { value, label, count, pct }[]; nps?: number; average?: number;      // choice / nps / rating / emoji / dropdown
  rows?: { value, label, total, counts: { value, label, count }[] }[];          // matrix / likert
  options?: { value, label, score }[];                                         // ranking (Borda count, best first)
  responses?: any[];                                                            // text / longtext (raw values only)
}>;
```

Events: `o-page-change { index, page }`, `o-answer { id, value, answers }`, `o-complete { answers }`.

Question visibility (`showIf`/`skipIf`) compiles to `data-o-show-if`/`data-o-hide-if` on the question's
wrapper (same engine as the `conditional` package — hidden questions are disabled and excluded from
answers/validation); page-level `showIf`/`skipIf` is evaluated in JS against the answers collected so far to
decide whether `next()` lands on that page at all. `required` is enforced with `Orion.validate` for every
question type except `matrix` (every row must be answered — checked separately) and `ranking` (always has a
value, since it starts fully ordered).

Keyboard: every question is a native input/radiogroup/checkbox-group, so normal form keyboard behavior
applies; `Enter` in a text field advances the page. Ranking rows have Up/Down buttons and also respond to
`ArrowUp`/`ArrowDown` while their drag handle is focused.

## `<o-poll>`

```ts
class OPoll extends OElement {
  question?: string; options: (string | { value; label })[];
  multiple: boolean; maxChoices: number;              // default Infinity
  name?: string;                                       // storage/identity key
  votes: Record<string, number>;                        // seed / server-authoritative counts
  persist: boolean;                                     // default true — localStorage remembers this browser's vote
  allowRevote: boolean; resultsOnly: boolean;            // resultsOnly: always show bars, no voting UI
  texts?: Record<string, string>;

  vote(value: string | string[]): boolean;
  getResults(): { value, label, count, pct }[];
  hasVoted(): boolean; changeVote(): void; reset(): void;
}
function polls(target: Element | string, opts?: object): OPoll;   // note: `Orion.poll` is the realtime package's helper
```

Events: `o-vote { value, results }`, `o-results { results }`.

## `Orion.feedback(options)`

```ts
function feedback(opts?: {
  id?: string;                        // omit to replace the single default launcher on repeat calls
  position?: 'bottom-end' | 'bottom-start' | 'top-end' | 'top-start';   // default 'bottom-end'
  categories?: string[]; buttonText?: string;
  onSubmit?(data: { rating: number | null; category: string | null; message: string; url; userAgent; viewport; timestamp }): Promise<void>;
}): { open(): void; close(): void; destroy(): void };
```

A fixed-corner launcher button opens a small floating panel (star rating + optional category chips +
message) built on the core overlay/floating-position primitives (`overlays.open`, `autoPlace`, `portal`) —
Escape/outside-click/focus-trap all come for free. Shows a success state and auto-closes after submit.

## `<o-reviews>`

```ts
interface Review { id?: string; author?: string; avatar?: string; rating: number; title?: string; body: string;
  date?: string | Date; verified?: boolean; helpful?: number; unhelpful?: number; response?: string; }
class OReviews extends OElement {
  reviews: Review[]; summary: boolean;                 // default true — average + 5-row histogram
  allowWrite: boolean; sort: 'recent' | 'helpful' | 'highest' | 'lowest'; filterStars: number | null;
  name?: string;                                        // storage key so "helpful" votes aren't counted twice per browser
  texts?: Record<string, string>;

  addReview(review: Partial<Review>): Review; getReviews(): Review[]; setReviews(list: Review[]): void;
  voteHelpful(id: string, helpful: boolean): boolean;
}
```

Events: `o-review { review }` (a visitor submitted the write-a-review form), `o-vote-helpful { id, helpful }`.
