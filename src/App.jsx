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

// Simplified Type Effectiveness Matrix
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

  if (advantages[attackerType]?.includes(defenderType)) return 2.0; // Super Effective
  if (disadvantages[attackerType]?.includes(defenderType)) return 0.5; // Not very effective
  return 1.0; // Neutral
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
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 11;
  
  // Selected Pokemon for details view
  const [selectedPokemon, setSelectedPokemon] = useState(null);
  
  // Comparison state (Updated for the new Arena)
  const [pokemonToCompare, setPokemonToCompare] = useState([null, null]);

  // Get unique types from dataset
  const allTypes = useMemo(() => {
    const types = new Set();
    pokemon.forEach(p => {
      if (p["Type 1"]) types.add(p["Type 1"]);
      if (p["Type 2"]) types.add(p["Type 2"]);
    });
    return Array.from(types).sort();
  }, [pokemon]);

  // Get unique generations
  const allGenerations = useMemo(() => {
    const gens = new Set();
    pokemon.forEach(p => {
      if (p["Generation"]) gens.add(p["Generation"]);
    });
    return Array.from(gens).sort((a, b) => Number(a) - Number(b));
  }, [pokemon]);

  const menuItems = [
    { id: "exploration", label: "Dataset & Filters" },
    { id: "charts", label: "Charts & Stats" },
    { id: "compare", label: "Battle Arena" }, // Updated Label
    { id: "spirit", label: "Spirit Pokémon" },
  ];

  // Estado para o quiz
  const [quizStep, setQuizStep] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState([]);
  const [spiritResult, setSpiritResult] = useState(null);

  // Perguntas do quiz - baseadas em stats (Attack, Defense, HP, Speed)
  const quizQuestions = [
    {
      question: "How do you prefer to win battles?",
      options: [
        "Quick and powerful strikes",  // High Attack
        "Enduring and tanking hits",   // High Defense/HP
        "Strategic and calculated",     // High Sp. Atk / Sp. Def
        "Fast and slippery"            // High Speed
      ]
    },
    {
      question: "What's your approach to challenges?",
      options: [
        "Go all out with maximum force",  // Attack
        "Stay solid and wait for the right moment", // Defense
        "Adapt and find creative solutions", // Sp. Atk
        "Be the first to act"              // Speed
      ]
    },
    {
      question: "In a fight, you rather:",
      options: [
        "Deal massive damage",            // Attack
        "Take hits and survive",          // HP/Defense
        "Use special abilities",           // Sp. Atk
        "Strike before they can react"    // Speed
      ]
    },
    {
      question: "Your ideal weekend activity:",
      options: [
        "Competitive sports",              // Attack
        "Hiking and endurance activities", // HP/Defense
        "Puzzle solving or games",        // Sp. Atk
        "Racing or anything fast"         // Speed
      ]
    },
    {
      question: "When playing games, you prefer:",
      options: [
        "Offensive builds",               // Attack
        "Defensive/tank builds",          // Defense
        "Balanced or magical builds",     // Sp. Atk
        "Speed builds"                    // Speed
      ]
    },
    {
      question: "What's your strength?",
      options: [
        "Power",                          // Attack
        "Stamina",                        // HP
        "Intelligence",                  // Sp. Atk
        "Agility"                        // Speed
      ]
    },
    {
      question: "How do you handle pressure?",
      options: [
        "Strike first and end it fast",  // Attack
        "Stay calm and endure",           // Defense/HP
        "Think of a clever way out",     // Sp. Def
        "Act fast before it overwhelms"   // Speed
      ]
    },
    {
      question: "Pick your weapon:",
      options: [
        "Heavy sword (high damage)",      // Attack
        "Shield (high defense)",          // Defense
        "Magic wand (special attacks)",   // Sp. Atk
        "Daggers (fast attacks)"         // Speed
      ]
    }
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
  
  // Filtered dataset based on filters
  const filteredPokemon = useMemo(() => {
    return pokemon.filter(p => {
      if (filterType && p["Type 1"] !== filterType && p["Type 2"] !== filterType) return false;
      if (filterGeneration && p["Generation"] !== filterGeneration) return false;
      if (filterLegendary === "true" && p["Legendary"] !== "True") return false;
      if (filterLegendary === "false" && p["Legendary"] === "True") return false;
      return true;
    });
  }, [pokemon, filterType, filterGeneration, filterLegendary]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(0);
    setSelectedPokemon(null);
  }, [filterType, filterGeneration, filterLegendary]);

  // Paginated results
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
    return () => {
      active = false;
    };
  }, [searchResult]);

  // Handle adding a Pokemon to the battle slots
  const addToBattle = (p) => {
    if (!pokemonToCompare[0]) {
      setPokemonToCompare([p, pokemonToCompare[1]]);
    } else if (!pokemonToCompare[1]) {
      setPokemonToCompare([pokemonToCompare[0], p]);
    } else {
      setPokemonToCompare([pokemonToCompare[0], p]);
    }
  };

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
        {activePage === "exploration" && (
          <>
            <section className="page-header">
              <h2>Dataset & Filters</h2>
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
                  <div className="dashboard-card">
                    <h3>Pokémon lookup</h3>
                    
                    {/* Filters */}
                    <div className="filters-row">
                      <label className="input-label">
                        Type
                        <select 
                          value={filterType} 
                          onChange={(e) => setFilterType(e.target.value)}
                          className="filter-select"
                        >
                          <option value="">All</option>
                          {allTypes.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                      <label className="input-label">
                        Generation
                        <select 
                          value={filterGeneration} 
                          onChange={(e) => setFilterGeneration(e.target.value)}
                          className="filter-select"
                        >
                          <option value="">All</option>
                          {allGenerations.map(g => (
                            <option key={g} value={g}>Gen {g}</option>
                          ))}
                        </select>
                      </label>
                      <label className="input-label">
                        Legendary
                        <select 
                          value={filterLegendary} 
                          onChange={(e) => setFilterLegendary(e.target.value)}
                          className="filter-select"
                        >
                          <option value="">All</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </label>
                    </div>
                    
                    <div className="filter-results">
                      Showing {filteredPokemon.length} of {pokemon.length} Pokémon
                    </div>
                    
                    <label htmlFor="pokemon-search" className="input-label">
                      Search by name
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
                              <button className="add-to-battle-btn" onClick={() => addToBattle(searchResult)}>
                                Add to Battle!
                              </button>
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
                    
                    {/* Filtered Pokemon Grid with Pagination */}
                    {filteredPokemon.length > 0 && !searchName && (
                      <div className="filtered-grid">
                        <h4>Pokémon Results</h4>
                        <div className="pokemon-grid">
                          {paginatedPokemon.map((p) => {
                            const imgUrl = getPokemonImageUrl(p);
                            return (
                              <div 
                                key={p.Name} 
                                className="pokemon-grid-item"
                                onClick={() => setSelectedPokemon(p)}
                              >
                                {imgUrl && (
                                  <img src={imgUrl} alt={p.Name} className="grid-pokemon-img" />
                                )}
                                <span className="grid-pokemon-name">{p.Name}</span>
                                <button className="add-to-battle-btn" onClick={(e) => { e.stopPropagation(); addToBattle(p); }}>
                                  Select
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                          <div className="pagination">
                            <button 
                              className="page-btn"
                              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                              disabled={currentPage === 0}
                            >
                              ← Prev
                            </button>
                            <span className="page-info">{currentPage + 1} / {totalPages}</span>
                            <button 
                              className="page-btn"
                              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                              disabled={currentPage >= totalPages - 1}
                            >
                              Next →
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Selected Pokemon Details with Back Button */}
                    {selectedPokemon && (
                      <div className="selected-pokemon">
                        <button className="back-btn" onClick={() => setSelectedPokemon(null)}>
                          ← Back to results
                        </button>
                        {(() => {
                          const imgUrl = getPokemonImageUrl(selectedPokemon);
                          return (
                            <div className="pokemon-card">
                              {imgUrl && (
                                <img className="pokemon-image" src={imgUrl} alt={selectedPokemon.Name} />
                              )}
                              <div className="pokemon-detail-copy">
                                <h4>{selectedPokemon.Name}</h4>
                                <p>{selectedPokemon["Type 1"]}{selectedPokemon["Type 2"] ? ` / ${selectedPokemon["Type 2"]}` : ""}</p>
                              </div>
                            </div>
                          );
                        })()}
                        <div className="detail-row">
                          <span>HP: {selectedPokemon.HP}</span>
                          <span>Attack: {selectedPokemon.Attack}</span>
                        </div>
                        <div className="detail-row">
                          <span>Defense: {selectedPokemon.Defense}</span>
                          <span>Speed: {selectedPokemon.Speed}</span>
                        </div>
                        <div className="detail-row">
                          <span>Total: {selectedPokemon.Total}</span>
                          <span>Gen: {selectedPokemon.Generation}</span>
                        </div>
                        {selectedPokemon["Legendary"] === "True" && (
                          <span className="legendary-badge">Legendary</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* RESTORED CHARTS PAGE */}
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
                      pokemon.forEach(p => {
                        const t = p["Type 1"];
                        typeCounts[t] = (typeCounts[t] || 0) + 1;
                      });
                      const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
                      const maxCount = sortedTypes[0]?.[1] || 1;
                      return sortedTypes.map(([type, count]) => (
                        <div key={type} className="bar-row">
                          <span className="bar-label">{type}</span>
                          <div className="bar-container">
                            <div className="bar" style={{width: `${(count / maxCount) * 100}%`}}></div>
                          </div>
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
                      pokemon.forEach(p => {
                        const g = p["Generation"];
                        if (g) genCounts[g] = (genCounts[g] || 0) + 1;
                      });
                      const sortedGens = Object.entries(genCounts).sort((a, b) => Number(a[0]) - Number(b[0]));
                      const maxCount = sortedGens[0]?.[1] || 1;
                      return sortedGens.map(([gen, count]) => (
                        <div key={gen} className="bar-row">
                          <span className="bar-label">Gen {gen}</span>
                          <div className="bar-container">
                            <div className="bar gen-bar" style={{width: `${(count / maxCount) * 100}%`}}></div>
                          </div>
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
                          <div className="bar-container">
                            <div className="bar stat-bar" style={{width: `${(avgStats[i] / maxAvg) * 100}%`}}></div>
                          </div>
                          <span className="bar-value">{avgStats[i]}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Legendary vs Non-Legendary */}
                <div className="chart-card">
                  <h3>Legendary vs Non-Legendary</h3>
                  <div className="pie-chart-container">
                    {(() => {
                      const legendary = pokemon.filter(p => p["Legendary"] === "True").length;
                      const nonLegendary = pokemon.length - legendary;
                      const total = pokemon.length || 1;
                      const legPct = ((legendary / total) * 100).toFixed(1);
                      const nonLegPct = ((nonLegendary / total) * 100).toFixed(1);
                      return (
                        <div className="pie-info">
                          <div className="pie-legend">
                            <div className="pie-item">
                              <span className="pie-color" style={{background: '#fbbf24'}}></span>
                              <span>Legendary: {legendary} ({legPct}%)</span>
                            </div>
                            <div className="pie-item">
                              <span className="pie-color" style={{background: '#6366f1'}}></span>
                              <span>Non-Legendary: {nonLegendary} ({nonLegPct}%)</span>
                            </div>
                          </div>
                          <div className="simple-bar-horizontal">
                            <div className="bar-segment legend" style={{width: `${legPct}%`}}></div>
                            <div className="bar-segment non-legend" style={{width: `${nonLegPct}%`}}></div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Top 10 by Total Stats */}
                <div className="chart-card">
                  <h3>Top 10 Pokémon by Total Stats</h3>
                  <div className="bar-chart">
                    {(() => {
                      const top10 = [...pokemon].sort((a, b) => Number(b.Total) - Number(a.Total)).slice(0, 10);
                      const maxTotal = Number(top10[0]?.Total) || 1;
                      return top10.map((p, i) => (
                        <div key={p.Name} className="bar-row">
                          <span className="bar-label">{i + 1}. {p.Name}</span>
                          <div className="bar-container">
                            <div className="bar top-bar" style={{width: `${(Number(p.Total) / maxTotal) * 100}%`}}></div>
                          </div>
                          <span className="bar-value">{p.Total}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* NEW BATTLE ARENA PAGE */}
        {activePage === "compare" && (
          <section className="compare-page">
            <h2>Battle Arena</h2>
            <p>Select two Pokémon to see who wins in a battle! Type advantages will modify their power.</p>
            
            {!loading && !error && pokemon.length > 0 && (
              <div className="compare-container">
                <div className="compare-selectors">
                  <div className="compare-selector">
                    <label className="input-label">Choose Fighter 1</label>
                    <select 
                      className="filter-select"
                      value={pokemonToCompare[0]?.Name || ""}
                      onChange={(e) => {
                        const selected = pokemon.find(p => p.Name === e.target.value);
                        setPokemonToCompare(prev => selected ? [selected, prev[1]] : [null, prev[1]]);
                      }}
                    >
                      <option value="">Select a Pokémon</option>
                      {pokemon.map(p => (
                        <option key={p.Name} value={p.Name}>{p.Name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="compare-vs">VS</div>
                  <div className="compare-selector">
                    <label className="input-label">Choose Fighter 2</label>
                    <select 
                      className="filter-select"
                      value={pokemonToCompare[1]?.Name || ""}
                      onChange={(e) => {
                        const selected = pokemon.find(p => p.Name === e.target.value);
                        setPokemonToCompare(prev => [prev[0], selected]);
                      }}
                    >
                      <option value="">Select a Pokémon</option>
                      {pokemon.map(p => (
                        <option key={p.Name} value={p.Name}>{p.Name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {pokemonToCompare[0] && pokemonToCompare[1] && (
                  <div className="compare-result">
                    <div className="compare-pokemon-card">
                      {getPokemonImageUrl(pokemonToCompare[0]) && (
                        <img 
                          src={getPokemonImageUrl(pokemonToCompare[0])} 
                          alt={pokemonToCompare[0].Name}
                          className="compare-pokemon-img"
                        />
                      )}
                      <h3>{pokemonToCompare[0].Name}</h3>
                      <p>{pokemonToCompare[0]["Type 1"]}{pokemonToCompare[0]["Type 2"] ? ` / ${pokemonToCompare[0]["Type 2"]}` : ""}</p>
                      
                      {(() => {
                        const multi = getTypeMultiplier(pokemonToCompare[0]["Type 1"], pokemonToCompare[1]["Type 1"]);
                        return multi !== 1 ? (
                          <div className={`battle-multiplier ${multi > 1 ? 'advantage' : ''}`}>
                            Damage: {multi}x vs {pokemonToCompare[1].Name}
                          </div>
                        ) : null;
                      })()}

                      <div className="compare-stats">
                        {["HP", "Attack", "Defense", "Sp. Atk", "Sp. Def", "Speed", "Total"].map(stat => (
                          <div key={stat} className="compare-stat-row">
                            <span>{stat}:</span>
                            <span>{pokemonToCompare[0][stat]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="compare-winner">
                      {(() => {
                        const p1Base = Number(pokemonToCompare[0].Total);
                        const p2Base = Number(pokemonToCompare[1].Total);
                        
                        const p1Multi = getTypeMultiplier(pokemonToCompare[0]["Type 1"], pokemonToCompare[1]["Type 1"]);
                        const p2Multi = getTypeMultiplier(pokemonToCompare[1]["Type 1"], pokemonToCompare[0]["Type 1"]);
                        
                        const p1Score = p1Base * p1Multi;
                        const p2Score = p2Base * p2Multi;

                        if (p1Score > p2Score) {
                          return <div className="winner-badge">{pokemonToCompare[0].Name} Wins! 🏆</div>;
                        } else if (p2Score > p1Score) {
                          return <div className="winner-badge">{pokemonToCompare[1].Name} Wins! 🏆</div>;
                        } else {
                          return <div className="winner-badge">It's a Tie! 🤝</div>;
                        }
                      })()}
                    </div>
                    
                    <div className="compare-pokemon-card">
                      {getPokemonImageUrl(pokemonToCompare[1]) && (
                        <img 
                          src={getPokemonImageUrl(pokemonToCompare[1])} 
                          alt={pokemonToCompare[1].Name}
                          className="compare-pokemon-img"
                        />
                      )}
                      <h3>{pokemonToCompare[1].Name}</h3>
                      <p>{pokemonToCompare[1]["Type 1"]}{pokemonToCompare[1]["Type 2"] ? ` / ${pokemonToCompare[1]["Type 2"]}` : ""}</p>
                      
                      {(() => {
                        const multi = getTypeMultiplier(pokemonToCompare[1]["Type 1"], pokemonToCompare[0]["Type 1"]);
                        return multi !== 1 ? (
                          <div className={`battle-multiplier ${multi > 1 ? 'advantage' : ''}`}>
                            Damage: {multi}x vs {pokemonToCompare[0].Name}
                          </div>
                        ) : null;
                      })()}

                      <div className="compare-stats">
                        {["HP", "Attack", "Defense", "Sp. Atk", "Sp. Def", "Speed", "Total"].map(stat => (
                          <div key={stat} className="compare-stat-row">
                            <span>{stat}:</span>
                            <span>{pokemonToCompare[1][stat]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* RESTORED SPIRIT POKEMON QUIZ */}
        {activePage === "spirit" && (
          <section className="spirit-quiz">
            <h2>Discover your spirit Pokémon</h2>
            <p>Answer a few fun questions and discover which Pokémon matches your personality!</p>
            <button className="start-quiz-btn" onClick={() => { setQuizStep(1); setQuizAnswers([]); setSpiritResult(null); }}>
              Start Quiz
            </button>

            {quizStep > 0 && (
              <div className="quiz-modal">
                <div className="quiz-content">
                  {quizStep <= quizQuestions.length ? (
                    <>
                      <h3>Question {quizStep} of {quizQuestions.length}</h3>
                      <p>{quizQuestions[quizStep - 1].question}</p>
                      {quizQuestions[quizStep - 1].options.map((opt, idx) => (
                        <button key={opt} onClick={() => {
                          setQuizAnswers([...quizAnswers, opt]);
                          if (quizStep === quizQuestions.length) {
                            // Quiz acabou, calcular resultado usando o dataset
                            const allAnswers = quizAnswers.concat(opt);
                            
                            // Mapear respostas para stats (Attack, Defense, HP, Sp. Atk, Sp. Def, Speed)
                            const statWeights = { Attack: 0, Defense: 0, HP: 0, "Sp. Atk": 0, "Sp. Def": 0, Speed: 0 };
                            
                            allAnswers.forEach(answer => {
                              const a = answer.toLowerCase();
                              // Quick strikes / maximum force / damage → Attack
                              if (a.includes("quick") || a.includes("powerful") || a.includes("damage") || a.includes("offensive") || a.includes("power") || a.includes("strike first") || a.includes("sword")) {
                                statWeights.Attack += 3;
                              }
                              // Endure / tank / shield / stamina / defense → Defense/HP
                              if (a.includes("endure") || a.includes("tank") || a.includes("solid") || a.includes("stamina") || a.includes("shield") || a.includes("stay calm")) {
                                statWeights.Defense += 2;
                                statWeights.HP += 2;
                              }
                              // Strategic / special abilities / magic / clever → Sp. Atk
                              if (a.includes("strategic") || a.includes("creative") || a.includes("special") || a.includes("magic") || a.includes("puzzle") || a.includes("clever")) {
                                statWeights["Sp. Atk"] += 3;
                              }
                              // Speed / fast / first to act / agility → Speed
                              if (a.includes("fast") || a.includes("speed") || a.includes("first") || a.includes("agility") || a.includes("race") || a.includes("daggers")) {
                                statWeights.Speed += 3;
                              }
                              // Balanced / adapt → Sp. Def
                              if (a.includes("adapt") || a.includes("balanced")) {
                                statWeights["Sp. Def"] += 2;
                              }
                            });
                            
                            // Normalizar os pesos
                            const totalWeight = Object.values(statWeights).reduce((a, b) => a + b, 0) || 1;
                            const normalizedWeights = {
                              Attack: statWeights.Attack / totalWeight,
                              Defense: statWeights.Defense / totalWeight,
                              HP: statWeights.HP / totalWeight,
                              "Sp. Atk": statWeights["Sp. Atk"] / totalWeight,
                              "Sp. Def": statWeights["Sp. Def"] / totalWeight,
                              Speed: statWeights.Speed / totalWeight
                            };
                            
                            // Encontrar o melhor Pokemon no dataset
                            let bestMatch = null;
                            let bestScore = -1;
                            
                            pokemon.forEach(p => {
                              // Calcular score de similaridade
                              const pStats = {
                                Attack: Number(p.Attack) || 0,
                                Defense: Number(p.Defense) || 0,
                                HP: Number(p.HP) || 0,
                                "Sp. Atk": Number(p["Sp. Atk"]) || 0,
                                "Sp. Def": Number(p["Sp. Def"]) || 0,
                                Speed: Number(p.Speed) || 0
                              };
                              
                              // Normalizar stats do Pokemon (0-1 baseado no max do dataset)
                              const maxStats = { Attack: 194, Defense: 230, HP: 255, "Sp. Atk": 194, "Sp. Def": 230, Speed: 180 };
                              const normPStats = {
                                Attack: pStats.Attack / maxStats.Attack,
                                Defense: pStats.Defense / maxStats.Defense,
                                HP: pStats.HP / maxStats.HP,
                                "Sp. Atk": pStats["Sp. Atk"] / maxStats["Sp. Atk"],
                                "Sp. Def": pStats["Sp. Def"] / maxStats["Sp. Def"],
                                Speed: pStats.Speed / maxStats.Speed
                              };
                              
                              // Calcular score (produto escalar dos vetores normalizados)
                              let score = 0;
                              Object.keys(normalizedWeights).forEach(stat => {
                                score += normalizedWeights[stat] * normPStats[stat];
                              });
                              
                              if (score > bestScore) {
                                bestScore = score;
                                bestMatch = p;
                              }
                            });
                            
                            // Criar resultado
                            const result = {
                              name: bestMatch?.Name || "Unknown",
                              img: bestMatch ? getPokemonImageUrl(bestMatch) : null,
                              desc: bestMatch ? `Your stats: Attack ${bestMatch.Attack}, Defense ${bestMatch.Defense}, HP ${bestMatch.HP}, Speed ${bestMatch.Speed}` : "No match found"
                            };
                            
                            setSpiritResult(result);
                            setQuizStep(0);
                          } else {
                            setQuizStep(quizStep + 1);
                          }
                        }}>{opt}</button>
                      ))}
                      <button className="close-quiz-btn" onClick={() => { setQuizStep(0); setQuizAnswers([]); setSpiritResult(null); }}>Close</button>
                    </>
                  ) : null}
                </div>
              </div>
            )}

            {spiritResult && (
              <div className="quiz-result">
                <h3>Your spirit Pokémon is:</h3>
                <img src={spiritResult.img} alt={spiritResult.name} style={{width: "140px", margin: "18px auto", display: "block"}} />
                <div className="spirit-name" style={{fontSize: "1.5rem", fontWeight: 700, marginBottom: 10}}>{spiritResult.name}</div>
                <div className="spirit-desc" style={{marginBottom: 18}}>{spiritResult.desc}</div>
                <button className="start-quiz-btn" onClick={() => { setQuizStep(1); setQuizAnswers([]); setSpiritResult(null); }}>Try Again</button>
              </div>
            )}
          </section>
        )}

        {loading && <div className="status">Loading dataset…</div>}
        {error && <div className="status status-error">{error}</div>}

        {activePage === "exploration" && !loading && !error && (
          <>
            <section>
              <h2>Dataset overview</h2>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Image</th>
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
                    {datasetHead.map((row, index) => {
                      const imgUrl = getPokemonImageUrl(row);
                      return (
                        <tr key={`${row.Name}-${index}`}>
                          <td>
                            {imgUrl && (
                              <img 
                                src={imgUrl} 
                                alt={row.Name} 
                                style={{width: "40px", height: "40px", objectFit: "contain"}} 
                              />
                            )}
                          </td>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>

      {/* STICKY WORTEN-STYLE BATTLE BAR */}
      {(pokemonToCompare[0] || pokemonToCompare[1]) && activePage !== "compare" && (
        <div className="sticky-battle-bar">
          <div className="battle-slots">
            <div className={`battle-slot ${pokemonToCompare[0] ? 'filled' : ''}`}>
              {pokemonToCompare[0] ? (
                <><img src={getPokemonImageUrl(pokemonToCompare[0])} className="slot-img" alt=""/> {pokemonToCompare[0].Name}</>
              ) : "Select Fighter 1..."}
            </div>
            <div className="battle-vs">VS</div>
            <div className={`battle-slot ${pokemonToCompare[1] ? 'filled' : ''}`}>
              {pokemonToCompare[1] ? (
                <><img src={getPokemonImageUrl(pokemonToCompare[1])} className="slot-img" alt=""/> {pokemonToCompare[1].Name}</>
              ) : "Select Fighter 2..."}
            </div>
          </div>
          <div className="sticky-actions">
            <button 
              className="battle-btn" 
              onClick={() => setActivePage("compare")}
              disabled={!pokemonToCompare[0] || !pokemonToCompare[1]}
            >
              Start Battle!
            </button>
            <button className="clear-btn" onClick={() => setPokemonToCompare([null, null])}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;