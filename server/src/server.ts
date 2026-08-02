import "dotenv/config";
import app from "./api/index.js";
import { createServer } from "node:http";
import { createSocketServer } from "./socket/index.js";

const httpServer = createServer(app);
createSocketServer(httpServer);

const PORT = Number(process.env.PORT) || 5000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});