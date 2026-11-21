export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/status") {
      return Response.json({
        brand: "DO DESI OFFICIALS",
        status: "online"
      });
    }

    if (url.pathname === "/api/db-check") {
      try {
        const result = await env.DB.prepare(
          "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table'"
        ).first();

        return Response.json({
          database: "connected",
          tables: result.total
        });
      } catch (error) {
        return Response.json({
          database: "error",
          message: "Database connection failed"
        }, { status: 500 });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
