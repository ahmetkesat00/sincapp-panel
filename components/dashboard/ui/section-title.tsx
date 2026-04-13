"use client";

type Props = {
  eyebrow: string;
  title: string;
  description: string;
};

export default function SectionTitle({
  eyebrow,
  title,
  description,
}: Props) {
  return (
    <div className="border-b border-slate-200 px-6 py-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        {description}
      </p>
    </div>
  );
}