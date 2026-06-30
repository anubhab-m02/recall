// A single detected secret span within a piece of text.
export interface Finding {
  rule: string;
  index: number;
  length: number;
  match: string;
}

export interface Rule {
  name: string;
  // Returns all matches of this rule in `text`, independent of other rules.
  detect: (text: string) => Finding[];
}
