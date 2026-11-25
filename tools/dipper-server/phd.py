"""Persistent-homology dimension (PHD) of a point cloud, after Tulchinskii et al., NeurIPS 2023.

The sum of minimum-spanning-tree edge lengths over n sampled points grows like n^((d-alpha)/d).
Fitting that growth rate gives the dimension d.
"""
import numpy as np
from scipy.sparse.csgraph import minimum_spanning_tree
from scipy.spatial.distance import cdist

MIN_POINTS = 60


def _mst_length(points, alpha):
    tree = minimum_spanning_tree(cdist(points, points))
    return float(np.power(tree.data, alpha).sum())


def phd(points, alpha=1.0, steps=8, reruns=5, seed=0):
    """Returns the estimated intrinsic dimension of `points` (rows are points)."""
    points = np.unique(np.asarray(points, dtype=np.float64), axis=0)
    total = len(points)
    if total < MIN_POINTS:
        raise ValueError(f"need at least {MIN_POINTS} distinct points, got {total}")
    rng = np.random.default_rng(seed)
    sizes = np.unique(np.linspace(MIN_POINTS // 2, total, steps).astype(int))
    lengths = []
    for n in sizes:
        runs = [_mst_length(points[rng.choice(total, n, replace=False)], alpha) for _ in range(reruns)]
        lengths.append(np.median(runs))
    slope = np.polyfit(np.log(sizes), np.log(lengths), 1)[0]
    if slope >= 1:
        raise ValueError("growth rate too steep to estimate a dimension")
    return float(alpha / (1 - slope))
