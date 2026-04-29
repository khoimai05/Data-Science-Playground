# Data Science Playground

Interactive, browser-based visualizations of core machine learning algorithms — built with vanilla HTML, CSS, and Canvas. No frameworks, no dependencies, no build step.

**[Live demos](./index.html)** · click to drop points, tweak parameters, and watch the math happen in real time.

---

## Demos

### Linear Regression
Fit `y = mx + b` by minimizing mean squared error. Watch gradient descent nudge the line downhill step by step, with residuals drawn live so you can see what's being minimized.


### Logistic Regression
Binary classification via sigmoid + cross-entropy loss. Drop blue (class 0) and red (class 1) points, hit fit, and watch the decision boundary converge with gradient descent — no closed form, pure iteration.

### K-Nearest Neighbors
No training step. The decision regions repaint in real time as you add points or adjust K. Switch between Euclidean and Manhattan distance to see how the metric shapes the boundaries.

### K-Means Clustering
Unsupervised centroid convergence, animated step by step. Uses **k-means++** initialization to avoid bad starts. Tracks within-cluster sum of squares (WCSS) so you can watch it drop. Try the ring dataset to see where k-means struggles.

### Principal Component Analysis
Drop a cloud of points and see the eigenvectors — the axes of maximum variance — drawn live. Intuition for what PCA is actually doing before the matrix algebra.

---

## How to Run

No install required. Just open `index.html` in a browser:

```bash
# clone and open
git clone https://github.com/khoimai05/data-science-playground.git
cd data-science-playground
open index.html   # macOS
# or just drag index.html into your browser
```

Everything runs client-side. No server needed.

---

## Project Structure

```
data-science-playground/
├── index.html                  # landing page / demo list
├── linear-regression/
│   └── index.html              # self-contained (script inline)
├── logistic-regression/
│   ├── index.html
│   └── app.js
├── knn/
│   ├── index.html
│   └── app.js
├── kmeans/
│   ├── index.html
│   └── app.js
└── pca/
    ├── index.html
    └── app.js
```

---

## Design

- **Dark, minimal UI** — Sora + JetBrains Mono, `#0a0a0a` background
- **Canvas-based rendering** — all visuals drawn with the 2D Canvas API, no SVG or charting libraries
- **Pixel-space region fills** — decision boundaries and Voronoi regions computed by classifying a low-res pixel grid and scaling it up
- **Animated gradient descent** — fit loops run via `requestAnimationFrame` / `setTimeout` so you see each step

---

## Concepts Covered

| Demo | Key ideas |
|---|---|
| Linear Regression | MSE loss, gradient descent, residuals |
| Logistic Regression | Sigmoid, cross-entropy, decision boundary |
| KNN | Non-parametric classification, distance metrics, decision regions |
| K-Means | Unsupervised clustering, k-means++, WCSS, convergence |
| PCA | Eigenvectors, variance, dimensionality reduction |

---

*Built by Khoi — interactive ML demos for learning and intuition.*
