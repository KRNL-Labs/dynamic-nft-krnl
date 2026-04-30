import { QuestState } from "@/types";

const statusStyles: Record<QuestState["status"], string> = {
  not_started: "bg-slate-100 text-slate-700",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-blue-100 text-blue-800",
  rewarded: "bg-emerald-100 text-emerald-800",
};

export default function QuestRow({ quest }: { quest: QuestState }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold text-slate-900">
            {quest.title}
          </h4>
          {quest.description && (
            <p className="mt-1 text-sm text-slate-600">{quest.description}</p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Complete this quest on Zealy. Rewards appear once approved.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[quest.status]}`}
        >
          {quest.status.replace("_", " ")}
        </span>
      </div>
    </div>
  );
}
