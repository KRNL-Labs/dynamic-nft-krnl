type Props = {
  data: unknown;
};

export default function JsonViewer({ data }: Props) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-xs text-zinc-200">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
