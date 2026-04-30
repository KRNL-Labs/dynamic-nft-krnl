import { ReactNode } from "react";

type Column<T> = {
  key: keyof T | string;
  header: string;
  render?: (row: T) => ReactNode;
};

type Props<T> = {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
};

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
}: Props<T>) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800">
      <table className="min-w-full divide-y divide-zinc-800 bg-zinc-950">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.header}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-900">
          {data.map((row, idx) => (
            <tr
              key={idx}
              onClick={() => onRowClick?.(row)}
              className={`transition ${
                onRowClick ? "cursor-pointer hover:bg-zinc-900" : ""
              }`}
            >
              {columns.map((col) => (
                <td key={col.header} className="px-4 py-3 text-sm text-zinc-200">
                  {col.render
                    ? col.render(row)
                    : (row as Record<string, unknown>)[col.key as string] ?? ""}
                </td>
              ))}
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-6 text-center text-sm text-zinc-500"
              >
                No data.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
