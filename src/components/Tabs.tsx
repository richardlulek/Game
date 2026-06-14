import { S } from "../styles/styles";

export interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  tab: string;
  setTab: (id: string) => void;
  items: TabItem[];
}

export function Tabs({ tab, setTab, items }: TabsProps) {
  return (
    <div style={S.tabs}>
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => setTab(it.id)}
          style={{ ...S.tab, ...(tab === it.id ? S.tabActive : {}) }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
