"use strict";

require("./neon-query-cache");

const { startServer } = require("./server-core");

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
