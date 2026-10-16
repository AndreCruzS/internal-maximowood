"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Crop, ExternalLink, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { AVATAR_BUCKET, COVER_IDS, MAX_AVATAR_BYTES, MAX_PHOTO_PICK_BYTES, coverOf, normalizeLinkedIn } from "@/lib/profile";
import PhotoCropper from "@/components/PhotoCropper";
import { Photo, colorOf } from "@/components/people/shared";
import type { Person } from "@/components/PeopleView";

const field = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#009f67]";
const label = "mb-1 block text-xs font-bold text-gray-500";

/** Tags typed one by one (Enter or comma). */
function TagInput({ id, value, onChange, placeholder }: { id: string; value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const add = () => {
    const v = text.trim();
    if (v && !value.some(x => x.toLowerCase() === v.toLowerCase())) onChange([...value, v].slice(0, 15));
    setText("");
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-300 bg-white p-1.5 focus-within:border-[#009f67]">
      {value.map(s => (
        <span key={s} className="flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-sm font-bold text-sky-800">
          {s}
          <button type="button" onClick={() => onChange(value.filter(x => x !== s))} aria-label={`${t.common.delete} ${s}`}><X className="h-3 w-3" /></button>
        </span>
      ))}
      <input id={id} value={text} onChange={e => setText(e.target.value)} onBlur={add} placeholder={placeholder}
        onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        className="min-w-40 flex-1 px-1 text-sm outline-none" />
    </div>
  );
}

/** Your profile page, edited in place: cover, photo, nickname, headline, pronouns, bio, interests, fun fact, LinkedIn. */
export default function ProfileEditor({ person: p, department }: { person: Person; department: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [d, setD] = useState({
    nickname: p.nickname ?? "",
    headline: p.headline ?? "",
    pronouns: p.pronouns ?? "",
    bio: p.bio ?? "",
    interests: p.interests ?? [],
    fun_fact: p.fun_fact ?? "",
    cover: p.cover ?? "brands",
    linkedin: p.linkedin ?? "",
  });
  const [photo, setPhoto] = useState(p.photo_url);
  const brands = [p.company_id, ...(p.companies ?? [])];
  const [busy, setBusy] = useState<"save" | "photo" | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD(x => ({ ...x, [k]: v }));

  const removeOld = async (url: string | null) => {
    const supabase = getSupabase();
    if (supabase && url?.startsWith("/avatars/")) await supabase.storage.from(AVATAR_BUCKET).remove([url.slice("/avatars/".length)]);
  };

  const closeCrop = () => setCropSrc(src => { if (src) URL.revokeObjectURL(src); return null; });

  /** A picked file opens the cropper first. */
  const pick = (file: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast.error(t.me.photoType);
    if (file.size > MAX_PHOTO_PICK_BYTES) return toast.error(t.me.photoSize);
    setCropSrc(URL.createObjectURL(file));
  };

  /** Re-crop the current photo. */
  const adjust = async () => {
    const supabase = getSupabase();
    if (!supabase || !photo?.startsWith("/avatars/")) return;
    setBusy("photo");
    const { data, error } = await supabase.storage.from(AVATAR_BUCKET).download(photo.slice("/avatars/".length));
    setBusy(null);
    if (error || !data) return toast.error(t.me.photoLoadError);
    setCropSrc(URL.createObjectURL(data));
  };

  const upload = async (blob: Blob) => {
    const supabase = getSupabase();
    if (!supabase) return;
    if (blob.size > MAX_AVATAR_BYTES) return void toast.error(t.me.photoSize);
    setBusy("photo");
    const path = `${p.id}/${Date.now()}.jpg`;
    const up = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
    if (up.error) { setBusy(null); return void toast.error(up.error.message); }
    const { error } = await supabase.from("people").update({ photo_url: `/avatars/${path}` }).eq("id", p.id);
    setBusy(null);
    if (error) return void toast.error(error.message);
    await removeOld(photo);
    setPhoto(`/avatars/${path}`);
    closeCrop();
    toast.success(t.me.photoSaved);
    router.refresh();
  };

  const removePhoto = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("people").update({ photo_url: null }).eq("id", p.id);
    if (error) return toast.error(error.message);
    await removeOld(photo);
    setPhoto(null);
    router.refresh();
  };

  const save = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const linkedin = normalizeLinkedIn(d.linkedin);
    if (d.linkedin.trim() && !linkedin) return toast.error(t.me.linkedinInvalid);
    setBusy("save");
    const { error } = await supabase
      .from("people")
      .update({ nickname: d.nickname.trim(), headline: d.headline.trim(), pronouns: d.pronouns.trim(), bio: d.bio.trim(), interests: d.interests, fun_fact: d.fun_fact.trim(), cover: d.cover, linkedin })
      .eq("id", p.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(t.about.saved);
    router.refresh();
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* Live preview */}
      <div className="relative h-32 sm:h-40" style={{ background: coverOf(d.cover, brands) }}>
        <div className="absolute bottom-3 right-3 flex gap-1.5 rounded-full bg-black/25 p-1.5" role="radiogroup" aria-label={t.me.cover}>
          {COVER_IDS.map(c => (
            <button key={c} type="button" role="radio" aria-checked={d.cover === c} aria-label={c} onClick={() => set("cover", c)}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white" style={{ background: coverOf(c, brands) }}>
              {d.cover === c && <Check className="h-3.5 w-3.5 text-white" />}
            </button>
          ))}
        </div>
      </div>
      <div className="px-6 pb-6">
        <div className="-mt-12 flex flex-wrap items-end justify-between gap-3">
          <div className="relative z-10">
            <Photo person={{ full_name: p.full_name, photo_url: photo }} size={96} color={colorOf(department)} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === "photo"} aria-label={t.me.changePhoto}
              className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-gray-900 text-white shadow hover:bg-gray-700">
              {busy === "photo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pick(f); }} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === "photo"}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-800 hover:border-[#009f67] hover:text-[#00704a] disabled:opacity-50">
              {busy === "photo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} {t.me.changePhoto}
            </button>
            {photo?.startsWith("/avatars/") && (
              <button type="button" onClick={adjust} disabled={busy === "photo"}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-800 hover:border-[#009f67] hover:text-[#00704a] disabled:opacity-50">
                <Crop className="h-4 w-4" /> {t.me.adjustPhoto}
              </button>
            )}
            {photo && (
              <button type="button" onClick={removePhoto} className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4" /> {t.me.removePhoto}
              </button>
            )}
            <Link href={`/people/${p.id}`} className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-800 hover:bg-gray-50">
              <ExternalLink className="h-4 w-4" /> {t.me.viewProfile}
            </Link>
          </div>
        </div>
        <p className="mt-3 text-xl font-black text-gray-900">
          {p.full_name}
          {d.nickname.trim() && <span className="ml-2 font-normal text-gray-500">“{d.nickname.trim()}”</span>}
          {d.pronouns.trim() && <span className="ml-2 text-sm font-bold text-gray-400">({d.pronouns.trim()})</span>}
        </p>
        <p className="text-gray-600">{d.headline.trim() || <span className="text-gray-400">{t.me.headlinePlaceholder}</span>}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-[200px_1fr_200px]">
          <div>
            <label className={label} htmlFor="me-nickname">{t.welcome.nickname}</label>
            <input id="me-nickname" maxLength={40} value={d.nickname} onChange={e => set("nickname", e.target.value)} placeholder={t.welcome.nicknameHint} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="me-headline">{t.me.headline}</label>
            <input id="me-headline" maxLength={120} value={d.headline} onChange={e => set("headline", e.target.value)} placeholder={t.me.headlinePlaceholder} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="me-pronouns">{t.me.pronouns}</label>
            <input id="me-pronouns" maxLength={40} value={d.pronouns} onChange={e => set("pronouns", e.target.value)} placeholder={t.me.pronounsPlaceholder} className={field} />
          </div>
        </div>
        <div className="mt-4">
          <label className={label} htmlFor="me-bio">{t.me.about}</label>
          <textarea id="me-bio" rows={5} maxLength={2000} value={d.bio} onChange={e => set("bio", e.target.value)} placeholder={t.me.bioPlaceholder}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#009f67]" />
          <p className="text-right text-[11px] text-gray-400">{fmt(t.me.chars, { n: d.bio.length, max: 2000 })}</p>
        </div>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="me-interests">{t.me.interests}</label>
            <TagInput id="me-interests" value={d.interests} onChange={v => set("interests", v)} placeholder={t.me.interestsPlaceholder} />
          </div>
          <div>
            <label className={label} htmlFor="me-fun">{t.me.funFact}</label>
            <input id="me-fun" maxLength={300} value={d.fun_fact} onChange={e => set("fun_fact", e.target.value)} placeholder={t.me.funFactPlaceholder} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="me-linkedin">LinkedIn</label>
            <input id="me-linkedin" value={d.linkedin} onChange={e => set("linkedin", e.target.value)} placeholder="linkedin.com/in/…" className={field} />
          </div>
        </div>
        <div className="mt-5 flex justify-end border-t border-gray-100 pt-4">
          <button type="button" onClick={save} disabled={busy === "save"} className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-5 text-sm font-bold text-white disabled:opacity-50">
            {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />} {t.common.save}
          </button>
        </div>
      </div>
      {cropSrc && <PhotoCropper src={cropSrc} onCancel={closeCrop} onSave={upload} />}
    </section>
  );
}
