const fs = require('fs');

// Parse CSV manually (no dependencies)
const csvText = fs.readFileSync('Pokemon.csv', 'utf8');
const lines = csvText.trim().split(/\r?\n/);
const headers = lines[0].split(',');
const csvData = lines.slice(1).map(line => {
  const vals = line.split(',');
  const obj = {};
  headers.forEach((h, i) => obj[h.trim()] = (vals[i] || '').trim());
  return obj;
});

// Load ml_data.json
const mlData = JSON.parse(fs.readFileSync('src/ml_data.json', 'utf8'));

// App profiles (from App.jsx clusterProfiles)
const appProfiles = [
  { id: 0, name: "Balanced", avgStats: [67, 84, 66, 77, 70, 98] },
  { id: 1, name: "Wall / Tank", avgStats: [63, 91, 140, 61, 93, 49] },
  { id: 2, name: "Elite Powerhouse", avgStats: [90, 121, 93, 122, 98, 100] },
  { id: 3, name: "Weak / Unevolved", avgStats: [50, 54, 52, 47, 48, 49] },
  { id: 4, name: "Special Attacker", avgStats: [73, 66, 82, 94, 99, 62] },
  { id: 5, name: "Tank / HP", avgStats: [101, 98, 79, 69, 73, 58] }
];

// Filter dropdown labels (from App.jsx line ~716-723)
const filterLabels = [
  { id: 0, label: "Balanced" },
  { id: 1, label: "Physical Attacker" },
  { id: 2, label: "Low Stats (weak)" },
  { id: 3, label: "Special Attacker" },
  { id: 4, label: "Wall/Tank" },
  { id: 5, label: "Tank/Defensive" }
];

console.log('=== CLUSTER VERIFICATION: ml_data.json vs Pokemon.csv ===\n');
console.log(`bestK from ml_data.json: ${mlData.bestK}`);
console.log(`Total Pokemon in pca array: ${mlData.pca.length}`);
console.log(`Total Pokemon in CSV: ${csvData.length}\n`);

// Count per cluster
const clusterCounts = {};
mlData.pca.forEach(p => {
  clusterCounts[p.cluster] = (clusterCounts[p.cluster] || 0) + 1;
});
console.log('Cluster sizes:', clusterCounts, '\n');

// Compute real averages per cluster
console.log('=== REAL AVG STATS vs APP PROFILE STATS ===\n');
const statKeys = ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed'];

for (let c = 0; c <= 5; c++) {
  const clusterNames = mlData.pca.filter(p => p.cluster === c).map(p => p.name);
  const matched = csvData.filter(r => clusterNames.includes(r.Name));
  
  const realAvg = statKeys.map(key => {
    const vals = matched.map(r => parseFloat(r[key])).filter(v => !isNaN(v));
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  });
  
  const app = appProfiles[c].avgStats;
  const diffs = realAvg.map((v, i) => v - app[i]);
  const match = diffs.every(d => Math.abs(d) <= 2);
  
  console.log(`Cluster ${c} - "${appProfiles[c].name}" (${matched.length} matched / ${clusterNames.length} in pca):`);
  console.log(`  Real:  HP=${realAvg[0]}, Atk=${realAvg[1]}, Def=${realAvg[2]}, SpA=${realAvg[3]}, SpD=${realAvg[4]}, Spd=${realAvg[5]}`);
  console.log(`  App:   HP=${app[0]}, Atk=${app[1]}, Def=${app[2]}, SpA=${app[3]}, SpD=${app[4]}, Spd=${app[5]}`);
  console.log(`  Diff:  ${diffs.map((d, i) => `${statKeys[i]}=${d > 0 ? '+' : ''}${d}`).join(', ')}`);
  console.log(`  ${match ? '✅ MATCH' : '❌ MISMATCH'}\n`);
}

// Check: Filter dropdown names vs clusterProfile names
console.log('\n=== FILTER DROPDOWN LABELS vs CLUSTER PROFILE NAMES ===\n');
filterLabels.forEach(fl => {
  const profileName = appProfiles[fl.id].name;
  const match = fl.label === profileName;
  console.log(`  Cluster ${fl.id}: Filter="${fl.label}" vs Profile="${profileName}" → ${match ? '✅' : '❌ MISMATCH'}`);
});

// Check some sample Pokemon cluster assignments
console.log('\n\n=== SAMPLE POKEMON CLUSTER ASSIGNMENTS ===\n');
const samples = ['Pikachu', 'Charizard', 'Mewtwo', 'MewtwoMega Mewtwo X', 'Caterpie', 'Geodude', 'Snorlax', 'Alakazam', 'Machamp', 'Steelix'];
samples.forEach(name => {
  const pcaEntry = mlData.pca.find(p => p.name === name);
  if (pcaEntry) {
    const profile = appProfiles[pcaEntry.cluster];
    const csvEntry = csvData.find(r => r.Name === name);
    const total = csvEntry ? parseInt(csvEntry.Total) : '?';
    console.log(`  ${name}: Cluster ${pcaEntry.cluster} (${profile.name}) - Total=${total}`);
  } else {
    console.log(`  ${name}: NOT FOUND in ml_data.json`);
  }
});

// Check cluster images mapping
console.log('\n\n=== CLUSTER IMAGES IN PUBLIC FOLDER ===\n');
const publicFiles = fs.readdirSync('public').filter(f => f.startsWith('cluster_img_'));
console.log(`Found ${publicFiles.length} cluster images: ${publicFiles.join(', ')}`);
