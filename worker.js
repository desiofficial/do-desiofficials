export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API health check
    if (url.pathname === "/api/status") {
      return Response.json({
        brand: "DO DESI OFFICIALS",
        status: "online",
        backend: "connected"
      });
    }

    // All other requests serve the existing website
    return env.ASSETS.fetch(request);
  }
};
