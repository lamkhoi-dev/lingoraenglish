/** The "Use it in speaking" question for one word — built from the word's own
 * row on both sides: the page shows it, and analyseSpeaking rebuilds it from
 * the database (never trusting the client's copy) before scoring. */
export function vocabularySpeakingQuestion(word: string, exampleSentence: string): string {
  return `Answer this out loud: ${exampleSentence} Use the word "${word}" in your answer.`;
}
