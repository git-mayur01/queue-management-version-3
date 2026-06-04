const cards = [
  ['Pending', 'pendingOrders'],
  ['Cooking', 'cookingOrders'],
  ['Ready', 'readyOrders'],
  ['Delivered', 'deliveredOrders']
];

export default function StatsPanel({ stats }) {
  return (
    <section className="stats-grid" aria-label="Today order statistics">
      {cards.map(([label, key]) => (
        <div className="stat-card" key={key}>
          <span>{label}</span>
          <strong>{stats?.[key] ?? 0}</strong>
        </div>
      ))}
    </section>
  );
}
