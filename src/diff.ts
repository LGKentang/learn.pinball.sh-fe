export type Seg = { type: 'same' | 'add' | 'del'; text: string };

/**
 * Word-level diff for the Learning Trail. Prose, not code — so the tokens are
 * words with their trailing whitespace, which keeps the output readable instead
 * of shredding sentences at every character.
 *
 * Common prefix and suffix are stripped first, so the quadratic table only ever
 * covers the part that actually changed; a typical edit reduces to a handful of
 * tokens even in a long answer.
 */
export function wordDiff(before: string, after: string): Seg[] {
  const a = tokenize(before);
  const b = tokenize(after);

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;

  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  const segs: Seg[] = [];
  const push = (type: Seg['type'], text: string) => {
    if (!text) return;
    const last = segs[segs.length - 1];
    if (last && last.type === type) last.text += text;
    else segs.push({ type, text });
  };

  push('same', a.slice(0, head).join(''));
  for (const s of lcsDiff(midA, midB)) push(s.type, s.text);
  push('same', a.slice(a.length - tail).join(''));

  return segs;
}

/** Words keep their trailing whitespace so joining segments reproduces the text. */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

function lcsDiff(a: string[], b: string[]): Seg[] {
  if (!a.length && !b.length) return [];
  if (!a.length) return [{ type: 'add', text: b.join('') }];
  if (!b.length) return [{ type: 'del', text: a.join('') }];

  // a full rewrite of a long answer is not worth diffing token by token
  if (a.length * b.length > 4_000_000) {
    return [
      { type: 'del', text: a.join('') },
      { type: 'add', text: b.join('') },
    ];
  }

  const n = a.length;
  const m = b.length;
  const table: Uint32Array = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[at(i, j)] =
        a[i] === b[j]
          ? table[at(i + 1, j + 1)] + 1
          : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
    }
  }

  const out: Seg[] = [];
  const push = (type: Seg['type'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', a[i]);
      i++;
      j++;
    } else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) {
      push('del', a[i++]);
    } else {
      push('add', b[j++]);
    }
  }
  while (i < n) push('del', a[i++]);
  while (j < m) push('add', b[j++]);

  return out;
}

/** How much of the answer actually moved, for a one-line summary. */
export function diffStats(segs: Seg[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const s of segs) {
    const words = s.text.trim() ? s.text.trim().split(/\s+/).length : 0;
    if (s.type === 'add') added += words;
    if (s.type === 'del') removed += words;
  }
  return { added, removed };
}
