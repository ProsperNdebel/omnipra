import type { ObservationBasis } from "./observation";

/**
 * Checks a note against the transcript it cites, without trusting the model. A note
 * that says someone said something must not contain figures or quotes that aren't in
 * what they said. If it does, it is downgraded to an inference, so it can never be
 * shown as something a person actually said.
 */
export function groundBasis(
  note: string,
  basis: ObservationBasis,
  cited: string[],
): { basis: ObservationBasis; unsupported: string[] } {
  if (basis === "inference") return { basis, unsupported: [] };
  const source = cited.join(" ");
  const unsupported = [
    ...missingNumbers(note, source),
    ...missingQuotes(note, source),
  ];
  return {
    basis: unsupported.length ? "inference" : basis,
    unsupported,
  };
}

// Numbers --------------------------------------------------------------------

const SCALE: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  trillion: 1e12,
};

/** Figures written with digits: "$40k", "3.5 million", "12%", "4,000". Not "Q3" or "GPT-4". */
const DIGITS =
  /(?<![\p{L}\p{N}.\-])(\d[\d,]*(?:\.\d+)?)\s*(k|mm|m|bn|b|thousand|million|billion|trillion)?(?![\p{L}\p{N}])/giu;

function digitValues(text: string): { raw: string; value: number }[] {
  const out: { raw: string; value: number }[] = [];
  for (const m of text.matchAll(DIGITS)) {
    const n = Number(m[1]!.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    out.push({
      raw: m[0].trim(),
      value: n * (SCALE[m[2]?.toLowerCase() ?? ""] ?? 1),
    });
  }
  return out;
}

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  a: 1,
  half: 0.5,
  dozen: 12,
};

/** Figures spoken as words: "forty two thousand", "three point five million", "a dozen". */
function wordValues(text: string): number[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, " ")
    .split(/[\s-]+/);
  const out: number[] = [];
  let total = 0;
  let current = 0;
  let decimal: string | null = null;
  let any = false;
  const flush = () => {
    if (any) out.push(total + current);
    total = current = 0;
    decimal = null;
    any = false;
  };
  for (const w of words) {
    if (w === "a") {
      // "a million" is one million; "half a million" stays a half.
      if (!any) current = 1;
    } else if (w in UNITS) {
      if (decimal !== null) {
        decimal += String(UNITS[w]);
        current = Number(`${Math.floor(current)}.${decimal}`);
      } else current += UNITS[w]!;
      any = true;
    } else if (w === "point" && any) {
      decimal = "";
    } else if (w === "hundred" && any) {
      current *= 100;
    } else if (w in SCALE && w.length > 2 && (any || current > 0)) {
      total += (current || 1) * SCALE[w]!;
      current = 0;
      any = true;
    } else if (w === "and" && any) {
      continue;
    } else {
      flush();
      continue;
    }
  }
  flush();
  return out;
}

const close = (a: number, b: number) =>
  a === b || Math.abs(a - b) <= Math.abs(b) * 0.01;

/** Figures in the note that the cited transcript never says, in digits or in words. */
export function missingNumbers(note: string, source: string): string[] {
  const said = [
    ...digitValues(source).map((d) => d.value),
    ...wordValues(source),
  ];
  // "$40k" and "40 thousand" and "40,000" are the same figure; so are 12% and 0.12.
  const has = (v: number) =>
    said.some((s) => close(s, v) || close(s, v * 100) || close(s * 100, v));
  return (
    digitValues(note)
      .filter((d) => !has(d.value))
      // Years and small counts are often paraphrase ("two founders" for "both"); only flag years and figures the model invented outright.
      .filter((d) => !(d.value <= 2 && Number.isInteger(d.value)))
      .map((d) => d.raw)
  );
}

// Quotes ---------------------------------------------------------------------

const QUOTED = /["“]([^"”]{12,})["”]/g;
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Quoted words in the note that aren't, word for word, in the cited transcript. */
export function missingQuotes(note: string, source: string): string[] {
  const said = ` ${norm(source)} `;
  return [...note.matchAll(QUOTED)]
    .map((m) => m[1]!)
    .filter((q) => !said.includes(` ${norm(q)} `));
}
