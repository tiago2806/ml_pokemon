

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

// --- Lógica da Arena ---
function getTypeMultiplier(attackerType, defenderType) {
  if (!attackerType || !defenderType) return 1;
  const advantages = {
    Water: ["Fire", "Ground", "Rock"],
    Fire: ["Grass", "Bug", "Ice", "Steel"],
    Grass: ["Water", "Ground", "Rock"],
    Electric: ["Water", "Flying"],
    Psychic: ["Fighting", "Poison"],
    Fighting: ["Normal", "Rock", "Steel", "Ice", "Dark"],
    Ground: ["Fire", "Electric", "Poison", "Rock", "Steel"],
    Rock: ["Fire", "Ice", "Flying", "Bug"],
    Ice: ["Grass", "Ground", "Flying", "Dragon"],
    Dragon: ["Dragon"],
    Fairy: ["Fighting", "Dragon", "Dark"]
  };
  const disadvantages = {
    Water: ["Water", "Grass", "Dragon"],
    Fire: ["Fire", "Water", "Rock", "Dragon"],
    Grass: ["Fire", "Grass", "Poison", "Flying", "Bug", "Dragon", "Steel"],
    Electric: ["Electric", "Grass", "Dragon"],
    Psychic: ["Psychic", "Steel"],
    Fighting: ["Poison", "Flying", "Psychic", "Bug", "Fairy"]
  };
  if (advantages[attackerType]?.includes(defenderType)) return 2.0;
  if (disadvantages[attackerType]?.includes(defenderType)) return 0.5;
  return 1.0;
}

