"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CheckCircle2, ExternalLink, KeyRound, Loader2, Lock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { companyName, type CompanyId } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { embedUrl, type AttemptSummary, type HireAccount, type QuizResult, type TrainingModule, type TrainingQuestion } from "@/lib/onboarding";
import { KIND_ICON, type LinkRow } from "@/components/resources/ResourceList";

/** A training step: presentation (or department resources) → "I've gone through it" → quiz graded on the server. */
export default function ModuleView({ module: m, step, total, nextId, questions, best, links, accounts, access }: {
  module: TrainingModule;
  step: number;
  total: number;
  nextId: string | null;
  questions: TrainingQuestion[];
  best: AttemptSummary | null;
  links: LinkRow[];
  accounts: HireAccount[];
  access: string[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [quizOpen, setQuizOpen] = useState(!!best);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const src = embedUrl(m.content_kind, m.content_url);
  const scope = m.scope === "gmx" ? t.training.scope.gmx : m.scope === "brand" ? companyName(m.company_id as CompanyId) : deptName(t, m.department_id);

  const pick = (q: TrainingQuestion, i: number) =>
    setAnswers(a => {
      const cur = a[q.id] ?? [];
      return { ...a, [q.id]: q.multiple ? (cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i]) : [i] };
    });

  const submit = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    if (questions.some(q => !(answers[q.id]?.length))) return toast.error(t.training.answerAll);
    setBusy(true);
    const { data, error } = await supabase.rpc("submit_quiz", { module: m.id, answers });
    setBusy(false);
    if (error) return toast.error(error.message);
    setResult(data as QuizResult);
    router.refresh();
  };

  const byQuestion = new Map((result?.results ?? []).map(r => [r.question, r]));
  const passed = result?.passed ?? best?.passed ?? false;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/onboarding" className="text-sm font-bold text-[#00704a] hover:underline">{t.training.backToPath}</Link>
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-gray-400">{scope} · {fmt(t.training.stepOf, { n: step, total })}</p>
        <h1 className="text-2xl font-black text-gray-900">{m.title}</h1>
        {m.summary && <p className="text-gray-500">{m.summary}</p>}
      </div>

      {/* Presentation */}
      {src && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-black shadow-sm">
          <iframe src={src} title={m.title} className="aspect-video w-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
        </div>
      )}
      {m.content_url && (
        <a href={m.content_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline">
          <ExternalLink className="h-4 w-4" /> {t.training.open}
        </a>
      )}
      {m.body && <div className="whitespace-pre-line rounded-2xl border border-gray-200 bg-white p-6 text-[15px] leading-7 text-gray-800 shadow-sm">{m.body}</div>}

      {/* Department resources */}
      {m.content_kind === "resources" && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:col-span-2">
            <h2 className="mb-2 font-black text-gray-900">{t.training.importantLinks}</h2>
            {links.length === 0 ? (
              <p className="text-sm text-gray-500">{t.training.noLinks}</p>
            ) : (
              <ul className="grid gap-x-6 sm:grid-cols-2">
                {links.map(l => {
                  const Icon = KIND_ICON[l.kind] ?? ArrowUpRight;
                  return (
                    <li key={l.id}>
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2.5 py-2">
                        <Icon className="h-4 w-4 shrink-0 text-[#00704a]" />
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900 group-hover:text-[#00704a]">{l.title}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 flex items-center gap-2 font-black text-gray-900"><KeyRound className="h-4 w-4 text-gray-400" /> {t.training.yourAccounts}</h2>
            <p className="mb-2 text-xs text-gray-500">{t.training.accountsHint}</p>
            {accounts.length === 0 ? (
              <p className="text-sm text-gray-400">—</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {accounts.map(a => (
                  <li key={a.name} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-28 shrink-0 font-bold text-gray-900">{a.name}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-600">{a.login}</span>
                    {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-[#00704a] hover:underline">{t.onboarding.open}</a>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 font-black text-gray-900">{t.training.yourAccess}</h2>
            <ul className="flex flex-wrap gap-2">
              {access.map(d => (
                <li key={d}>
                  <Link href={`/departments/${d}`} className="rounded-full bg-[#e6f6f0] px-3 py-1 text-sm font-bold text-[#00704a] hover:underline">{deptName(t, d)}</Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {/* Quiz */}
      {!quizOpen ? (
        <div className="flex justify-end">
          <button type="button" onClick={() => (questions.length ? setQuizOpen(true) : submit())} disabled={busy}
            className="flex h-11 items-center gap-2 rounded-lg bg-[#009f67] px-5 text-sm font-bold text-white disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {questions.length ? t.training.watched : t.training.noQuiz}
          </button>
        </div>
      ) : questions.length > 0 ? (
        <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-black text-gray-900">{t.training.quiz}</h2>
            <span className="text-xs font-bold text-gray-400">{fmt(t.training.passMark, { n: m.pass_mark })}</span>
          </div>
          <ol className="space-y-5">
            {questions.map((q, qi) => {
              const r = byQuestion.get(q.id);
              return (
                <li key={q.id}>
                  <p className="font-bold text-gray-900">{qi + 1}. {q.question}</p>
                  {q.multiple && <p className="text-xs text-gray-400">{t.training.selectAll}</p>}
                  <div className="mt-2 space-y-1.5" role={q.multiple ? "group" : "radiogroup"}>
                    {q.options.map((o, i) => {
                      const on = (answers[q.id] ?? []).includes(i);
                      const isRight = r?.answer.includes(i);
                      return (
                        <button key={i} type="button" role={q.multiple ? "checkbox" : "radio"} aria-checked={on} disabled={!!result} onClick={() => pick(q, i)}
                          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                            result ? (isRight ? "border-[#009f67] bg-[#e6f6f0]" : on ? "border-red-300 bg-red-50" : "border-gray-200") : on ? "border-[#009f67] bg-[#f2fbf7]" : "border-gray-200 hover:bg-gray-50"
                          }`}>
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 ${q.multiple ? "rounded" : "rounded-full"} ${on ? "border-[#009f67] bg-[#009f67]" : "border-gray-300"}`}>
                            {on && <span className={`${q.multiple ? "h-2 w-2 rounded-sm" : "h-2 w-2 rounded-full"} bg-white`} />}
                          </span>
                          <span className="text-gray-800">{o}</span>
                        </button>
                      );
                    })}
                  </div>
                  {r && (
                    <p className={`mt-2 flex items-start gap-1.5 text-sm ${r.correct ? "text-[#00704a]" : "text-red-700"}`}>
                      {r.correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                      <span><b>{r.correct ? t.training.correct : t.training.wrong}.</b> {r.explanation}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          {result ? (
            <div className={`rounded-xl p-4 ${result.passed ? "bg-[#e6f6f0]" : "bg-amber-50"}`}>
              <p className="font-bold text-gray-900">{fmt(t.training.result, { right: result.right, total: result.total, score: result.score })}</p>
              <p className="text-sm text-gray-600">{result.passed ? t.training.passedMsg : t.training.failedMsg}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!result.passed && (
                  <button type="button" onClick={() => { setResult(null); setAnswers({}); }} className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-bold text-gray-800">
                    {t.training.retry}
                  </button>
                )}
                {result.passed && nextId && (
                  <Link href={`/onboarding/learn/${nextId}`} className="flex h-10 items-center rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white">{t.training.next}</Link>
                )}
                {result.passed && !nextId && (
                  <Link href="/onboarding" className="flex h-10 items-center rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white">{t.onboarding.allDone}</Link>
                )}
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <button type="button" onClick={submit} disabled={busy} className="flex h-11 items-center gap-2 rounded-lg bg-[#009f67] px-5 text-sm font-bold text-white disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.training.submit}
              </button>
            </div>
          )}
        </section>
      ) : (
        passed && (
          <p className="flex items-center gap-2 text-sm font-bold text-[#00704a]"><CheckCircle2 className="h-4 w-4" /> {t.training.done}</p>
        )
      )}
      {!passed && !result && best && !best.passed && quizOpen && (
        <p className="flex items-center gap-1.5 text-xs text-gray-400"><Lock className="h-3 w-3" /> {fmt(t.hires.failed, { score: best.best })}</p>
      )}
    </div>
  );
}
