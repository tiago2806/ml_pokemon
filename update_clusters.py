
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
import json

print('A carregar o dataset...')
dataset = pd.read_csv('Pokemon.csv')
features = ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed']
dataset_num = dataset[features]

scaler = StandardScaler()
X_scaled = scaler.fit_transform(dataset_num)

print('A aplicar PCA...')
pca = PCA(n_components=2, random_state=42)
X_pca = pca.fit_transform(X_scaled)

print('A executar KMeans com random_state=42...')
kmeans = KMeans(n_clusters=6, random_state=42, n_init=10)
labels = kmeans.fit_predict(X_scaled)

pca_data = []
for i in range(len(dataset)):
    pca_data.append({
        'x': float(X_pca[i, 0]),
        'y': float(X_pca[i, 1]),
        'cluster': int(labels[i]),
        'name': dataset.loc[i, 'Name'],
        'type1': dataset.loc[i, 'Type 1']
    })

with open('src/ml_data.json', 'w') as f:
    json.dump({'bestK': 6, 'pca': pca_data}, f, indent=2)

print('SUCESSO: src/ml_data.json foi atualizado com as alocações exatas do teu modelling notebook!')

