export const STATES = [
  'unexplored',
  'exploring',
  'understood',
  'can_explain',
  'verified',
] as const;
export type State = (typeof STATES)[number];

export const STATE_LABEL: Record<State, string> = {
  unexplored: 'Unexplored',
  exploring: 'Exploring',
  understood: 'Understood',
  can_explain: 'Can Explain',
  verified: 'Verified',
};

export const RELATION_KINDS = ['related_to', 'depends_on', 'contradicts', 'example_of'] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];

export const RELATION_LABEL: Record<RelationKind, string> = {
  related_to: 'relates to',
  depends_on: 'depends on',
  contradicts: 'contradicts',
  example_of: 'is an example of',
};

export const RATINGS = ['didnt_know', 'partially_knew', 'knew_it', 'could_explain_deeply'] as const;
export type Rating = (typeof RATINGS)[number];

export const RATING_LABEL: Record<Rating, string> = {
  didnt_know: "Didn't Know",
  partially_knew: 'Partially Knew',
  knew_it: 'Knew It',
  could_explain_deeply: 'Could Explain Deeply',
};

export type RevisionKind =
  | 'initial'
  | 'refinement'
  | 'misconception_corrected'
  | 'merged_from_child'
  | 'post_drill';

export const REVISION_LABEL: Record<RevisionKind, string> = {
  initial: 'first attempt',
  refinement: 'refined',
  misconception_corrected: 'misconception corrected',
  merged_from_child: 'merged from a subquestion',
  post_drill: 'revised after a drill',
};

export interface Book {
  id: string;
  title: string;
  intent: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface BookSummary extends Book {
  question_count: number;
  open_count: number;
}

export interface Question {
  id: string;
  book_id: string;
  parent_id: string | null;
  title: string;
  understanding: string | null;
  state: State;
  position: number;
  parked_at: string | null;
  park_reason: string | null;
  next_review_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TreeNode extends Question {
  depth: number;
}

export interface Revision {
  id: string;
  question_id: string;
  understanding_before: string | null;
  understanding_after: string | null;
  kind: RevisionKind;
  note: string | null;
  triggered_by_question_id: string | null;
  triggered_by_title: string | null;
  created_at: string;
}

export interface Related {
  relation_id: string;
  kind: RelationKind;
  direction: 'out' | 'in';
  note: string | null;
  id: string;
  title: string;
  state: State;
  book_id: string;
  book_title: string;
}

export interface Stats {
  by_state: Partial<Record<State, number>>;
  parked: number;
  due: number;
  total: number;
}

export interface Edge {
  from_id: string;
  to_id: string;
  kind: RelationKind;
  note: string | null;
  from_title: string;
  from_book_id: string;
  from_book_title: string;
  to_title: string;
  to_book_id: string;
  to_book_title: string;
  crosses: number;
}

export interface BookDetail {
  book: Book;
  tree: TreeNode[];
  edges: Edge[];
  stats: Stats;
}

export interface IndexedQuestion {
  id: string;
  title: string;
  state: State;
  book_id: string;
  book_title: string;
}

export interface QuestionDetail {
  question: Question;
  book: Book;
  ancestors: { id: string; title: string; state: State }[];
  children: Question[];
  relations: Related[];
  revisions: Revision[];
  sources: { id: string; kind: string; title: string; locator: string | null; excerpt: string | null }[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `request failed (${res.status})`);
  return body as T;
}

const post = <T,>(path: string, body?: unknown) =>
  req<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

/** Raw bytes with the image's own content-type — the clipboard gives us a Blob. */
export async function uploadImage(file: File | Blob): Promise<{ url: string; bytes: number }> {
  const res = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'content-type': file.type },
    body: file,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? 'upload failed');
  return body as { url: string; bytes: number };
}

export const api = {
  books: () => req<BookSummary[]>('/books'),
  book: (id: string) => req<BookDetail>(`/books/${id}`),
  createBook: (title: string, intent: string | null) =>
    post<Book>('/books', { title, intent }),
  updateBook: (id: string, patch: { title?: string; intent?: string | null }) =>
    req<Book>(`/books/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteBook: (id: string) => req<void>(`/books/${id}`, { method: 'DELETE' }),

  question: (id: string) => req<QuestionDetail>(`/questions/${id}`),
  questionIndex: () => req<IndexedQuestion[]>('/questions'),
  createQuestion: (input: { book_id: string; parent_id?: string | null; title: string }) =>
    post<Question>('/questions', input),
  patchQuestion: (
    id: string,
    patch: { title?: string; state?: State; parked?: boolean; park_reason?: string | null },
  ) => req<Question>(`/questions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteQuestion: (id: string) => req<void>(`/questions/${id}`, { method: 'DELETE' }),
  revise: (
    id: string,
    input: { understanding: string; kind?: RevisionKind; note?: string | null; triggered_by_question_id?: string | null },
  ) => post<{ question: Question; revision: Revision; linked: number }>(
    `/questions/${id}/understanding`,
    input,
  ),

  createRelation: (input: { from_id: string; to_id: string; kind: RelationKind; note?: string | null }) =>
    post<{ relations: Related[] }>('/relations', input),
  deleteRelation: (id: string) => req<void>(`/relations/${id}`, { method: 'DELETE' }),

  due: () => req<{ questions: (Question & { book_title: string })[] }>('/drill/due'),
  review: (id: string, rating: Rating, recalled: string | null) =>
    post<{ question: Question; state_before: State; state_after: State }>(`/drill/${id}/review`, {
      rating,
      recalled,
    }),
};
