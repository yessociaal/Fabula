export default function App() {
  return (
    <main className="home">
      <h1 className="home-title">Fabula</h1>

      <div className="home-actions">
        <button type="button" title="Create a new story">+ New story</button>
        <button type="button" title="Open an existing story">Open story…</button>
      </div>

      <section>
        <h2 className="home-section-title">Recent</h2>
        <p className="home-empty">No stories yet. Create one to get started.</p>
      </section>

      <div className="home-sdk">
        <span>Ren'Py SDK: not set</span>
      </div>
    </main>
  )
}
