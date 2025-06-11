// utils/fuzzymatch.js

// Utility: Levenshtein distance
function levenshtein(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  matrix[0] = Array.from({ length: a.length + 1 }, (_, i) => i);

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
    }
  }

  return matrix[b.length][a.length];
}

// Fuzzy string matcher using Levenshtein similarity
function fuzzyMatch(a, b, threshold = 0.65) {
  if (!a || !b) return false;

  a = a.toLowerCase();
  b = b.toLowerCase();

  // Quick partial match
  if (a.includes(b) || b.includes(a)) return true;

  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return false;

  const similarity = 1 - distance / maxLen;

  // Optional debugging
  // console.log(`🔎 Comparing "${a}" vs "${b}" = ${similarity.toFixed(2)}`);

  return similarity >= threshold;
}

// Export the functions
module.exports = {
  fuzzyMatch,
  levenshtein,
};