function generateBattleNarrative(p1, p2, s1, s2, m1, m2) {
  if (s1 === s2) return "It's a dead heat! Both Pokémon have an effectively equal power score after type multipliers.";
  const win = s1 > s2 ? p1 : p2;
  const lose = s1 > s2 ? p2 : p1;
  const winMulti = s1 > s2 ? m1 : m2;
  const winBase = Number(win.Total);
  const loseBase = Number(lose.Total);
  
  if (winMulti > 1) {
    if (winBase < loseBase) {
      return `An amazing upset! Even though ${win.Name} has lower base stats, its ${winMulti}x type advantage against ${lose.Name} completely turns the tide!`;
    }
    return `A crushing victory! ${win.Name} dominates with a ${winMulti}x type advantage on top of solid base stats.`;
  }
  if (winMulti < 1) {
    return `Sheer power prevails! Despite a type disadvantage, ${win.Name}'s overwhelming base stats secure the win against ${lose.Name}.`;
  }
  return `A test of raw strength! With neutral type matchups, ${win.Name}'s massive base total of ${winBase} easily overpowers ${lose.Name}'s ${loseBase}.`;
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

  // Filter states
  const [filterType, setFilterType] = useState("");
  const [filterGeneration, setFilterGeneration] = useState("");
  const [filterLegendary, setFilterLegendary] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 11;
  const [selectedPokemon, setSelectedPokemon] = useState(null);
  
  // Arena (Drag & Drop) states
  const [fighters, setFighters] = useState([null, null]);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  // O TEU CÓDIGO DO QUIZ INTACTO
  const [quizStep, setQuizStep] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState([]);
  const [spiritResult, setSpiritResult] = useState(null);

  const quizQuestions = [
    { question: "How do you prefer to win battles?", options: ["Quick and powerful strikes", "Enduring and tanking hits", "Strategic and calculated", "Fast and slippery"] },
    { question: "What's your approach to challenges?", options: ["Go all out with maximum force", "Stay solid and wait for the right moment", "Adapt and find creative solutions", "Be the first to act"] },
    { question: "In a fight, you rather:", options: ["Deal massive damage", "Take hits and survive", "Use special abilities", "Strike before they can react"] },
    { question: "Your ideal weekend activity:", options: ["Competitive sports", "Hiking and endurance activities", "Puzzle solving or games", "Racing or anything fast"] },
    { question: "When playing games, you prefer:", options: ["Offensive builds", "Defensive/tank builds", "Balanced or magical builds", "Speed builds"] },
    { question: "What's your strength?", options: ["Power", "Stamina", "Intelligence", "Agility"] },
    { question: "How do you handle pressure?", options: ["Strike first and end it fast", "Stay calm and endure", "Think of a clever way out", "Act fast before it overwhelms"] },
    { question: "Pick your weapon:", options: ["Heavy sword (high damage)", "Shield (high defense)", "Magic wand (special attacks)", "Daggers (fast attacks)"] }
  ];

  // Get unique types & gens
  const allTypes = useMemo(() => {
    const types = new Set();
    pokemon.forEach(p => { if (p["Type 1"]) types.add(p["Type 1"]); if (p["Type 2"]) types.add(p["Type 2"]); });
    return Array.from(types).sort();
  }, [pokemon]);

  const allGenerations = useMemo(() => {
    const gens = new Set();
    pokemon.forEach(p => { if (p["Generation"]) gens.add(p["Generation"]); });
    return Array.from(gens).sort((a, b) => Number(a) - Number(b));
  }, [pokemon]);

  const menuItems = [
    { id: "exploration", label: "Dashboard & Analysis" },
    { id: "charts", label: "Charts & Stats" },
    { id: "spirit", label: "Spirit Pokémon" },
  ];

  useEffect(() => {
    fetch("/Pokemon.csv")
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load dataset (${response.status})`);
        return response.text();
      })
      .then((text) => setPokemon(parseCsv(text)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const datasetHead = useMemo(() => pokemon.slice(0, 5), [pokemon]);
  
  const filteredPokemon = useMemo(() => {
    return pokemon.filter(p => {
      if (filterType && p["Type 1"] !== filterType && p["Type 2"] !== filterType) return false;
      if (filterGeneration && p["Generation"] !== filterGeneration) return false;
      if (filterLegendary === "true" && p["Legendary"] !== "True") return false;
      if (filterLegendary === "false" && p["Legendary"] === "True") return false;
      return true;
    });
  }, [pokemon, filterType, filterGeneration, filterLegendary]);

  useEffect(() => {
    setCurrentPage(0);
    setSelectedPokemon(null);
  }, [filterType, filterGeneration, filterLegendary]);

  const paginatedPokemon = useMemo(() => {
    const start = currentPage * ITEMS_PER_PAGE;
    return filteredPokemon.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPokemon, currentPage]);

  const totalPages = Math.ceil(filteredPokemon.length / ITEMS_PER_PAGE);

  const searchResult = useMemo(() => {
    const query = searchName.trim().toLowerCase();
    if (!query) return null;
    return filteredPokemon.find((row) => row.Name.toLowerCase() === query) || null;
  }, [filteredPokemon, searchName]);

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
    return () => { active = false; };
  }, [searchResult]);

  const isFilteringOrSearching = searchName.trim() !== "" || filterType !== "" || filterGeneration !== "" || filterLegendary !== "";

  return (
    <div className="app-shell">
      <header>
        <div><h1>ML Pokemon Project</h1></div>
        <nav className="app-nav" aria-label="Main navigation">
          {menuItems.map((item) => (
            <button key={item.id} className={`nav-link ${activePage === item.id ? "active" : ""}`} onClick={() => setActivePage(item.id)} type="button">
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {/* --- DASHBOARD PAGE --- */}
        {activePage === "exploration" && (
          <section>
            <div className="page-header">
              <h2>Dashboard & Analysis</h2>
              <p>Filter the dataset and drag Pokémon into the arena to predict matchups!</p>
            </div>

            {!loading && !error && (
              <>
                {/* Top Row: About & Battle Arena */}
                <div className="dashboard-top-row">
                  <div className="dataset-copy" style={{marginBottom: 0}}>
                    <h3>The Global Pokédex</h3>
                    <p>Welcome to this <strong>Pokémon Analytics Hub</strong>. This platform leverages a curated dataset to explore the relationship between <strong>Base Stats</strong>, elemental <strong>Type Advantages</strong>, and evolutionary shifts across <strong>Generations</strong>.</p>
                    <div className="mini-stats-grid">
                      <div className="mini-stat"><strong>{pokemon.length}</strong><span>Entries</span></div>
                      <div className="mini-stat"><strong>{allTypes.length}</strong><span>Types</span></div>
                      <div className="mini-stat"><strong>{allGenerations.length}</strong><span>Gens</span></div>
                    </div>
                  </div>

                  {/* Arena Widget */}
                  <div className="arena-widget">
                    <h3>Battle Arena</h3>
                    <div className="arena-slots">
                      {/* Slot 1 */}
                      <div 
                        className={`drop-zone ${fighters[0] ? 'filled' : ''} ${dropTarget === 0 ? 'active-drag' : ''}`}
                        onDragOver={e => { e.preventDefault(); setDropTarget(0); }}
                        onDragLeave={() => setDropTarget(null)}
                        onDrop={() => { if(draggedItem) { const n = [...fighters]; n[0] = draggedItem; setFighters(n); } setDropTarget(null); }}
                      >
                        {fighters[0] ? (
                          <>
                            <button className="slot-remove-btn" onClick={() => { const n = [...fighters]; n[0] = null; setFighters(n); }}>X</button>
                            <img src={getPokemonImageUrl(fighters[0])} className="arena-pokemon-img" alt={fighters[0].Name} />
                            <span className="arena-pokemon-name">{fighters[0].Name}</span>
                            <span className="arena-pokemon-type">{fighters[0]["Type 1"]}</span>
                          </>
                        ) : "Drag Pokémon Here"}
                      </div>

                      <div className="arena-vs">VS</div>

                      {/* Slot 2 */}
                      <div 
                        className={`drop-zone ${fighters[1] ? 'filled' : ''} ${dropTarget === 1 ? 'active-drag' : ''}`}
                        onDragOver={e => { e.preventDefault(); setDropTarget(1); }}
                        onDragLeave={() => setDropTarget(null)}
                        onDrop={() => { if(draggedItem) { const n = [...fighters]; n[1] = draggedItem; setFighters(n); } setDropTarget(null); }}
                      >
                        {fighters[1] ? (
                          <>
                            <button className="slot-remove-btn" onClick={() => { const n = [...fighters]; n[1] = null; setFighters(n); }}>X</button>
                            <img src={getPokemonImageUrl(fighters[1])} className="arena-pokemon-img" alt={fighters[1].Name} />
                            <span className="arena-pokemon-name">{fighters[1].Name}</span>
                            <span className="arena-pokemon-type">{fighters[1]["Type 1"]}</span>
                          </>
                        ) : "Drag Pokémon Here"}
                      </div>
                    </div>

                    {/* Smart Narrative Result */}
                    {fighters[0] && fighters[1] && (() => {
                      const p1 = fighters[0];
                      const p2 = fighters[1];
                      const p1Multi = getTypeMultiplier(p1["Type 1"], p2["Type 1"]);
                      const p2Multi = getTypeMultiplier(p2["Type 1"], p1["Type 1"]);
                      const p1Score = Number(p1.Total) * p1Multi;
                      const p2Score = Number(p2.Total) * p2Multi;
                      
                      let title = "It's a Tie! 🤝";
                      if (p1Score > p2Score) title = `${p1.Name} Wins! 🏆`;
                      if (p2Score > p1Score) title = `${p2.Name} Wins! 🏆`;

                      return (
                        <div className="arena-result">
                          <strong>{title}</strong>
                          <div className="narrative-text">{generateBattleNarrative(p1, p2, p1Score, p2Score, p1Multi, p2Multi)}</div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="dataset-overview">
                  <div className="dashboard-card">
                    <h3>Explore & Select</h3>
                    <div className="filters-row">
                      <label className="input-label">Type
                        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="filter-select">
                          <option value="">All</option>{allTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                      <label className="input-label">Generation
                        <select value={filterGeneration} onChange={(e) => setFilterGeneration(e.target.value)} className="filter-select">
                          <option value="">All</option>{allGenerations.map(g => <option key={g} value={g}>Gen {g}</option>)}
                        </select>
                      </label>
                      <label className="input-label">Legendary
                        <select value={filterLegendary} onChange={(e) => setFilterLegendary(e.target.value)} className="filter-select">
                          <option value="">All</option><option value="true">Yes</option><option value="false">No</option>
                        </select>
                      </label>
                    </div>
                    
                    <label className="input-label">Search by name</label>
                    <input value={searchName} onChange={(e) => setSearchName(e.target.value)} placeholder="e.g. Pikachu" className="search-input" />
                    
                    {/* The Full Search Details Panel (WITH DRAG HINT) */}
{/* The Full Search Details Panel (WITH DRAG HINT) */}
                    {searchResult && (
                      <div className="pokemon-details" style={{marginTop: '20px'}}>
                        <div className="pokemon-card">
                          <div className="drag-hint-container">
                            <img 
                              className="pokemon-image" 
                              src={searchImageUrl} 
                              alt={searchResult.Name} 
                              draggable="true"
                              onDragStart={() => setDraggedItem(searchResult)}
                              onDragEnd={() => setDraggedItem(null)}
                              style={{cursor: 'grab'}}
                            />
                            <div className="drag-badge">DRAG ME</div>
                          </div>
                          
                          {/* Os Stats agora vivem AQUI DENTRO, ao lado da imagem */}
                          <div className="pokemon-detail-copy">
                            <h4>{searchResult.Name}</h4>
                            <p style={{marginBottom: '12px'}}>{searchResult["Type 1"]}{searchResult["Type 2"] ? ` / ${searchResult["Type 2"]}` : ""}</p>
                            <div className="detail-row"><span>HP: {searchResult.HP}</span><span>Attack: {searchResult.Attack}</span></div>
                            <div className="detail-row"><span>Defense: {searchResult.Defense}</span><span>Speed: {searchResult.Speed}</span></div>
                            <div className="detail-row"><span>Total: {searchResult.Total}</span></div>
                          </div>
                        </div>

                        {lookupLoading && <div className="status">Loading evolutions and cards…</div>}
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
                                  <div><strong>{card.name}</strong><p>{card.set.name}</p></div>
                                </article>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Draggable Grid */}
                    {isFilteringOrSearching && !searchName ? (
                      <div className="filtered-grid" style={{marginTop: '20px'}}>
                        <div className="filter-results" style={{marginBottom: "14px"}}>
                          Found {filteredPokemon.length} Pokémon (Drag them into the Arena above!)
                        </div>
                        <div className="pokemon-grid">
                          {paginatedPokemon.map((p) => (
                            <div 
                              key={p.Name} 
                              className="pokemon-grid-item"
                              draggable="true"
                              onDragStart={() => setDraggedItem(p)}
                              onDragEnd={() => setDraggedItem(null)}
                              onClick={() => setSelectedPokemon(p)}
                            >
                              <img src={getPokemonImageUrl(p)} alt={p.Name} className="grid-pokemon-img" draggable="false" />
                              <span className="grid-pokemon-name">{p.Name}</span>
                            </div>
                          ))}
                        </div>
                        {totalPages > 1 && (
                          <div className="pagination">
                            <button className="page-btn" onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}>← Prev</button>
                            <span className="page-info">{currentPage + 1} / {totalPages}</span>
                            <button className="page-btn" onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1}>Next →</button>
                          </div>
                        )}
                      </div>
                    ) : !isFilteringOrSearching && (
                      <div className="empty-state">Use the search or filters above to begin exploration.</div>
                    )}
                    
                    {/* Click Details for Grid items */}
                    {selectedPokemon && !searchName && (
                      <div className="selected-pokemon" style={{marginTop: '20px'}}>
                        <button className="back-btn" onClick={() => setSelectedPokemon(null)}>← Back to results</button>
                        <div className="pokemon-card">
                          <img className="pokemon-image" src={getPokemonImageUrl(selectedPokemon)} alt={selectedPokemon.Name} />
                          <div className="pokemon-detail-copy">
                            <h4>{selectedPokemon.Name}</h4>
                            <p>{selectedPokemon["Type 1"]}{selectedPokemon["Type 2"] ? ` / ${selectedPokemon["Type 2"]}` : ""}</p>
                          </div>
                        </div>
                        <div className="detail-row"><span>HP: {selectedPokemon.HP}</span><span>Attack: {selectedPokemon.Attack}</span></div>
                        <div className="detail-row"><span>Defense: {selectedPokemon.Defense}</span><span>Speed: {selectedPokemon.Speed}</span></div>
                        <div className="detail-row"><span>Total: {selectedPokemon.Total}</span><span>Gen: {selectedPokemon.Generation}</span></div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* RAW DATA TABLE RESTORED */}
            {!loading && !error && (
              <section style={{marginTop: '40px'}}>
                <h2>Dataset Overview</h2>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr><th>Image</th><th>#</th><th>Name</th><th>Type 1</th><th>Type 2</th><th>Total</th><th>HP</th><th>Attack</th><th>Defense</th><th>Speed</th></tr>
                    </thead>
                    <tbody>
                      {datasetHead.map((row, index) => {
                        const imgUrl = getPokemonImageUrl(row);
                        return (
                          <tr key={`${row.Name}-${index}`}>
                            <td>{imgUrl && <img src={imgUrl} alt={row.Name} style={{width: "40px", height: "40px", objectFit: "contain"}} />}</td>
                            <td>{row["#"] || index + 1}</td><td>{row.Name}</td><td>{row["Type 1"]}</td><td>{row["Type 2"] || "—"}</td><td>{row.Total}</td><td>{row.HP}</td><td>{row.Attack}</td><td>{row.Defense}</td><td>{row.Speed}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </section>
        )}

        {/* --- CHARTS PAGE --- */}
        {activePage === "charts" && (
          <section className="charts-page">
            <h2>Charts & Statistics</h2>
            <p>Explore the Pokémon dataset through visualizations.</p>
            {!loading && !error && pokemon.length > 0 && (
              <div className="charts-container">
                {/* Type Distribution Chart */}
                <div className="chart-card">
                  <h3>Pokémon by Type</h3>
                  <div className="bar-chart">
                    {(() => {
                      const typeCounts = {};
                      pokemon.forEach(p => { const t = p["Type 1"]; typeCounts[t] = (typeCounts[t] || 0) + 1; });
                      const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
                      const maxCount = sortedTypes[0]?.[1] || 1;
                      return sortedTypes.map(([type, count]) => (
                        <div key={type} className="bar-row">
                          <span className="bar-label">{type}</span>
                          <div className="bar-container"><div className="bar" style={{width: `${(count / maxCount) * 100}%`}}></div></div>
                          <span className="bar-value">{count}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Generation Distribution Chart */}
                <div className="chart-card">
                  <h3>Pokémon by Generation</h3>
                  <div className="bar-chart">
                    {(() => {
                      const genCounts = {};
                      pokemon.forEach(p => { const g = p["Generation"]; if (g) genCounts[g] = (genCounts[g] || 0) + 1; });
                      const sortedGens = Object.entries(genCounts).sort((a, b) => Number(a[0]) - Number(b[0]));
                      const maxCount = sortedGens[0]?.[1] || 1;
                      return sortedGens.map(([gen, count]) => (
                        <div key={gen} className="bar-row">
                          <span className="bar-label">Gen {gen}</span>
                          <div className="bar-container"><div className="bar gen-bar" style={{width: `${(count / maxCount) * 100}%`}}></div></div>
                          <span className="bar-value">{count}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Stats Average Chart */}
                <div className="chart-card">
                  <h3>Average Stats</h3>
                  <div className="bar-chart">
                    {(() => {
                      const stats = ["HP", "Attack", "Defense", "Sp. Atk", "Sp. Def", "Speed"];
                      const avgStats = stats.map(stat => {
                        const sum = pokemon.reduce((acc, p) => acc + (Number(p[stat]) || 0), 0);
                        return (sum / pokemon.length).toFixed(1);
                      });
                      const maxAvg = Math.max(...avgStats);
                      return stats.map((stat, i) => (
                        <div key={stat} className="bar-row">
                          <span className="bar-label">{stat}</span>
                          <div className="bar-container"><div className="bar stat-bar" style={{width: `${(avgStats[i] / maxAvg) * 100}%`}}></div></div>
                          <span className="bar-value">{avgStats[i]}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

{/* --- SPIRIT QUIZ PAGE --- */}
        {activePage === "spirit" && (
          <section className="spirit-quiz">
            <div className="page-header">
              <h2>Spirit Pokémon</h2>
              <p>Discover your own match or meet the team behind this project!</p>
            </div>

            {/* QUIZ SECTION */}
            <div className="quiz-container-box" style={{ marginBottom: '40px' }}>
              <h3>Take the Quiz</h3>
              <p>Analyze your personality traits against our dataset to find your match.</p>
              <button className="start-quiz-btn" onClick={() => { setQuizStep(1); setQuizAnswers([]); setSpiritResult(null); }}>
                Start Quiz
              </button>
            </div>

            {/* TEAM INDIVIDUAL CARDS SECTION */}
            <div className="group-spirit-section">
              <h3>Our Group's Spirit Pokemon</h3>
              <div className="group-grid">

                {/* Team Member 1 */}
                <div className="member-card">
                  <div className="member-photo-container">
                    <img src="foto.jpg" alt="Member 1" className="individual-photo" />
                  </div>
                  <div className="member-info">
                    <span className="member-name">Henrique Santos</span>
                    <div className="spirit-match">
                      <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png" alt="Charizard" />
                      <span>Charizard</span>
                    </div>
                  </div>
                </div>

                {/* Team Member 2 */}
                <div className="member-card">
                  <div className="member-photo-container">
                    <img src="/DSC07114.jpg" alt="Member 2" className="individual-photo" />
                  </div>
                  <div className="member-info">
                    <span className="member-name">Laura Lisboa</span>
                    <div className="spirit-match">
                      <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/252.png" alt="Treecko" />
                      <span>Treecko</span>
                    </div>
                  </div>
                </div>

                {/* Team Member 3 */}
                <div className="member-card">
                  <div className="member-photo-container">
                    <img src="/teu-caminho/foto3.jpg" alt="Member 3" className="individual-photo" />
                  </div>
                  <div className="member-info">
                    <span className="member-name">Tiago Carvalho</span>
                    <div className="spirit-match">
                      <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/131.png" alt="Lapras" />
                      <span>Lapras</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* MODAL DO QUIZ */}
            {quizStep > 0 && (
              <div className="quiz-modal">
                <div className="quiz-content">
                  {quizStep <= quizQuestions.length ? (
                    <>
                      <h3>Question {quizStep} of {quizQuestions.length}</h3>
                      <p>{quizQuestions[quizStep - 1].question}</p>
                      {quizQuestions[quizStep - 1].options.map((opt) => (
                        <button key={opt} onClick={() => {
                          const newAnswers = [...quizAnswers, opt];
                          if (quizStep === quizQuestions.length) {
                            const match = pokemon[Math.floor(Math.random() * pokemon.length)];
                            setSpiritResult({
                              name: match.Name,
                              img: getPokemonImageUrl(match),
                              desc: `Stats: Attack ${match.Attack}, Defense ${match.Defense}`
                            });
                            setQuizStep(0);
                          } else {
                            setQuizAnswers(newAnswers);
                            setQuizStep(quizStep + 1);
                          }
                        }}>{opt}</button>
                      ))}
                      <button className="close-quiz-btn" onClick={() => setQuizStep(0)}>Close</button>
                    </>
                  ) : null}
                </div>
              </div>
            )}

            {spiritResult && (
              <div className="quiz-result">
                <h3>Your spirit Pokémon is:</h3>
                <img src={spiritResult.img} alt={spiritResult.name} style={{ width: "140px", margin: "18px auto", display: "block" }} />
                <div className="spirit-name" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{spiritResult.name}</div>
                <div className="spirit-desc" style={{ marginBottom: "20px" }}>{spiritResult.desc}</div>
                <button className="start-quiz-btn" onClick={() => { setQuizStep(1); setQuizAnswers([]); setSpiritResult(null); }}>Try Again</button>
              </div>
            )}
          </section>
        )}
      </main>

      {/* --- STICKY BATTLE BAR --- */}
      {(fighters[0] || fighters[1]) && activePage !== "compare" && (
        <div className="sticky-battle-bar">
          <div className="battle-slots">
            <div className={`battle-slot ${fighters[0] ? 'filled' : ''}`}>{fighters[0]?.Name || "Slot 1"}</div>
            <div className="battle-vs">VS</div>
            <div className={`battle-slot ${fighters[1] ? 'filled' : ''}`}>{fighters[1]?.Name || "Slot 2"}</div>
          </div>
          <button className="battle-btn" onClick={() => setActivePage("compare")} disabled={!fighters[0] || !fighters[1]}>Battle!</button>
          <button className="clear-btn" onClick={() => setPokemonToCompare([null, null])}>Clear</button>
        </div>
      )}
    </div>
  );
}

export default App;