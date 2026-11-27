// Listening to a list of words in a row ("play the hard words"): timing only, no UI.

/** Hangul syllables in a text (other characters do not take speaking time worth counting). */
function syllables(text: string): number {
  return [...text].filter((c) => c >= '가' && c <= '힣').length;
}

/**
 * How long to wait after a word starts playing before the next one: the word itself
 * (about 0.28 s per syllable at normal speed, slower speech takes longer) plus a pause
 * to repeat it to yourself.
 */
export function listenGapMs(text: string, rate: number, pauseMs = 1800): number {
  const speaking = (450 + 280 * Math.max(1, syllables(text))) / Math.max(0.5, rate);
  return Math.round(speaking + pauseMs);
}
