"use client";

import Link from "next/link";
import { ExternalLink, PlayCircle } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { companyColor, companyOnColor } from "@/lib/intranet";
import { plural } from "@/lib/i18n/dictionaries";
import { fmt } from "@/lib/i18n/locale";
import { activeBlocks, videoEmbed, type BlockKey, type Playbook } from "@/lib/playbooks";
import { useSignedUrls } from "@/components/playbooks/useSignedUrls";

export type PlaybookBody = Pick<Playbook, "kind" | "company_id" | "body" | "steps"> &
  Partial<Pick<Playbook, "template" | "sections" | "roles" | "definitions" | "resources" | "video_url">>;

const card = "rounded-2xl border border-gray-200 bg-white p-6 shadow-sm";
const heading = "mb-3 text-xs font-black uppercase tracking-widest text-gray-400";

/** The readable part of a playbook: purpose, template sections, roles, steps, definitions, video and resources. */
export default function PlaybookContent({ p, names }: { p: PlaybookBody; names: Record<string, string> }) {
  const { t } = useI18n();
  const s = t.sop;
  const urls = useSignedUrls(p.steps.flatMap(x => x.images ?? []));
  const color = companyColor(p.company_id);
  const onColor = companyOnColor(p.company_id);
  const blocks = new Set(activeBlocks(p));
  const structured = Boolean(p.template) || blocks.size > 0;
  const has = (b: BlockKey) => blocks.has(b);
  const text = (k: "scope" | "prerequisites" | "escalation" | "controls" | "completion") => {
    const v = p.sections?.[k]?.trim();
    return v ? (
      <section key={k} className={card}>
        <h2 className={heading}>{s.blocks[k]}</h2>
        <p className="whitespace-pre-line text-[15px] leading-7 text-gray-800">{v}</p>
      </section>
    ) : null;
  };
  const embed = videoEmbed(p.video_url);
  const stepsLabel = p.template === "policy" ? s.policyElements : structured ? s.procedure : plural(t.playbooks, "steps", p.steps.length);

  return (
    <>
      {p.body && (
        <section className={card}>
          {structured && <h2 className={heading}>{p.template === "policy" ? s.policyPurpose : s.purpose}</h2>}
          <p className="whitespace-pre-line text-[15px] leading-7 text-gray-800">{p.body}</p>
        </section>
      )}

      {has("video") && p.video_url && (
        <section className={card}>
          <h2 className={heading}>{s.blocks.video}</h2>
          {embed ? (
            <div className="aspect-video overflow-hidden rounded-xl bg-black">
              <iframe src={embed} title={s.blocks.video} className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
            </div>
          ) : (
            <a href={p.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white hover:bg-[#00704a]">
              <PlayCircle className="h-4 w-4" /> {s.openVideo}
            </a>
          )}
        </section>
      )}

      {text("scope")}
      {text("prerequisites")}

      {has("roles") && (p.roles?.length ?? 0) > 0 && (
        <section className={card}>
          <h2 className={heading}>{s.blocks.roles}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs font-bold text-gray-500">
                  <th className="py-2 pr-4">{s.role}</th>
                  <th className="py-2 pr-4">{s.rolePeople}</th>
                  <th className="py-2">{s.responsibility}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 align-top">
                {p.roles!.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2.5 pr-4 font-bold text-gray-900">{r.role}</td>
                    <td className="py-2.5 pr-4">
                      <span className="flex flex-wrap gap-1">
                        {r.people.map(id => (
                          <Link key={id} href={`/people/${id}`} className="rounded-full bg-[#e6f6f0] px-2 py-0.5 text-xs font-bold text-[#00704a] hover:underline">
                            {names[id] ?? s.unknown}
                          </Link>
                        ))}
                      </span>
                    </td>
                    <td className="whitespace-pre-line py-2.5 text-gray-700">{r.responsibility}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {p.steps.length > 0 && (
        <section className={card}>
          <h2 className={`${heading} mb-4`}>{stepsLabel}</h2>
          <ol className="space-y-5">
            {p.steps.map((st, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black" style={{ background: color, color: onColor }}>{i + 1}</span>
                <div className="min-w-0 pt-1">
                  <p className="font-bold text-gray-900">{st.title}</p>
                  {st.body && <p className="mt-1 whitespace-pre-line text-sm leading-6 text-gray-700">{st.body}</p>}
                  {(st.images?.length ?? 0) > 0 && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {st.images!.map(path =>
                        urls[path] ? (
                          <a key={path} href={urls[path]} target="_blank" rel="noopener noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={urls[path]} alt={fmt(t.playbooks.imageAlt, { n: i + 1 })} className="max-h-80 w-auto max-w-full rounded-lg border border-gray-200" />
                          </a>
                        ) : (
                          <span key={path} className="block h-40 w-60 animate-pulse rounded-lg bg-gray-100" />
                        ),
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {text("escalation")}
      {text("controls")}
      {text("completion")}

      {has("definitions") && (p.definitions?.length ?? 0) > 0 && (
        <section className={card}>
          <h2 className={heading}>{s.blocks.definitions}</h2>
          <dl className="divide-y divide-gray-100 text-sm">
            {p.definitions!.map((d, i) => (
              <div key={i} className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-4">
                <dt className="font-bold text-gray-900">{d.term}</dt>
                <dd className="whitespace-pre-line text-gray-700">{d.definition}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {has("resources") && (p.resources?.length ?? 0) > 0 && (
        <section className={card}>
          <h2 className={heading}>{s.blocks.resources}</h2>
          <ul className="space-y-1.5">
            {p.resources!.map((r, i) => (
              <li key={i}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> {r.label || r.url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
