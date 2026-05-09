const fs = require('fs');
const csv = require('csv-parser');
const { PCA } = require('ml-pca');
const { kmeans } = require('ml-kmeans');

const results = [];
fs.createReadStream('../Pokemon.csv')
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', () => {
    // Features to use
    const data = results.map(row => [
      parseFloat(row.HP),
      parseFloat(row.Attack),
      parseFloat(row.Defense),
      parseFloat(row['Sp. Atk']),
      parseFloat(row['Sp. Def']),
      parseFloat(row.Speed)
    ]);

    // Standard Scaler
    const means = [];
    const stds = [];
    for (let j = 0; j < data[0].length; j++) {
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i][j];
      const mean = sum / data.length;
      means.push(mean);
      
      let sumSq = 0;
      for (let i = 0; i < data.length; i++) sumSq += Math.pow(data[i][j] - mean, 2);
      const std = Math.sqrt(sumSq / data.length);
      stds.push(std || 1);
    }

    const scaledData = data.map(row => row.map((val, j) => (val - means[j]) / stds[j]));

    // PCA
    const pca = new PCA(scaledData);
    const pcaData = pca.predict(scaledData, { nComponents: 2 }).to2DArray();

    // KMeans Elbow & Silhouette
    const maxK = 10;
    const inertias = [];
    const silhouetteScores = [];
    let bestK = 2;
    let bestScore = -1;
    let bestLabels = [];

    // Helper: Euclidean distance
    const dist = (a, b) => Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));

    for (let k = 2; k <= maxK; k++) {
      const result = kmeans(scaledData, k, { initialization: 'kmeans++' });
      
      // Calculate Inertia (sum of squared distances to closest centroid)
      let inertia = 0;
      for (let i = 0; i < scaledData.length; i++) {
        const c = result.clusters[i];
        inertia += Math.pow(dist(scaledData[i], result.centroids[c]), 2);
      }
      inertias.push({ k, inertia });

      // Calculate Silhouette
      // a(i): average distance to own cluster
      // b(i): minimum average distance to other clusters
      let totalSil = 0;
      for (let i = 0; i < scaledData.length; i++) {
        const c = result.clusters[i];
        
        const distsToCluster = new Array(k).fill(0);
        const countsInCluster = new Array(k).fill(0);
        
        for (let j = 0; j < scaledData.length; j++) {
          if (i === j) continue;
          const otherC = result.clusters[j];
          distsToCluster[otherC] += dist(scaledData[i], scaledData[j]);
          countsInCluster[otherC]++;
        }

        let a = countsInCluster[c] > 0 ? distsToCluster[c] / countsInCluster[c] : 0;
        let b = Infinity;
        for (let j = 0; j < k; j++) {
          if (j !== c && countsInCluster[j] > 0) {
            const avgDist = distsToCluster[j] / countsInCluster[j];
            if (avgDist < b) b = avgDist;
          }
        }
        
        const s = (b - a) / Math.max(a, b);
        totalSil += isNaN(s) ? 0 : s;
      }
      const avgSil = totalSil / scaledData.length;
      silhouetteScores.push({ k, score: avgSil });

      if (avgSil > bestScore) {
        bestScore = avgSil;
        bestK = k;
        bestLabels = result.clusters;
      }
    }

    const output = {
      inertias,
      silhouetteScores,
      bestK,
      pca: pcaData.map((coords, i) => ({
        x: coords[0],
        y: coords[1],
        cluster: bestLabels[i],
        name: results[i].Name,
        type1: results[i]['Type 1']
      }))
    };

    fs.writeFileSync('ml_data.json', JSON.stringify(output, null, 2));
    console.log('Done writing ml_data.json');
  });
