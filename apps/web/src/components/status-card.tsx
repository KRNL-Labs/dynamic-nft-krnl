type Props = {
  title: string;
  value: string | number;
  hint?: string;
};

export default function StatusCard({ title, value, hint }: Props) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
