type Tab = {
  id: string;
  label: string;
};

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
};

export default function BrandTabs({ tabs, active, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2 rounded-full bg-slate-100 p-1 text-sm">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`rounded-full px-4 py-2 font-medium transition ${
            active === tab.id
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:bg-white hover:text-slate-900"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
