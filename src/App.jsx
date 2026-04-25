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
    { id: "spirit", label: "Discover your spirit Pokémon" },
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
        {activePage === "exploration" && (
          <>
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
          </>
        )}

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
