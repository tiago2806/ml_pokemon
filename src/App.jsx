import { useEffect, useMemo, useState } from "react";

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((value) => value.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

function getPokemonImageUrl(pokemon) {
  const id = Number(pokemon["#"] || pokemon.id || 0);
  if (!id) return null;
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

function parseEvolutionChain(chain) {
  const names = [];
  function walk(node) {
    names.push(node.species.name);
    node.evolves_to.forEach(walk);
  }
  walk(chain);
  return names;
}

function App() {
  const [pokemon, setPokemon] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activePage, setActivePage] = useState("exploration");
  const [searchName, setSearchName] = useState("");
  const [evolutionChain, setEvolutionChain] = useState([]);
  const [cardResults, setCardResults] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState(null);

  const menuItems = [
    { id: "exploration", label: "Data exploration" },
  ];

  useEffect(() => {
    fetch("/Pokemon.csv")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load dataset (${response.status})`);
        }
        return response.text();
      })
      .then((text) => {
        setPokemon(parseCsv(text));
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const datasetHead = useMemo(() => pokemon.slice(0, 5), [pokemon]);
  const searchResult = useMemo(() => {
    const query = searchName.trim().toLowerCase();
    if (!query) return null;
    return pokemon.find((row) => row.Name.toLowerCase() === query) || null;
  }, [pokemon, searchName]);

  const searchImageUrl = searchResult ? getPokemonImageUrl(searchResult) : null;

  useEffect(() => {
    if (!searchResult) {
      setEvolutionChain([]);
      setCardResults([]);
      setLookupError(null);
      return;
    }

    let active = true;
    const query = searchResult.Name.trim().toLowerCase();

    async function fetchLookupDetails() {
      setLookupLoading(true);
      setLookupError(null);

      try {
        const speciesResponse = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${encodeURIComponent(query)}`);
        if (!speciesResponse.ok) throw new Error("Failed to load evolution chain data.");
        const speciesData = await speciesResponse.json();

        const evolutionResponse = await fetch(speciesData.evolution_chain.url);
        if (!evolutionResponse.ok) throw new Error("Failed to load evolution chain data.");
        const evolutionData = await evolutionResponse.json();
        const chainNames = parseEvolutionChain(evolutionData.chain);

        const cardsResponse = await fetch(`https://api.pokemontcg.io/v2/cards?q=name:${encodeURIComponent(query)}&pageSize=5`);
        if (!cardsResponse.ok) throw new Error("Failed to load card data.");
        const cardsData = await cardsResponse.json();

        if (!active) return;
        setEvolutionChain(chainNames);
        setCardResults(cardsData.data || []);
      } catch (fetchError) {
        if (active) setLookupError(fetchError.message);
      } finally {
        if (active) setLookupLoading(false);
      }
    }

    fetchLookupDetails();
    return () => {
      active = false;
    };
  }, [searchResult]);

  return (
    <div className="app-shell">
      <header>
        <div>
          <h1>ML Pokemon Project</h1>
        </div>
        <nav className="app-nav" aria-label="Main navigation">
          {menuItems.map((item) => (
            <button
              key={item.id}
              className={`nav-link ${activePage === item.id ? "active" : ""}`}
              onClick={() => setActivePage(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        <section className="page-header">
          <h2>Initial overview</h2>
          <p>This page shows a quick dataset overview and lets you look up a Pokémon by name.</p>
        </section>

        {!loading && !error && (
          <section className="dataset-overview">
            <div className="dataset-copy">
              <h3>About this dataset</h3>
              <p>
                This dataset contains Pokémon from multiple generations, including base stats and type information.
                It is useful for exploring Pokémon strength, comparing type matchups, and building simple ML models.
              </p>
              <ul>
                <li><strong>{pokemon.length}</strong> Pokémon entries loaded from the CSV dataset.</li>
                <li>Columns include: Name, Type 1, Type 2, Total, HP, Attack, Defense, Sp. Atk, Sp. Def, Speed, Generation, Legendary.</li>
                <li>The data can be used for stat comparison, filtering by type, and exploring modern Poké analytics.</li>
              </ul>
            </div>
            <div className="sidebar-panel">
              <div className="objective-card">
                <h3>Objective</h3>
                <p>Objective:</p>
              </div>
              <div className="dashboard-card">
                <h3>Pokémon lookup</h3>
                <label htmlFor="pokemon-search" className="input-label">
                  Enter a Pokémon name
                </label>
                <input
                  id="pokemon-search"
                  value={searchName}
                  onChange={(event) => setSearchName(event.target.value)}
                  placeholder="e.g. Pikachu"
                  className="search-input"
                />
                {searchName && !searchResult && (
                  <div className="status">No Pokémon found with that name.</div>
                )}
                {searchResult && (
                  <div className="pokemon-details">
                    {searchImageUrl && (
                      <div className="pokemon-card">
                        <img
                          className="pokemon-image"
                          src={searchImageUrl}
                          alt={searchResult.Name}
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                        <div className="pokemon-detail-copy">
                          <h4>{searchResult.Name}</h4>
                          <p>{searchResult["Type 1"]}{searchResult["Type 2"] ? ` / ${searchResult["Type 2"]}` : ""}</p>
                        </div>
                      </div>
                    )}
                    <div className="detail-row">
                      <span>HP: {searchResult.HP}</span>
                      <span>Attack: {searchResult.Attack}</span>
                    </div>
                    <div className="detail-row">
                      <span>Defense: {searchResult.Defense}</span>
                      <span>Speed: {searchResult.Speed}</span>
                    </div>
                    <div className="detail-row">
                      <span>Total: {searchResult.Total}</span>
                    </div>
                    {lookupLoading && <div className="status">Loading evolutions and cards…</div>}
                    {lookupError && <div className="status status-error">{lookupError}</div>}
                    {!lookupLoading && !lookupError && evolutionChain.length > 0 && (
                      <div className="lookup-section">
                        <h4>Evolution chain</h4>
                        <p>{evolutionChain.join(" → ")}</p>
                      </div>
                    )}
                    {!lookupLoading && !lookupError && cardResults.length > 0 && (
                      <div className="lookup-section">
                        <h4>Top card results</h4>
                        <div className="card-grid">
                          {cardResults.map((card) => (
                            <article key={card.id} className="card-tile">
                              <img src={card.images.small} alt={card.name} className="card-image" />
                              <div>
                                <strong>{card.name}</strong>
                                <p>{card.set.name}</p>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {loading && <div className="status">Loading dataset…</div>}
        {error && <div className="status status-error">{error}</div>}

        {!loading && !error && (
          <>
            <section>
              <h2>Dataset overview</h2>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Type 1</th>
                      <th>Type 2</th>
                      <th>Total</th>
                      <th>HP</th>
                      <th>Attack</th>
                      <th>Defense</th>
                      <th>Speed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datasetHead.map((row, index) => (
                      <tr key={`${row.Name}-${index}`}>
                        <td>{row["#"] || index + 1}</td>
                        <td>{row.Name}</td>
                        <td>{row["Type 1"]}</td>
                        <td>{row["Type 2"] || "—"}</td>
                        <td>{row.Total}</td>
                        <td>{row.HP}</td>
                        <td>{row.Attack}</td>
                        <td>{row.Defense}</td>
                        <td>{row.Speed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
