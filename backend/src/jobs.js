// Tracks the one in-process conversion job per book, so it can be cancelled from another request.
// There's no queue/worker here (single Node process) - just an AbortController per running bookId.
const jobs = new Map(); // bookId -> AbortController

function startJob(bookId) {
  const controller = new AbortController();
  jobs.set(bookId, controller);
  return controller;
}

function endJob(bookId) {
  jobs.delete(bookId);
}

// Returns true if a running job was found and asked to stop, false if there was nothing to cancel
// (e.g. it already finished, or the server restarted and the in-memory registry is empty).
function cancelJob(bookId) {
  const controller = jobs.get(bookId);
  if (!controller) return false;
  controller.abort();
  return true;
}

module.exports = { startJob, endJob, cancelJob };
