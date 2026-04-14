const cache = new Map();

function isDuplicate(id) {
  if (cache.has(id)) return true;

  cache.set(id, true);

  setTimeout(() => {
    cache.delete(id);
  }, 30 * 60 * 1000); // 30 min

  return false;
}

module.exports = { isDuplicate };