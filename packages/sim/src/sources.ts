/**
 * Evidence lines as the player reads them. The data cites the research docs of this repository
 * ("doc 07 section 4 (TCP agency factor about 20 percent)"), which is what a developer needs and what a
 * player cannot follow. playerSource keeps the fact in the parentheses and drops the citation around it.
 */

/** A citation: "doc 06 sections 3.3 and 7.5", "doc 07 E4", "doc 11", or a bare "section 7.5" continuing one. */
const SECTIONS = 'sections? [\\d.]*\\d(?:(?:,| and| to) [\\d.]*\\d)*';
const CITATION = new RegExp(`doc \\d+(?: ${SECTIONS}| [A-Z]\\d+)?|${SECTIONS}`, 'g');
const MARK = '\u0000';

/** Index of the parenthesis that closes the one at `open`, or -1. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * The same evidence line without citations of the research docs: "doc 07 E4 (SB 131); litigation trigger
 * probability x0.8" reads "SB 131; litigation trigger probability x0.8". Text with no citation comes back
 * unchanged. May return an empty string when the line was nothing but a citation.
 */
export function playerSource(text: string): string {
  if (!CITATION.test(text)) return text.trim();
  CITATION.lastIndex = 0;
  const marked = text.replace(CITATION, MARK);
  const parts: string[] = [];
  let rest = marked;
  while (rest.length > 0) {
    const at = rest.indexOf(MARK);
    if (at < 0) {
      parts.push(rest);
      break;
    }
    parts.push(rest.slice(0, at));
    rest = rest.slice(at + 1);
    // What a citation says is in the parentheses right after it.
    if (rest.startsWith(' (')) {
      const end = closing(rest, 1);
      if (end > 0) {
        parts.push(rest.slice(2, end));
        rest = rest.slice(end + 1);
      }
    }
  }
  let out = '';
  for (const raw of parts) {
    // Connectives left between two citations ("and", ";", ",") are not content.
    const piece = raw
      .replace(/^[\s;,.:]+/, '')
      .replace(/^and\b\s*/, '')
      .replace(/[\s;,:]+$/, '')
      .replace(/\s+and$/, '')
      .trim();
    if (piece === '' || piece === 'and') continue;
    if (out === '') out = piece;
    // A piece that followed a full stop starts a sentence; the rest are joined as a list.
    else if (/^\s*\./.test(raw)) out += /[.!?]$/.test(out) ? ` ${piece}` : `. ${piece}`;
    else out += /[.!?]$/.test(out) ? ` ${piece}` : `; ${piece}`;
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}
