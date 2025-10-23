/**
 * Root alchemy.run.ts - Entry point for deploying all apps together
 *
 * For individual app deployments, use:
 *   - turbo dev (runs all apps via their individual alchemy.run.ts files)
 *   - turbo deploy (deploys all apps in dependency order)
 *   - turbo destroy (destroys all apps in reverse dependency order)
 *
 * Or use --app flag with individual apps:
 *   - alchemy dev --app server
 *   - alchemy dev --app admin
 *   - alchemy dev --app store
 */

import alchemy from "alchemy";
import { admin } from "./apps/admin/alchemy.run";
import { server } from "./apps/server/alchemy.run";
import { storev2 } from "./apps/storev2/alchemy.run";

const app = await alchemy("vit-store");

console.log(`Server   -> ${server.url}`);
console.log(`Admin    -> ${admin.url}`);
console.log(`Store v2 -> ${storev2.url}`);

await app.finalize();
