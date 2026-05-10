const fs = require('fs');
const csv = require('csv-parser');

const mlData = JSON.parse(fs.readFileSync('../src/ml_data.json', 'utf8'));
const results = [];

fs.createReadStream('../Pokemon.csv')
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', () => {
    const appProfiles = [
      { id: 0, name: "Balanced", avgStats: [67, 84, 66, 77, 70, 98] },
      { id: 1, name: "Wall / Tank", avgStats: [63, 91, 140, 61, 93, 49] },
      { id: 2, name: "Elite Powerhouse", avgStats: [90, 121, 93, 122, 98, 100] },
      { id: 3, name: "Weak / Unevolved", avgStats: [50, 54, 52, 47, 48, 49] },
      { id: 4, name: "Special Attacker", avgStats: [73, 66, 82, 94, 99, 62] },
      { id: 5, name: "Tank / HP", avgStats: [101, 98, 79, 69, 73, 58] }
    ];

    console.log('=== VERIFICATION: App.jsx vs Real Data ===\n');
    for (let c = 0; c <= 5; c++) {
      const clusterNames = mlData.pca.filter(p => p.cluster === c).map(p => p.name);
      const matched = results.filter(r => clusterNames.includes(r.Name));
      const avg = (arr, key) => {
        const vals = arr.map(r => parseFloat(r[key])).filter(v => !isNaN(v));
        return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      };
      const real = [avg(matched, 'HP'), avg(matched, 'Attack'), avg(matched, 'Defense'), avg(matched, 'Sp. Atk'), avg(matched, 'Sp. Def'), avg(matched, 'Speed')];
      const app = appProfiles[c].avgStats;
      const match = real.every((v, i) => Math.abs(v - app[i]) <= 1);
      console.log(`Cluster ${c} (${appProfiles[c].name}): ${match ? '✅ MATCH' : '❌ MISMATCH'}`);
      console.log(`  Real: HP=${real[0]}, Atk=${real[1]}, Def=${real[2]}, SpA=${real[3]}, SpD=${real[4]}, Spd=${real[5]}`);
      console.log(`  App:  HP=${app[0]}, Atk=${app[1]}, Def=${app[2]}, SpA=${app[3]}, SpD=${app[4]}, Spd=${app[5]}`);
      console.log('');
    }
  });
