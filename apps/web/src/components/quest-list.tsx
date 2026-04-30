import QuestRow from "./quest-row";
import { QuestState } from "@/types";

export default function QuestList({ quests }: { quests: QuestState[] }) {
  if (!quests.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
        No quests yet. Connect Zealy to start syncing quests.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {quests.map((quest) => (
        <QuestRow key={quest.id} quest={quest} />
      ))}
    </div>
  );
}
