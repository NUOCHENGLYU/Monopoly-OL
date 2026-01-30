import { createServer } from "./server";

const { httpServer } = createServer();
const port = Number(process.env.PORT ?? 3001);

httpServer.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
