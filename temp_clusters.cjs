
const fs = require('fs');
const csv = require('csv-parser');
const { kmeans } = require('ml-kmeans');

const results = [];
fs.createReadStream('Pokemon.csv')
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', () => {
    const data = results.map(row => [
      parseFloat(row.HP),
      parseFloat(row.Attack),
      parseFloat(row.Defense),
      parseFloat(row['Sp. Atk']),
      parseFloat(row['Sp. Def']),
      parseFloat(row.Speed)
    ]);

    const means = [];
    const stds = [];
    for (let j = 0; j < data[0].length; j++) {
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i][j];
      const mean = sum / data.length;
      means.push(mean);
      let sumSq = 0;
      for (let i = 0; i < data.length; i++) sumSq += Math.pow(data[i][j] - mean, 2);
      stds.push(Math.sqrt(sumSq / data.length) || 1);
    }
    const scaledData = data.map(row => row.map((val, j) => (val - means[j]) / stds[j]));

    const result = kmeans(scaledData, 6, { initialization: 'kmeans++', seed: 42 });
    
    // Unscale centroids to human readable numbers
    const unscaledCentroids = result.centroids.map(c => c.map((val, j) => val * stds[j] + means[j]));
    
    unscaledCentroids.forEach((c, i) => {
      console.log('Cluster ' + i + ': HP=' + c[0].toFixed(1) + ' Att=' + c[1].toFixed(1) + ' Def=' + c[2].toFixed(1) + ' SpA=' + c[3].toFixed(1) + ' SpD=' + c[4].toFixed(1) + ' Spe=' + c[5].toFixed(1));
    });
  });

