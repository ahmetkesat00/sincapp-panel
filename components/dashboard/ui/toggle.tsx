"use client";

type Props = {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
};

export default function Toggle({ checked, onChange, disabled = false }: Props) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`flex h-7 w-12 items-center rounded-full p-1 transition ${
        checked ? "bg-emerald-500" : "bg-slate-200"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}