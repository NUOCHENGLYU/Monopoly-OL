import { createServer } from "./server";

const seedMode = (process.env.SEED_MODE ?? "off").toLowerCase();
const rngSeed =
  seedMode === "fixed" || seedMode === "true"
    ? Number(process.env.RNG_SEED ?? 1)
    : undefined;

const { httpServer } = createServer({ rngSeed });
const port = Number(process.env.PORT ?? 3001);

httpServer.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
