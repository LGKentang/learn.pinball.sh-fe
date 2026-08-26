import { useEffect, useState } from 'react';
import { api, type IndexedQuestion } from './api';
import { Markdown } from './markdown';

let cache: IndexedQuestion[] | null = null;
const waiting: ((v: IndexedQuestion[]) => void)[] = [];

/** One shared question index, so a page full of notes does not refetch it each time. */
export function useQuestionIndex(refreshKey?: unknown) {
  const [index, setIndex] = useState<IndexedQuestion[]>(cache ?? []);
  useEffect(() => {
    let alive = true;
    if (cache && refreshKey === undefined) return;
    void api
      .questionIndex()
      .then((list) => {
        cache = list;
        waiting.splice(0).forEach((f) => f(list));
        if (alive) setIndex(list);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  return index;
}

export function invalidateQuestionIndex() {
  cache = null;
}

/**
 * Rendered markdown where [[links]] resolve against the question index.
 * A resolved link navigates; an unresolved one offers to create that question,
 * which is the cheapest possible path from "I noticed a gap" to "it is a question".
 */
export function Note({
  text,
  className,
  onNavigate,
  onCreate,
}: {
  text: string | null | undefined;
  className?: string;
  onNavigate?: (q: IndexedQuestion) => void;
  onCreate?: (title: string) => void;
}) {
  const index = useQuestionIndex();
  if (!text?.trim()) return null;

  return (
    <div className={className}>
      <Markdown
        text={text}
        renderWikiLink={({ target, label }) => {
          const hit = index.find((i) => i.title.toLowerCase() === target.toLowerCase());
          if (hit) {
            return (
              <button
                type="button"
                className="wikilink"
                title={`${hit.exploration_title} — go to this question`}
                onClick={() => onNavigate?.(hit)}
              >
                {label}
              </button>
            );
          }
          return (
            <button
              type="button"
              className="wikilink unresolved"
              title={onCreate ? 'Not a question yet — click to create it' : 'No such question yet'}
              onClick={() => onCreate?.(target)}
            >
              {label}
            </button>
          );
        }}
      />
    </div>
  );
}
