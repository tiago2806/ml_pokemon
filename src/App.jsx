import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import mlData from './ml_data.json';


// Função para criar os ícones das 18 ilhas
const createIslandIcon = (typeName) => {
  return new L.Icon({
    iconUrl: `/islands/island_${typeName.toLowerCase()}.png`, // Caminho para as tuas imagens cortadas
    iconSize: [160, 160], // Tamanho da ilha no mapa
    iconAnchor: [80, 80], // Ponto central
    popupAnchor: [0, -80] // Onde o popup aparece
  });
};

// Coordenadas [Y, X] das 18 Ilhas no oceano infinito
const islandClusters = [
  { type: "Fire", coords: [900, 100] },
  { type: "Water", coords: [800, 500] },
  { type: "Grass", coords: [950, 900] },
  { type: "Electric", coords: [680, 300] },
  { type: "Ice", coords: [600, 650] },
  { type: "Fighting", coords: [350, 0] },
  { type: "Poison", coords: [400, 500] },
  { type: "Ground", coords: [180, 950] },
  { type: "Flying", coords: [50, 350] },
  { type: "Psychic", coords: [0, 670] },
  { type: "Bug", coords: [1000, 350] },
  { type: "Rock", coords: [1100, 650] },
  { type: "Ghost", coords: [700, -20] },
  { type: "Dragon", coords: [700, 880] },
  { type: "Dark", coords: [500, 200] },
  { type: "Steel", coords: [450, 850] },
  { type: "Fairy", coords: [250, 300] },
  { type: "Normal", coords: [250, 650] }
];
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
  const [activeClusterTab, setActiveClusterTab] = useState("kmeans");
  const [searchName, setSearchName] = useState("");
  const [evolutionChain, setEvolutionChain] = useState([]);
  const [cardResults, setCardResults] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState(null);
  const [showHero, setShowHero] = useState(true); // Começa como true para mostrar a capa
  const [heroPokemons, setHeroPokemons] = useState([]); // Para as imagens aleatórias
  const [isFighting, setIsFighting] = useState(false);

  const [currentTip, setCurrentTip] = useState(""); // Guarda a dica do dia

  // Lista de dicas (podes adicionar mais sobre ML e Clustering)
  const mlTips = [
    "Clustering insight: Pokémon with similar total stats often inhabit the same 'islands'.",
    "Type Advantage: Double types (like Water/Flying) often have unique placement in our ML clusters.",
    "Data Tip: Speed is often the deciding factor in our matchup predictor algorithm.",
    "ML Concept: We used K-Means to group Pokémon by their combat DNA (Base Stats)."
  ];

  // Escolhe uma dica aleatória ao carregar
  useEffect(() => {
    const randomTip = mlTips[Math.floor(Math.random() * mlTips.length)];
    setCurrentTip(randomTip);
  }, []);

  // Filter states
  const [filterType, setFilterType] = useState("");
  const [filterGeneration, setFilterGeneration] = useState("");
  const [filterLegendary, setFilterLegendary] = useState("");
  const [filterCluster, setFilterCluster] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 10;
  const [selectedPokemon, setSelectedPokemon] = useState(null);

  // Arena (Drag & Drop) states
  const [fighters, setFighters] = useState([null, null]);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [arenaExpanded, setArenaExpanded] = useState(false);

  // Pokemon World animation
  const [worldTime, setWorldTime] = useState(0);

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
    { id: "pokemonWorld", label: "Pokémon World" },
    { id: "charts", label: "Charts & Stats" },
    { id: "spirit", label: "Spirit Pokémon" },
    { id: "clusters", label: "Clusters (ML)" },
  ];

  /// --- POKEMON WORLD LIVING SPRITES LOGIC (STAGGERED + SMALL RADIUS) ---
  const [mapSprites, setMapSprites] = useState([]);

  useEffect(() => {
    if (!pokemon || pokemon.length === 0 || activePage !== "pokemonWorld") return;

    // 1. Initial setup: 5 Pokemon per island, tight radius, staggered timers
    const initialSprites = [];
    islandClusters.forEach(island => {
      const typeMons = pokemon.filter(p => p["Type 1"] === island.type || p["Type 2"] === island.type);
      if (typeMons.length === 0) return;

      const shuffled = [...typeMons].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 5); // 5 is the sweet spot for the island size

      selected.forEach((p, index) => {
        const offsetY = (Math.random() - 0.5) * 80;  // Keeps them out of the water
        const offsetX = (Math.random() - 0.5) * 100;

        initialSprites.push({
          id: `${island.type}-${index}`,
          pokemon: p,
          islandType: island.type,
          islandCoords: island.coords,
          coords: [island.coords[0] + offsetY, island.coords[1] + offsetX],
          animDelay: `${(Math.random() * 2).toFixed(2)}s`,
          // Stagger expiration so they don't refresh all at once!
          expireAt: Date.now() + ((index + 1) * 4000) + (Math.random() * 2000)
        });
      });
    });

    setMapSprites(initialSprites);

    // 2. The "Heartbeat": Check every 1 second to see if ONE pokemon needs swapping
    const interval = setInterval(() => {
      setMapSprites(currentSprites => {
        const now = Date.now();
        let needsUpdate = false;

        const updatedSprites = currentSprites.map(sprite => {
          if (now >= sprite.expireAt) {
            needsUpdate = true;
            const typeMons = pokemon.filter(p => p["Type 1"] === sprite.islandType || p["Type 2"] === sprite.islandType);
            const randomNewMon = typeMons[Math.floor(Math.random() * typeMons.length)];

            const offsetY = (Math.random() - 0.5) * 80;
            const offsetX = (Math.random() - 0.5) * 100;

            return {
              ...sprite,
              pokemon: randomNewMon,
              coords: [sprite.islandCoords[0] + offsetY, sprite.islandCoords[1] + offsetX],
              expireAt: now + 15000 + (Math.random() * 5000), // Live for 15-20 seconds
              updateKey: now // Forces a clean CSS fade-in
            };
          }
          return sprite;
        });

        return needsUpdate ? updatedSprites : currentSprites;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [pokemon, activePage]);

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

  useEffect(() => {
    if (pokemon.length > 0 && heroPokemons.length === 0) {
      // Escolhe 8 pokémons aleatórios do teu dataset para o fundo
      const shuffled = [...pokemon].sort(() => 0.5 - Math.random());
      setHeroPokemons(shuffled.slice(0, 8));
    }
  }, [pokemon]);

  // Animation for Pokemon World
  useEffect(() => {
    const interval = setInterval(() => {
      setWorldTime(t => t + 1);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const datasetHead = useMemo(() => pokemon.slice(0, 5), [pokemon]);

  const clusterMap = useMemo(() => {
    const map = {};
    if (mlData && mlData.pca) {
      mlData.pca.forEach(p => {
        map[p.name] = p.cluster;
      });
    }
    return map;
  }, []);

  const filteredPokemon = useMemo(() => {
    return pokemon.filter(p => {
      if (filterType && p["Type 1"] !== filterType && p["Type 2"] !== filterType) return false;
      if (filterGeneration && p["Generation"] !== filterGeneration) return false;
      if (filterLegendary === "true" && p["Legendary"] !== "True") return false;
      if (filterLegendary === "false" && p["Legendary"] === "True") return false;
      if (filterCluster !== "") {
        const pCluster = clusterMap[p.Name];
        if (pCluster === undefined || String(pCluster) !== filterCluster) return false;
      }
      return true;
    });
  }, [pokemon, filterType, filterGeneration, filterLegendary, filterCluster, clusterMap]);

  useEffect(() => {
    setCurrentPage(0);
    setSelectedPokemon(null);
  }, [filterType, filterGeneration, filterLegendary, filterCluster]);

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
  // 1. O ESTADO PARA GUARDAR OS RECENTES (Coloca isto junto aos outros const [..., set...])
  const [recentSearches, setRecentSearches] = useState([]);

  // 2. A LÓGICA QUE GUARDA AUTOMATICAMENTE (Cola isto abaixo do searchImageUrl)
  useEffect(() => {
    if (searchResult) {
      setRecentSearches(prev => {
        if (prev.find(p => p.Name === searchResult.Name)) return prev;
        return [searchResult, ...prev].slice(0, 4);
      });
    }
  }, [searchResult]);

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
      <header className="glass-header">
        <div className="logo-group" onClick={() => setShowHero(true)}>
          <img
            src="https://www.pngplay.com/wp-content/uploads/2/Pokeball-PNG-Photo-Image.png"
            alt="Pokéball"
            className="scanning-poke"
          />
          <h1 className="gradient-title">Pokémon ML Explorer</h1>
        </div>

        <nav className="app-nav">
          {menuItems.map((item) => (
            <button
              key={item.id}
              className={`nav-link ${activePage === item.id ? "active" : ""}`}
              onClick={() => setActivePage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {showHero && (
        <div className="hero-section">
          <div className="hero-carousel">
            {heroPokemons.map((p, i) => (
              <img key={i} src={getPokemonImageUrl(p)} alt="" className="hero-bg-img" />
            ))}
          </div>
          <div className="hero-content">
            <h2 className="hero-title">Machine Learning meets the Pokémon World</h2>
            <p className="hero-subtitle">Unveiling hidden patterns, base stats, and type advantages through data science.</p>
            <div className="hero-mini-stats">
              <div className="mini-stat"><strong>{pokemon.length}</strong><span>Entries</span></div>
              <div className="mini-stat"><strong>{allTypes.length}</strong><span>Types</span></div>
              <div className="mini-stat"><strong>{allGenerations.length}</strong><span>Gens</span></div>
            </div>
            <button className="start-button" onClick={() => setShowHero(false)}>
              Get Started
            </button>
          </div>
        </div>
      )}

      <main>
        {!showHero ? (
          <>
            {/* --- DASHBOARD PAGE --- */}
            {activePage === "exploration" && (
              <section>
                <div className="page-header">
                  <h2>Dashboard & Analysis</h2>
                  <p>Filter the dataset and explore the Pokémon world through data!</p>
                </div>

                {!loading && !error && (
                  <>
                    {/* Top Row: About Section Only - Arena moved to sticky bottom */}
                    {/* TOP DASHBOARD WIDGETS */}
                    <div className="dashboard-widgets-container">
                      {/* Left Column: Insights & Recent */}
                      <div className="left-widgets">
                        {/* Card 1: Tip of the Day */}
                        <div className="info-card tip-card">
                          <div className="card-icon">💡</div>
                          <div className="card-content">
                            <div className="tip-card-header">
                              <h4>ML Insight</h4>
                            </div>
                            <p>{currentTip}</p>
                          </div>
                        </div>

                        {/* Card 2: Recent Searches */}
                        <div className="info-card recent-card">
                          <div className="card-icon">🔍</div>
                          <div className="card-content">
                            <div className="recent-card-header">
                              <h4>Recent Explorations</h4>
                            </div>
                            <div className="recent-list">
                              {recentSearches.length > 0 ? (
                                recentSearches.map((p, i) => (
                                  <div
                                    key={i}
                                    className="recent-item"
                                    draggable="true"
                                    onDragStart={() => { setDraggedItem(p); }}
                                    onDragEnd={() => setDraggedItem(null)}
                                    onClick={() => setSearchTerm(p.Name.toLowerCase())}
                                  >
                                    <img src={getPokemonImageUrl(p)} alt={p.Name} />
                                    <span>{p.Name}</span>
                                  </div>
                                ))
                              ) : (
                                <p className="no-recent">No recent searches yet.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Column: BATTLE STADIUM WIDGET */}
                      <div className="right-widget battle-stadium-section widget-mode">
                        <div className="stadium-header">
                          <h3>Battle Stadium ⚔️</h3>
                          <p>Drop two Pokémon here!</p>
                        </div>
                        
                        <div className="stadium-arena">
                          {/* Slot 1 */}
                          <div 
                            className={`stadium-slot ${fighters[0] ? 'filled' : ''} ${dropTarget === 0 ? 'drag-over' : ''}`}
                            onDragOver={e => { e.preventDefault(); setDropTarget(0); }}
                            onDragLeave={() => setDropTarget(null)}
                            onDrop={() => { if (draggedItem) { const n = [...fighters]; n[0] = draggedItem; setFighters(n); setRecentSearches(prev => { if (prev.find(p => p.Name === draggedItem.Name)) return prev; return [draggedItem, ...prev].slice(0, 4); }); } setDropTarget(null); setIsFighting(false); }}
                          >
                            {fighters[0] ? (
                              <div className="stadium-fighter" style={{ position: 'relative' }}>
                                <button className="remove-fighter-btn" onClick={(e) => { e.stopPropagation(); const n = [...fighters]; n[0] = null; setFighters(n); setIsFighting(false); }}>×</button>
                                <img src={getPokemonImageUrl(fighters[0])} alt={fighters[0].Name} className="fighter-img" />
                                <div className="fighter-name">{fighters[0].Name}</div>
                                <div className="fighter-stats">Total: {fighters[0].Total}</div>
                              </div>
                            ) : (
                              <div className="stadium-empty">
                                <div className="empty-icon">+</div>
                                <span>Drop Here</span>
                              </div>
                            )}
                          </div>

                          {/* Center Controls */}
                          <div className="stadium-center">
                            {isFighting && fighters[0] && fighters[1] ? (
                              <div className="battle-result-announcement">
                                {(() => {
                                  const p1 = fighters[0];
                                  const p2 = fighters[1];
                                  const p1Multi = getTypeMultiplier(p1["Type 1"], p2["Type 1"]);
                                  const p2Multi = getTypeMultiplier(p2["Type 1"], p1["Type 1"]);
                                  const p1Score = Number(p1.Total) * p1Multi;
                                  const p2Score = Number(p2.Total) * p2Multi;

                                  let title = "It's a Tie!";
                                  let winnerClass = "tie";
                                  if (p1Score > p2Score) { title = `${p1.Name} Wins!`; winnerClass = "p1-win"; }
                                  if (p2Score > p1Score) { title = `${p2.Name} Wins!`; winnerClass = "p2-win"; }

                                  return (
                                    <div className={`result-box ${winnerClass}`}>
                                      <strong className="winner-title">{title}</strong>
                                      <p className="narrative-text" style={{ fontSize: '0.75rem', marginBottom: '12px', lineHeight: '1.4' }}>
                                        {generateBattleNarrative(p1, p2, p1Score, p2Score, p1Multi, p2Multi)}
                                      </p>
                                      <button className="reset-battle-btn" onClick={() => setIsFighting(false)}>Reset Match</button>
                                    </div>
                                  );
                                })()}
                              </div>
                            ) : fighters[0] && fighters[1] ? (
                              <button className="fight-button glow-effect" onClick={() => setIsFighting(true)}>
                                FIGHT!
                              </button>
                            ) : (
                              <div className="stadium-vs">VS</div>
                            )}
                          </div>

                          {/* Slot 2 */}
                          <div 
                            className={`stadium-slot ${fighters[1] ? 'filled' : ''} ${dropTarget === 1 ? 'drag-over' : ''}`}
                            onDragOver={e => { e.preventDefault(); setDropTarget(1); }}
                            onDragLeave={() => setDropTarget(null)}
                            onDrop={() => { if (draggedItem) { const n = [...fighters]; n[1] = draggedItem; setFighters(n); setRecentSearches(prev => { if (prev.find(p => p.Name === draggedItem.Name)) return prev; return [draggedItem, ...prev].slice(0, 4); }); } setDropTarget(null); setIsFighting(false); }}
                          >
                            {fighters[1] ? (
                              <div className="stadium-fighter" style={{ position: 'relative' }}>
                                <button className="remove-fighter-btn" onClick={(e) => { e.stopPropagation(); const n = [...fighters]; n[1] = null; setFighters(n); setIsFighting(false); }}>×</button>
                                <img src={getPokemonImageUrl(fighters[1])} alt={fighters[1].Name} className="fighter-img" />
                                <div className="fighter-name">{fighters[1].Name}</div>
                                <div className="fighter-stats">Total: {fighters[1].Total}</div>
                              </div>
                            ) : (
                              <div className="stadium-empty">
                                <div className="empty-icon">+</div>
                                <span>Drop Here</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {(fighters[0] || fighters[1]) && !isFighting && (
                           <div style={{textAlign: "center", marginTop: "16px"}}>
                              <button className="clear-arena-btn" onClick={() => { setFighters([null, null]); setIsFighting(false); }}>
                                Clear Arena
                              </button>
                           </div>
                        )}
                      </div>
                    </div>

                    <div className="dataset-overview">
                      <div className="dashboard-card premium-filters-card">
                        <div className="filters-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '20px', flexWrap: 'wrap' }}>
                          <div className="filters-title-area">
                            <h3 style={{ fontSize: '1.6rem', margin: '0 0 5px', color: '#1e293b' }}>Explore & Select</h3>
                            <p style={{ color: '#64748b', margin: 0 }}>Discover Pokémon by filtering through the dataset</p>
                          </div>
                          
                          <div className="premium-search-container" style={{ margin: 0, flex: '1', minWidth: '400px', maxWidth: '650px' }}>
                            <span className="search-icon">🔍</span>
                            <input value={searchName} onChange={(e) => setSearchName(e.target.value)} placeholder="Search by name (e.g. Pikachu)" className="premium-search-input" />
                          </div>
                        </div>

                        <div className="premium-filters-grid">
                          <div className="filter-group">
                            <label className="filter-label">Element Type</label>
                            <div className="select-wrapper">
                              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="premium-select">
                                <option value="">All Types</option>{allTypes.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                          </div>
                          
                          <div className="filter-group">
                            <label className="filter-label">Generation</label>
                            <div className="select-wrapper">
                              <select value={filterGeneration} onChange={(e) => setFilterGeneration(e.target.value)} className="premium-select">
                                <option value="">All Generations</option>{allGenerations.map(g => <option key={g} value={g}>Generation {g}</option>)}
                              </select>
                            </div>
                          </div>
                          
                          <div className="filter-group">
                            <label className="filter-label">Legendary Status</label>
                            <div className="select-wrapper">
                              <select value={filterLegendary} onChange={(e) => setFilterLegendary(e.target.value)} className="premium-select">
                                <option value="">Any</option><option value="true">Legendary Only</option><option value="false">Non-Legendary</option>
                              </select>
                            </div>
                          </div>
                          
                          <div className="filter-group highlight-filter">
                            <label className="filter-label">Combat Role (ML Cluster)</label>
                            <div className="select-wrapper">
                              <select value={filterCluster} onChange={(e) => setFilterCluster(e.target.value)} className="premium-select cluster-select">
                                <option value="">All Roles</option>
                                <option value="0">Balanced</option>
                                <option value="1">Physical Attacker</option>
                                <option value="2">Low Stats (weak)</option>
                                <option value="3">Special Attacker</option>
                                <option value="4">Wall/Tank</option>
                                <option value="5">Tank/Defensive</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* The Full Search Details Panel (WITH DRAG HINT) */}
                        {/* The Full Search Details Panel (WITH DRAG HINT) */}
                        {searchResult && (
                          <div className="pokemon-details" style={{ marginTop: '20px' }}>
                            <div className="pokemon-card">
                              <div className="drag-hint-container">
                                <img
                                  className="pokemon-image"
                                  src={searchImageUrl}
                                  alt={searchResult.Name}
                                  draggable="true"
                                  onDragStart={() => { setDraggedItem(searchResult); }}
                                  onDragEnd={() => setDraggedItem(null)}
                                  style={{ cursor: 'grab' }}
                                />
                                <div className="drag-badge">DRAG ME</div>
                              </div>

                              {/* Os Stats agora vivem AQUI DENTRO, ao lado da imagem */}
                              <div className="pokemon-detail-copy">
                                <div className="name-type-row">
                                  <h4>{searchResult.Name}</h4>
                                  <div className="type-badges">
                                    <span className={`type-badge ${searchResult["Type 1"]?.toLowerCase()}`}>{searchResult["Type 1"]}</span>
                                    {searchResult["Type 2"] && <span className={`type-badge ${searchResult["Type 2"].toLowerCase()}`}>{searchResult["Type 2"]}</span>}
                                  </div>
                                </div>

                                <div className="emoji-stat-grid">
                                  <div className="stat-item"><span>❤️ HP:</span> <strong>{searchResult.HP}</strong></div>
                                  <div className="stat-item"><span>⚔️ Attack:</span> <strong>{searchResult.Attack}</strong></div>
                                  <div className="stat-item"><span>🛡️ Defense:</span> <strong>{searchResult.Defense}</strong></div>
                                  <div className="stat-item"><span>⚡ Speed:</span> <strong>{searchResult.Speed}</strong></div>
                                  <div className="stat-item total"><span>⭐ Total:</span> <strong>{searchResult.Total}</strong></div>
                                </div>
                              </div>
                            </div>

                            {lookupLoading && <div className="status">Loading evolutions and cards…</div>}
                            {!lookupLoading && !lookupError && evolutionChain.length > 0 && (
                              <div className="lookup-section">
                                <h4>Evolution chain</h4>
                                <div className="breadcrumb-chain">
                                  {evolutionChain.map((name, idx) => (
                                    <span key={name} className="breadcrumb-item">
                                      {name.charAt(0).toUpperCase() + name.slice(1)}
                                      {idx < evolutionChain.length - 1 && <span className="arrow">➔</span>}
                                    </span>
                                  ))}
                                </div>
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
                          <div className="filtered-grid" style={{ marginTop: '20px' }}>
                            <div className="filter-results" style={{ marginBottom: "14px" }}>
                              Found {filteredPokemon.length} Pokémon (Drag them into the Arena above!)
                            </div>
                            <div className="pokemon-grid">
                              {paginatedPokemon.map((p) => (
                                <div
                                  key={p.Name}
                                  className="pokemon-grid-item"
                                  draggable="true"
                                  onDragStart={() => { setDraggedItem(p); }}
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

                        {/* Click Details for Grid items - WITH DRAG */}
                        {selectedPokemon && !searchName && (
                          <div className="selected-pokemon" style={{ marginTop: '20px' }}>
                            <button className="back-btn" onClick={() => setSelectedPokemon(null)}>← Back to results</button>
                            <div className="pokemon-card">
                              <div className="drag-hint-container">
                                <img
                                  className="pokemon-image"
                                  src={getPokemonImageUrl(selectedPokemon)}
                                  alt={selectedPokemon.Name}
                                  draggable="true"
                                  onDragStart={() => { setDraggedItem(selectedPokemon); }}
                                  onDragEnd={() => setDraggedItem(null)}
                                  style={{ cursor: 'grab' }}
                                />
                                <div className="drag-badge">DRAG ME</div>
                              </div>
                              <div className="pokemon-detail-copy">
                                <div className="name-type-row">
                                  <h4>{selectedPokemon.Name}</h4>
                                  <div className="type-badges">
                                    <span className={`type-badge ${selectedPokemon["Type 1"]?.toLowerCase()}`}>{selectedPokemon["Type 1"]}</span>
                                    {selectedPokemon["Type 2"] && <span className={`type-badge ${selectedPokemon["Type 2"].toLowerCase()}`}>{selectedPokemon["Type 2"]}</span>}
                                  </div>
                                </div>

                                <div className="emoji-stat-grid">
                                  <div className="stat-item"><span>❤️ HP:</span> <strong>{selectedPokemon.HP}</strong></div>
                                  <div className="stat-item"><span>⚔️ Attack:</span> <strong>{selectedPokemon.Attack}</strong></div>
                                  <div className="stat-item"><span>🛡️ Defense:</span> <strong>{selectedPokemon.Defense}</strong></div>
                                  <div className="stat-item"><span>⚡ Speed:</span> <strong>{selectedPokemon.Speed}</strong></div>
                                  <div className="stat-item total"><span>⭐ Total:</span> <strong>{selectedPokemon.Total}</strong></div>
                                </div>
                              </div>
                            </div>

                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* RAW DATA TABLE RESTORED */}
                {!loading && !error && (
                  <section style={{ marginTop: '40px' }}>
                    <h2 className="premium-section-title">Dataset Overview</h2>
                    <p style={{ marginBottom: '16px', color: '#64748b' }}>Drag any Pokémon into the Battle Arena!</p>
                    <div className="table-wrapper">
                      <table>
                        <thead>
                          <tr><th>Image</th><th>#</th><th>Name</th><th>Type 1</th><th>Type 2</th><th>Total</th><th>HP</th><th>Attack</th><th>Defense</th><th>Speed</th></tr>
                        </thead>
                        <tbody>
                          {pokemon.map((row, index) => {
                            const imgUrl = getPokemonImageUrl(row);
                            return (
                              <tr
                                key={`${row.Name}-${index}`}
                                draggable="true"
                                onDragStart={() => { setDraggedItem(row); }}
                                onDragEnd={() => setDraggedItem(null)}
                                style={{ cursor: 'grab' }}
                              >
                                <td>{imgUrl && <img src={imgUrl} alt={row.Name} style={{ width: "40px", height: "40px", objectFit: "contain" }} />}</td>
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

            {/* --- POKÉMON WORLD MAP V4 (INTERATIVO COM LEAFLET) --- */}
            {activePage === "pokemonWorld" && (
              <section className="pokemon-world-page">
                <div className="page-header">
                  <h2>Pokémon Archipelago</h2>
                  <p>Explore as 18 ilhas de clusters. Arrastar para mover, scroll para fazer zoom.</p>
                </div>

                {!loading && !error && pokemon.length > 0 && (
                  <div className="pokemon-world-map">
                    <MapContainer
                      center={[550, 500]} // Ponto inicial da câmara
                      zoom={0} // Zoom inicial
                      minZoom={-1} // Permite afastar
                      maxZoom={2} // Permite aproximar muito
                      crs={L.CRS.Simple} // Crucial: Diz ao mapa que não é o planeta Terra, é um plano infinito
                      style={{ height: '100%', width: '100%' }}
                    >
                      {/* 1. Loop to render the 18 Islands */}
                      {islandClusters.map((island) => (
                        <Marker key={island.type} position={island.coords} icon={createIslandIcon(island.type)}>
                          <Popup className="custom-popup">
                            <b>{island.type} Island</b><br />
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>ML Cluster Data Here</span>
                          </Popup>
                        </Marker>
                      ))}

                      {/* Loop to render the randomly changing, floating Pokémon */}
                      {mapSprites.map(sprite => (
                        <Marker
                          key={`${sprite.id}-${sprite.updateKey || 0}`}
                          position={sprite.coords}
                          icon={L.divIcon({
                            className: 'pokemon-sprite-marker',
                            html: `<img src="${getPokemonImageUrl(sprite.pokemon)}" class="pokemon-sprite-img" style="animation-delay: ${sprite.animDelay};" alt="${sprite.pokemon.Name}" />`,
                            iconSize: [45, 45],
                            iconAnchor: [22, 22]
                          })}
                        >
                          <Popup className="custom-popup">
                            <b>{sprite.pokemon.Name}</b><br />
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                              Total Stats: {sprite.pokemon.Total}
                            </span>
                          </Popup>
                        </Marker>
                      ))}
                    </MapContainer>
                  </div>
                )}
              </section>
            )}

            {/* --- CLUSTERS (ML) PAGE --- */}
            {activePage === "clusters" && (
              <section className="clusters-page">
                <div className="page-header clusters-header">
                  <h2 className="clusters-title">Unsupervised Learning: Pokémon Clusters</h2>
                  <p>Grouping Pokémon purely by their base stats (HP, Attack, Defense, etc.)</p>
                </div>
                
                <div className="cluster-tabs-nav">
                  <button 
                    className={activeClusterTab === "kmeans" ? "active" : ""} 
                    onClick={() => setActiveClusterTab("kmeans")}
                  >
                    K-Means
                  </button>
                  <button 
                    className={activeClusterTab === "hierarchical" ? "active" : ""} 
                    onClick={() => setActiveClusterTab("hierarchical")}
                  >
                    Hierarchical
                  </button>
                </div>

                <div className="clusters-content-grid">
                  
                  {activeClusterTab === "kmeans" && (
                    <>
                      {/* Elbow & Silhouette */}
                      <div className="cluster-card centered-card">
                        <h3>Determining the Best K</h3>
                        <p>Using the Elbow Method and Silhouette Scores to find the optimal number of clusters.</p>
                        <div className="cluster-images-row">
                          <div className="cluster-img-container">
                            <h4>Elbow Method (Inertia)</h4>
                            <img src="/cluster_img_1.png" alt="Elbow Method Graph" className="ml-img" />
                            <p className="caption">The optimal 'k' is where the inertia curve begins to flatten (the 'elbow').</p>
                          </div>
                          <div className="cluster-img-container">
                            <h4>Silhouette Method</h4>
                            <img src="/cluster_img_2.png" alt="Silhouette Score Graph" className="ml-img" />
                            <p className="caption">A higher score indicates better-defined clusters. The peak determines our 'best k'.</p>
                          </div>
                        </div>
                      </div>

                      {/* PCA Visualization */}
                      <div className="cluster-card centered-card pca-card full-width-card">
                        <h3>2D Projection (PCA) Scatter Plot</h3>
                        <p>Compressing multi-dimensional stats into a 2D space to visualize the clusters.</p>
                        
                        <div className="cluster-images-row" style={{ justifyContent: 'center' }}>
                          <div className="cluster-img-container" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
                            <h4>Cluster Scatter Plot</h4>
                            <img src="/cluster_img_4.png" alt="PCA Scatter Plot" className="ml-img" style={{ maxWidth: '100%' }} />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {activeClusterTab === "hierarchical" && (
                    <div className="cluster-card centered-card full-width-card">
                      {/* Hierarchical Clustering */}
                      <h3>Hierarchical Clustering</h3>
                      <p>Building a tree of clusters to show the relationships and distances between different groupings.</p>
                      
                      <div className="cluster-images-row" style={{ justifyContent: 'center' }}>
                        <div className="cluster-img-container" style={{ maxWidth: '800px', margin: '0 auto' }}>
                          <h4>Dendrogram</h4>
                          <img src="/cluster_img_6.png" alt="Dendrogram Graph" className="ml-img" style={{ maxWidth: '100%' }} />
                          <p className="caption">The height of the vertical lines represents the distance between merged clusters.</p>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </section>
            )}

            {/* --- CHARTS PAGE --- */}
            {activePage === "charts" && (
              <section className="charts-page">
                <div className="page-header">
                  <h2>Charts & Statistics</h2>
                  <p>Explore the Pokémon dataset through visualizations.</p>
                </div>
                {!loading && !error && pokemon.length > 0 && (
                  <div className="charts-container">
                    {/* === SECTION: Overview === */}
                    <div className="charts-section-title" style={{ gridColumn:'1 / -1' }}>
                      <h3 style={{ margin:0, fontSize:'1.4rem', fontWeight:700, color:'#1e293b', display:'flex', alignItems:'center', gap:'10px' }}>
                        <span style={{ width:4, height:22, background:'linear-gradient(180deg,#6366f1,#818cf8)', borderRadius:2, display:'inline-block' }}></span>
                        Overview
                      </h3>
                      <p style={{ margin:'4px 0 0 14px', color:'#94a3b8', fontSize:'0.82rem' }}>General dataset statistics at a glance</p>
                    </div>

                    <div className="chart-card">
                      <h3>Which Stat Dominates?</h3>
                      <p style={{ color:'#64748b', fontSize:'0.85rem', marginBottom:'12px' }}>Average base stat across all Pokémon</p>
                      <div className="bar-chart">
                        {(() => {
                          const stats = ["HP","Attack","Defense","Sp. Atk","Sp. Def","Speed"];
                          const avgs = stats.map(s => ({ stat: s, avg: pokemon.reduce((a, p) => a + (Number(p[s]) || 0), 0) / pokemon.length }));
                          avgs.sort((a, b) => b.avg - a.avg);
                          const maxAvg = avgs[0].avg;
                          return avgs.map(({ stat, avg }) => (
                            <div key={stat} className="bar-row">
                              <span className="bar-label">{stat}</span>
                              <div className="bar-container"><div className="bar" style={{ width:`${(avg/maxAvg)*100}%` }}></div></div>
                              <span className="bar-value">{avg.toFixed(1)}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>

                    <div className="chart-card">
                      <h3>Typing Complexity</h3>
                      <p style={{ color:'#64748b', fontSize:'0.85rem', marginBottom:'12px' }}>Single-type vs Dual-type Pokémon</p>
                      {(() => {
                        let single=0, dual=0;
                        pokemon.forEach(p => { if (p["Type 2"]&&p["Type 2"]!=="nan"&&p["Type 2"]!=="") dual++; else single++; });
                        const total=single+dual;
                        return (
                          <div>
                            <div style={{ display:'flex', borderRadius:'12px', overflow:'hidden', height:'36px', marginBottom:'16px' }}>
                              <div style={{ width:`${(single/total)*100}%`, background:'#8AC926', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:'0.85rem' }}>{((single/total)*100).toFixed(1)}%</div>
                              <div style={{ width:`${(dual/total)*100}%`, background:'#FFCA3A', display:'flex', alignItems:'center', justifyContent:'center', color:'#1e293b', fontWeight:700, fontSize:'0.85rem' }}>{((dual/total)*100).toFixed(1)}%</div>
                            </div>
                            <div style={{ display:'flex', gap:'20px', fontSize:'0.85rem' }}>
                              <span style={{ display:'flex', alignItems:'center', gap:'8px' }}><span style={{ width:14, height:14, borderRadius:4, background:'#8AC926', display:'inline-block' }}></span>Single Type ({single})</span>
                              <span style={{ display:'flex', alignItems:'center', gap:'8px' }}><span style={{ width:14, height:14, borderRadius:4, background:'#FFCA3A', display:'inline-block' }}></span>Dual Type ({dual})</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* === SECTION: Generation Analysis === */}
                    <div className="charts-section-title" style={{ gridColumn:'1 / -1' }}>
                      <h3 style={{ margin:0, fontSize:'1.4rem', fontWeight:700, color:'#1e293b', display:'flex', alignItems:'center', gap:'10px' }}>
                        <span style={{ width:4, height:22, background:'linear-gradient(180deg,#6366f1,#818cf8)', borderRadius:2, display:'inline-block' }}></span>
                        Generation Analysis
                      </h3>
                      <p style={{ margin:'4px 0 0 14px', color:'#94a3b8', fontSize:'0.82rem' }}>How Pokémon evolve across generations</p>
                    </div>

                    <div className="chart-card">
                      <h3>Average Total Stats per Generation</h3>
                      <p style={{ color:'#64748b', fontSize:'0.85rem', marginBottom:'12px' }}>Overall power across generations</p>
                      <div style={{ display:'flex', alignItems:'flex-end', gap:'16px', height:'120px', padding:'0 4px' }}>
                        {(() => {
                          const gens = {};
                          pokemon.forEach(p => { const g=p["Generation"]; const t=Number(p["Total"])||0; if(!gens[g])gens[g]={sum:0,count:0}; gens[g].sum+=t; gens[g].count++; });
                          const entries = Object.entries(gens).sort((a,b)=>Number(a[0])-Number(b[0]));
                          const means = entries.map(([g,d])=>({ gen:g, mean:d.sum/d.count }));
                          const maxM = Math.max(...means.map(m=>m.mean));
                          const minM = Math.min(...means.map(m=>m.mean));
                          return means.map(({ gen, mean }) => (
                            <div key={gen} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' }}>
                              <span style={{ fontSize:'0.7rem', color:'#64748b', fontWeight:600 }}>{mean.toFixed(0)}</span>
                              <div style={{ width:'100%', background:'linear-gradient(180deg,#8b5cf6,#4338ca)', borderRadius:'6px 6px 0 0', height:`${((mean-minM+30)/(maxM-minM+30))*90}px`, minHeight:'16px' }}/>
                              <span style={{ fontSize:'0.75rem', fontWeight:700, color:'#1e293b' }}>G{gen}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>

                    <div className="chart-card">
                      <h3>Legendary vs Normal per Generation</h3>
                      <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginTop:'8px' }}>
                        {(() => {
                          const gens = {};
                          pokemon.forEach(p => { const g = p["Generation"]; if (!g) return; if (!gens[g]) gens[g]={normal:0,legendary:0}; if (p["Legendary"]==="True") gens[g].legendary++; else gens[g].normal++; });
                          return Object.entries(gens).sort((a,b)=>Number(a[0])-Number(b[0])).map(([gen,data]) => {
                            const total = data.normal+data.legendary;
                            const lPct = (data.legendary/total)*100;
                            return (
                              <div key={gen}>
                                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'3px', fontSize:'0.8rem', color:'#475569' }}>
                                  <span><strong>Gen {gen}</strong></span><span>{data.legendary} Leg. / {data.normal} Normal</span>
                                </div>
                                <div style={{ display:'flex', borderRadius:'8px', overflow:'hidden', height:'16px' }}>
                                  <div style={{ width:`${100-lPct}%`, background:'#4D96FF' }}/>
                                  <div style={{ width:`${lPct}%`, background:'#FF595E' }}/>
                                </div>
                              </div>
                            );
                          });
                        })()}
                        <div style={{ display:'flex', gap:'16px', marginTop:'2px', fontSize:'0.78rem' }}>
                          <span style={{ display:'flex', alignItems:'center', gap:'5px' }}><span style={{ width:10, height:10, borderRadius:3, background:'#4D96FF', display:'inline-block' }}></span>Normal</span>
                          <span style={{ display:'flex', alignItems:'center', gap:'5px' }}><span style={{ width:10, height:10, borderRadius:3, background:'#FF595E', display:'inline-block' }}></span>Legendary</span>
                        </div>
                      </div>
                    </div>

                    {/* Attack vs Defense per Generation */}
                    <div className="chart-card" style={{ gridColumn:'1 / -1' }}>
                      <h3>Attack vs Defense per Generation</h3>
                      <p style={{ color:'#64748b', fontSize:'0.85rem', marginBottom:'16px' }}>Average offensive vs defensive stats comparison</p>
                      <div style={{ display:'flex', alignItems:'flex-end', gap:'20px', padding:'0 8px' }}>
                        {(() => {
                          const gens = {};
                          pokemon.forEach(p => {
                            const g = p["Generation"]; if (!g) return;
                            if (!gens[g]) gens[g] = { atkSum:0, defSum:0, count:0 };
                            gens[g].atkSum += Number(p["Attack"]) || 0;
                            gens[g].defSum += Number(p["Defense"]) || 0;
                            gens[g].count++;
                          });
                          const entries = Object.entries(gens).sort((a,b) => Number(a[0]) - Number(b[0]));
                          const maxVal = Math.max(...entries.map(([,d]) => (d.atkSum + d.defSum) / d.count));
                          return entries.map(([gen, data]) => {
                            const avgAtk = data.atkSum / data.count;
                            const avgDef = data.defSum / data.count;
                            const totalH = 140;
                            const atkH = (avgAtk / maxVal) * totalH;
                            const defH = (avgDef / maxVal) * totalH;
                            return (
                              <div key={gen} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' }}>
                                <span style={{ fontSize:'0.68rem', color:'#64748b' }}>{avgAtk.toFixed(0)}+{avgDef.toFixed(0)}</span>
                                <div style={{ width:'100%', display:'flex', flexDirection:'column' }}>
                                  <div style={{ width:'100%', background:'#FF595E', borderRadius:'6px 6px 0 0', height:`${atkH}px` }} title={`Attack: ${avgAtk.toFixed(1)}`}/>
                                  <div style={{ width:'100%', background:'#6A4C93', borderRadius:'0 0 6px 6px', height:`${defH}px` }} title={`Defense: ${avgDef.toFixed(1)}`}/>
                                </div>
                                <span style={{ fontSize:'0.75rem', fontWeight:700, color:'#1e293b' }}>Gen {gen}</span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                      <div style={{ display:'flex', justifyContent:'center', gap:'20px', marginTop:'12px', fontSize:'0.8rem' }}>
                        <span style={{ display:'flex', alignItems:'center', gap:'6px' }}><span style={{ width:12, height:12, borderRadius:3, background:'#FF595E', display:'inline-block' }}></span>Attack</span>
                        <span style={{ display:'flex', alignItems:'center', gap:'6px' }}><span style={{ width:12, height:12, borderRadius:3, background:'#6A4C93', display:'inline-block' }}></span>Defense</span>
                      </div>
                    </div>

                    {/* === SECTION: Type Analysis === */}
                    <div className="charts-section-title" style={{ gridColumn:'1 / -1' }}>
                      <h3 style={{ margin:0, fontSize:'1.4rem', fontWeight:700, color:'#1e293b', display:'flex', alignItems:'center', gap:'10px' }}>
                        <span style={{ width:4, height:22, background:'linear-gradient(180deg,#6366f1,#818cf8)', borderRadius:2, display:'inline-block' }}></span>
                        Type Analysis
                      </h3>
                      <p style={{ margin:'4px 0 0 14px', color:'#94a3b8', fontSize:'0.82rem' }}>Breakdown by Pokémon primary type</p>
                    </div>

                    <div className="chart-card">
                      <h3>Average Strength by Primary Type</h3>
                      <p style={{ color:'#64748b', fontSize:'0.85rem', marginBottom:'12px' }}>Mean Total base stats per type</p>
                      <div className="bar-chart">
                        {(() => {
                          const totals = {}; const counts = {};
                          pokemon.forEach(p => { const t = p["Type 1"]; totals[t] = (totals[t]||0) + (Number(p["Total"])||0); counts[t] = (counts[t]||0) + 1; });
                          const sorted = Object.entries(totals).map(([t,s]) => ({ type:t, mean:s/counts[t] })).sort((a,b) => b.mean - a.mean);
                          const maxMean = sorted[0]?.mean || 1;
                          return sorted.map(({ type, mean }) => (
                            <div key={type} className="bar-row">
                              <span className="bar-label">{type}</span>
                              <div className="bar-container"><div className="bar" style={{ width:`${(mean/maxMean)*100}%` }}></div></div>
                              <span className="bar-value">{mean.toFixed(0)}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>

                    <div className="chart-card">
                      <h3>Pokémon Count by Primary Type</h3>
                      <p style={{ color:'#64748b', fontSize:'0.85rem', marginBottom:'12px' }}>Distribution of primary types</p>
                      <div className="bar-chart">
                        {(() => {
                          const counts = {};
                          pokemon.forEach(p => { const t = p["Type 1"]; counts[t] = (counts[t]||0)+1; });
                          const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
                          const maxCount = sorted[0]?.[1] || 1;
                          return sorted.map(([type, count]) => (
                            <div key={type} className="bar-row">
                              <span className="bar-label">{type}</span>
                              <div className="bar-container"><div className="bar" style={{ width:`${(count/maxCount)*100}%` }}></div></div>
                              <span className="bar-value">{count}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>

                    {/* === SECTION: Deep Analysis === */}
                    <div className="charts-section-title" style={{ gridColumn:'1 / -1' }}>
                      <h3 style={{ margin:0, fontSize:'1.4rem', fontWeight:700, color:'#1e293b', display:'flex', alignItems:'center', gap:'10px' }}>
                        <span style={{ width:4, height:22, background:'linear-gradient(180deg,#6366f1,#818cf8)', borderRadius:2, display:'inline-block' }}></span>
                        Deep Analysis
                      </h3>
                      <p style={{ margin:'4px 0 0 14px', color:'#94a3b8', fontSize:'0.82rem' }}>Advanced statistical visualizations</p>
                    </div>

                    {/* Stat Distribution Histograms */}
                    <div className="chart-card" style={{ gridColumn:'1 / -1' }}>
                      <h3>Pokémon Stat Distributions</h3>
                      <p style={{ color:'#64748b', fontSize:'0.9rem', marginBottom:'20px' }}>Frequency distribution of each base stat</p>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'20px' }}>
                        {(() => {
                          const statsInfo = [
                            { key:"HP", color:"#8AC926" }, { key:"Attack", color:"#FF595E" },
                            { key:"Defense", color:"#6A4C93" }, { key:"Sp. Atk", color:"#FFCA3A" },
                            { key:"Sp. Def", color:"#4D96FF" }, { key:"Speed", color:"#1982C4" }
                          ];
                          return statsInfo.map(({ key, color }) => {
                            const vals = pokemon.map(p => Number(p[key]) || 0);
                            const minV = Math.min(...vals); const maxV = Math.max(...vals);
                            const nBins = 20; const binW = (maxV - minV) / nBins || 1;
                            const bins = Array(nBins).fill(0);
                            vals.forEach(v => { let idx = Math.floor((v - minV) / binW); if (idx >= nBins) idx = nBins - 1; bins[idx]++; });
                            const maxCount = Math.max(...bins);
                            const svgW = 320; const svgH = 160; const pad = 40; const chartW = svgW - pad - 10; const chartH = svgH - pad - 10;
                            return (
                              <div key={key}>
                                <h4 style={{ textAlign:'center', margin:'0 0 8px', fontSize:'0.95rem', color:'#1e293b' }}>{key} Distribution</h4>
                                <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width:'100%', maxWidth:'400px', display:'block', margin:'0 auto' }}>
                                  {/* Y axis */}
                                  <line x1={pad} y1={5} x2={pad} y2={svgH - pad} stroke="#cbd5e1" strokeWidth="1"/>
                                  {/* X axis */}
                                  <line x1={pad} y1={svgH - pad} x2={svgW - 5} y2={svgH - pad} stroke="#cbd5e1" strokeWidth="1"/>
                                  {/* Y labels */}
                                  {[0, 0.25, 0.5, 0.75, 1].map(f => (
                                    <g key={f}>
                                      <text x={pad - 5} y={svgH - pad - f * chartH + 4} textAnchor="end" fontSize="9" fill="#94a3b8">{Math.round(maxCount * f)}</text>
                                      <line x1={pad} y1={svgH - pad - f * chartH} x2={svgW - 5} y2={svgH - pad - f * chartH} stroke="#e2e8f0" strokeWidth="0.5"/>
                                    </g>
                                  ))}
                                  {/* X labels */}
                                  {[0, Math.round(maxV / 2), maxV].map((v, i) => (
                                    <text key={i} x={pad + (i / 2) * chartW} y={svgH - pad + 14} textAnchor="middle" fontSize="9" fill="#94a3b8">{v}</text>
                                  ))}
                                  {/* Bars */}
                                  {bins.map((count, i) => {
                                    const barW = chartW / nBins;
                                    const barH = maxCount > 0 ? (count / maxCount) * chartH : 0;
                                    return <rect key={i} x={pad + i * barW} y={svgH - pad - barH} width={barW - 1} height={barH} fill={color} opacity="0.85" rx="1"/>;
                                  })}
                                  <text x={svgW / 2} y={svgH - 2} textAnchor="middle" fontSize="9" fill="#64748b">{key}</text>
                                  <text x={12} y={svgH / 2 - pad / 2} textAnchor="middle" fontSize="9" fill="#64748b" transform={`rotate(-90, 12, ${svgH / 2 - pad / 2})`}>Count</text>
                                </svg>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* 8. Rolling Mean Line Chart with Tooltip */}
                    <div className="chart-card" style={{ gridColumn:'1 / -1' }}>
                      <h3>How Pokémon Power Evolves Along the Pokédex</h3>
                      <p style={{ color:'#64748b', fontSize:'0.9rem', marginBottom:'16px' }}>Rolling mean (window = 30) of battle stats ordered by Pokédex index. Hover to inspect values.</p>
                      {(() => {
                        const sorted = [...pokemon].sort((a, b) => (Number(a["#"]) || 0) - (Number(b["#"]) || 0));
                        const statsLine = [
                          { key:"Attack", color:"#FF595E" }, { key:"Defense", color:"#6A4C93" },
                          { key:"Sp. Atk", color:"#FFCA3A" }, { key:"Speed", color:"#1982C4" }
                        ];
                        const win = 30;
                        const rollingData = {};
                        statsLine.forEach(({ key }) => {
                          const raw = sorted.map(p => Number(p[key]) || 0);
                          const rm = [];
                          for (let i = 0; i < raw.length; i++) {
                            const start = Math.max(0, i - win + 1);
                            const slice = raw.slice(start, i + 1);
                            rm.push(slice.reduce((a, b) => a + b, 0) / slice.length);
                          }
                          rollingData[key] = rm;
                        });
                        const allVals = Object.values(rollingData).flat();
                        const minY = Math.floor(Math.min(...allVals) / 10) * 10;
                        const maxY = Math.ceil(Math.max(...allVals) / 10) * 10;
                        const svgW = 900; const svgH = 300; const padL = 50; const padR = 10; const padT = 10; const padB = 35;
                        const chartW = svgW - padL - padR; const chartH = svgH - padT - padB;
                        const n = sorted.length;
                        const toX = (i) => padL + (i / (n - 1)) * chartW;
                        const toY = (v) => padT + chartH - ((v - minY) / (maxY - minY)) * chartH;
                        return (
                          <div>
                            <div style={{ position:'relative' }}>
                              <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width:'100%' }} preserveAspectRatio="xMidYMid meet"
                                onMouseMove={(e) => {
                                  const svg = e.currentTarget;
                                  const rect = svg.getBoundingClientRect();
                                  const mouseX = ((e.clientX - rect.left) / rect.width) * svgW;
                                  const idx = Math.round(((mouseX - padL) / chartW) * (n - 1));
                                  if (idx < 0 || idx >= n) { svg.dataset.tooltipIdx = ''; svg.parentElement.querySelector('.line-tooltip')?.setAttribute('style','display:none'); return; }
                                  const tip = svg.parentElement.querySelector('.line-tooltip');
                                  const crosshair = svg.querySelector('.crosshair-line');
                                  if (crosshair) { crosshair.setAttribute('x1', toX(idx)); crosshair.setAttribute('x2', toX(idx)); crosshair.setAttribute('style',''); }
                                  if (tip) {
                                    const pctX = ((e.clientX - rect.left) / rect.width) * 100;
                                    const flipLeft = pctX > 75;
                                    tip.innerHTML = `<div style="font-weight:700;margin-bottom:4px">Pokédex #${sorted[idx]?.["#"] || idx}</div>` +
                                      statsLine.map(({ key, color }) => `<div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></span>${key}: <strong>${rollingData[key][idx].toFixed(1)}</strong></div>`).join('');
                                    tip.setAttribute('style', `display:block;position:absolute;top:10px;${flipLeft ? 'right' : 'left'}:${flipLeft ? (100-pctX+2) : (pctX+2)}%;background:rgba(15,23,42,0.9);color:white;padding:10px 14px;border-radius:10px;font-size:0.78rem;pointer-events:none;z-index:10;line-height:1.6;backdrop-filter:blur(8px)`);
                                  }
                                  statsLine.forEach(({ key }) => {
                                    const dot = svg.querySelector(`.dot-${key.replace(/\.\s/g,'')}`);
                                    if (dot) { dot.setAttribute('cx', toX(idx)); dot.setAttribute('cy', toY(rollingData[key][idx])); dot.setAttribute('style',''); }
                                  });
                                }}
                                onMouseLeave={(e) => {
                                  const svg = e.currentTarget;
                                  svg.querySelector('.crosshair-line')?.setAttribute('style','display:none');
                                  svg.parentElement.querySelector('.line-tooltip')?.setAttribute('style','display:none');
                                  statsLine.forEach(({ key }) => { svg.querySelector(`.dot-${key.replace(/\.\s/g,'')}`)?.setAttribute('style','display:none'); });
                                }}
                              >
                                {/* Grid lines */}
                                {Array.from({ length: 6 }, (_, i) => {
                                  const v = minY + (i / 5) * (maxY - minY);
                                  return (
                                    <g key={i}>
                                      <line x1={padL} y1={toY(v)} x2={svgW - padR} y2={toY(v)} stroke="#e2e8f0" strokeWidth="0.5"/>
                                      <text x={padL - 5} y={toY(v) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{Math.round(v)}</text>
                                    </g>
                                  );
                                })}
                                {/* Lines */}
                                {statsLine.map(({ key, color }) => (
                                  <polyline key={key} fill="none" stroke={color} strokeWidth="2" opacity="0.9"
                                    points={rollingData[key].map((v, i) => `${toX(i)},${toY(v)}`).join(' ')} />
                                ))}
                                {/* Crosshair */}
                                <line className="crosshair-line" x1={0} y1={padT} x2={0} y2={svgH - padB} stroke="#6366f1" strokeWidth="1" strokeDasharray="4,3" style={{ display:'none' }}/>
                                {/* Hover dots */}
                                {statsLine.map(({ key, color }) => (
                                  <circle key={`dot-${key}`} className={`dot-${key.replace(/\.\s/g,'')}`} cx={0} cy={0} r="4" fill={color} stroke="white" strokeWidth="2" style={{ display:'none' }}/>
                                ))}
                                {/* Axis labels */}
                                <text x={svgW / 2} y={svgH - 3} textAnchor="middle" fontSize="11" fill="#64748b">Pokédex Index</text>
                                <text x={15} y={svgH / 2} textAnchor="middle" fontSize="11" fill="#64748b" transform={`rotate(-90,15,${svgH / 2})`}>Rolling Mean</text>
                              </svg>
                              <div className="line-tooltip" style={{ display:'none' }}></div>
                            </div>
                            {/* Legend */}
                            <div style={{ display:'flex', justifyContent:'center', gap:'24px', marginTop:'12px', flexWrap:'wrap' }}>
                              {statsLine.map(({ key, color }) => (
                                <span key={key} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'0.85rem' }}>
                                  <span style={{ width:20, height:3, background:color, display:'inline-block', borderRadius:2 }}></span>{key}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* 9. Radar Charts per Type */}
                    <div className="chart-card" style={{ gridColumn:'1 / -1' }}>
                      <h3>Average Pokémon Stats per Type</h3>
                      <p style={{ color:'#64748b', fontSize:'0.9rem', marginBottom:'20px' }}>Radar chart showing the stat profile of each primary type</p>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'16px' }}>
                        {(() => {
                          const typeColors = {"Grass":"#78C850","Fire":"#F08030","Water":"#6890F0","Electric":"#F8D030","Psychic":"#F85888","Ice":"#98D8D8","Dragon":"#7038F8","Dark":"#705848","Fairy":"#EE99AC","Normal":"#A8A878","Fighting":"#C03028","Flying":"#A890F0","Poison":"#A040A0","Ground":"#E0C068","Rock":"#B8A038","Bug":"#A8B820","Ghost":"#705898","Steel":"#B8B8D0"};
                          const stats = ["HP","Attack","Defense","Sp. Atk","Sp. Def","Speed"];
                          const typeSums = {}; const typeCounts = {};
                          pokemon.forEach(p => {
                            const t = p["Type 1"]; if (!typeSums[t]) { typeSums[t] = {}; stats.forEach(s => typeSums[t][s] = 0); typeCounts[t] = 0; }
                            stats.forEach(s => typeSums[t][s] += Number(p[s]) || 0); typeCounts[t]++;
                          });
                          const maxStat = 150;
                          const cx = 100; const cy = 100; const r = 75;
                          const angleStep = (2 * Math.PI) / stats.length;
                          const toPoint = (val, i) => {
                            const frac = Math.min(val / maxStat, 1);
                            const angle = i * angleStep - Math.PI / 2;
                            return [cx + frac * r * Math.cos(angle), cy + frac * r * Math.sin(angle)];
                          };
                          return Object.entries(typeSums).map(([type, sums]) => {
                            const means = stats.map(s => sums[s] / typeCounts[type]);
                            const pts = means.map((v, i) => toPoint(v, i));
                            const polyStr = pts.map(p => p.join(',')).join(' ');
                            const color = typeColors[type] || '#999';
                            return (
                              <div key={type} style={{ textAlign:'center' }}>
                                <div style={{ color, fontWeight:700, fontSize:'0.9rem', marginBottom:'4px' }}>{type}</div>
                                <svg viewBox="0 0 200 200" style={{ width:'100%', maxWidth:'200px' }}>
                                  {/* Guide rings */}
                                  {[0.25, 0.5, 0.75, 1].map(f => (
                                    <polygon key={f} fill="none" stroke="#e2e8f0" strokeWidth="0.5"
                                      points={stats.map((_, i) => { const a = i * angleStep - Math.PI / 2; return `${cx + f * r * Math.cos(a)},${cy + f * r * Math.sin(a)}`; }).join(' ')} />
                                  ))}
                                  {/* Axis lines */}
                                  {stats.map((_, i) => { const a = i * angleStep - Math.PI / 2; return <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)} stroke="#e2e8f0" strokeWidth="0.5"/>; })}
                                  {/* Data polygon */}
                                  <polygon points={polyStr} fill={color} fillOpacity="0.3" stroke={color} strokeWidth="2"/>
                                  {/* Labels */}
                                  {stats.map((s, i) => {
                                    const a = i * angleStep - Math.PI / 2;
                                    const lx = cx + (r + 18) * Math.cos(a); const ly = cy + (r + 18) * Math.sin(a);
                                    return <text key={s} x={lx} y={ly + 3} textAnchor="middle" fontSize="8" fill="#64748b">{s}</text>;
                                  })}
                                </svg>
                              </div>
                            );
                          });
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

                {/* RESULT SHOWS FIRST - ABOVE EVERYTHING */}
                {spiritResult && (
                  <div className="quiz-result" style={{
                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    borderRadius: "24px",
                    padding: "40px",
                    textAlign: "center",
                    color: "white",
                    marginBottom: "40px",
                    boxShadow: "0 20px 60px rgba(102, 126, 234, 0.4)"
                  }}>
                    <h3 style={{ margin: "0 0 20px", fontSize: "1.4rem", color: "rgba(255,255,255,0.9)" }}>Your Spirit Pokémon</h3>
                    <img src={spiritResult.img} alt={spiritResult.name} style={{ width: "180px", margin: "0 auto", display: "block", background: "white", borderRadius: "20px", padding: "15px" }} />
                    <div className="spirit-name" style={{ fontSize: "2rem", fontWeight: 800, marginTop: "20px" }}>{spiritResult.name}</div>
                    <div className="spirit-desc" style={{ marginBottom: "24px", opacity: 0.9 }}>{spiritResult.desc}</div>
                    <button style={{
                      padding: "14px 32px",
                      borderRadius: "16px",
                      border: "none",
                      background: "white",
                      color: "#667eea",
                      fontSize: "1rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "transform 0.2s"
                    }} onClick={() => { setQuizStep(1); setQuizAnswers([]); setSpiritResult(null); }}>Try Again</button>
                  </div>
                )}

                {/* QUIZ SECTION - BEAUTIFUL HEADER */}
                <div style={{
                  background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                  borderRadius: "24px",
                  padding: "40px",
                  textAlign: "center",
                  color: "white",
                  marginBottom: "40px",
                  boxShadow: "0 20px 60px rgba(245, 87, 108, 0.3)"
                }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: "1.6rem" }}>Find Your Spirit Pokémon</h3>
                  <p style={{ margin: "0 0 24px", opacity: 0.9, textAlign: "center" }}>Analyze your personality traits against our dataset to find your match.</p>
                  <button style={{
                    padding: "18px 48px",
                    borderRadius: "20px",
                    border: "none",
                    background: "white",
                    color: "#f5576c",
                    fontSize: "1.2rem",
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
                    transition: "transform 0.2s, box-shadow 0.2s"
                  }} onClick={() => { setQuizStep(1); setQuizAnswers([]); setSpiritResult(null); }}>
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
                          <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/321.png" alt="Wailord" />
                          <span>Wailord</span>
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
              </section>
            )}

          </>
        ) : null}
      </main>

      {/* --- STICKY BOTTOM ARENA BAR REMOVED --- */}
    </div>
  );
}

export default App;